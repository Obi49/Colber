"""Lightweight httpx wrapper used by every service client.

Responsibilities:
  - URL building (base + path + querystring with ``None`` values skipped)
  - Auth header injection (``Authorization: Bearer ...`` if ``auth_token`` set)
  - JSON encoding / decoding
  - Envelope unwrapping (``{"ok": true, "data"}`` -> data,
    ``{"ok": false, "error"}`` -> raise)
  - Timeout via httpx
  - Retry with exponential backoff on 5xx and transport failures

Mirrors ``apps/sdk-typescript/src/http.ts`` byte-for-byte in semantics.
The wrapper is deliberately small and dependency-free beyond httpx so the
SDK has minimal runtime weight.
"""

from __future__ import annotations

import json as _json
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Literal
from urllib.parse import quote

import httpx

from .envelope import is_error_envelope, is_ok_envelope
from .errors import ColberApiError, ColberNetworkError
from .types import RetryConfig

HttpMethod = Literal["GET", "POST", "PATCH", "DELETE", "PUT"]

# Default sleep used between retries. Tests inject a no-op stub.
SleepFunc = Callable[[float], None]


@dataclass(frozen=True, slots=True)
class HttpClientOptions:
    """Bundle of options shared across every service call.

    Constructed once by :class:`ColberClient` and forwarded into every
    service-level call.
    """

    fetch: Callable[..., httpx.Response]
    timeout_s: float
    retries: RetryConfig
    auth_token: str | None = None
    sleep: SleepFunc | None = None


@dataclass(frozen=True, slots=True)
class RequestParams:
    """Per-request parameters."""

    method: HttpMethod
    base_url: str
    path: str
    query: dict[str, str | int | float | bool | None] | None = None
    body: Any = None
    expect_no_body: bool = False
    # Sentinel used to differentiate "no body" from "body was None".
    # We rely on `body=None` actually meaning no body, so callers shouldn't
    # send a literal None payload.


def _default_sleep(seconds: float) -> None:
    """Default inter-retry sleep (real time)."""
    time.sleep(seconds)


def build_url(
    base: str,
    path: str,
    query: dict[str, str | int | float | bool | None] | None = None,
) -> str:
    """Pure helper — joins ``base`` and ``path`` and appends a querystring.

    - Trailing slashes are stripped from ``base``.
    - ``path`` is normalised to start with ``/``.
    - ``None`` query values are skipped.
    - The querystring is omitted entirely when no values remain.

    Mirror of the TS ``buildUrl`` helper in ``http.ts``.
    """
    trimmed_base = base.rstrip("/")
    normalised_path = path if path.startswith("/") else f"/{path}"
    url = f"{trimmed_base}{normalised_path}"
    if query:
        parts: list[str] = []
        for key, value in query.items():
            if value is None:
                continue
            # `quote_via=quote` escapes URL-unsafe chars consistently
            # with the TS URLSearchParams behaviour.
            parts.append(f"{quote(str(key), safe='')}={quote(str(value), safe='')}")
        if parts:
            url += "?" + "&".join(parts)
    return url


def _is_retriable_status(status: int) -> bool:
    """5xx — retriable. Mirror of ``isRetriableStatus`` in TS."""
    return 500 <= status <= 599


def _run_once(
    options: HttpClientOptions,
    params: RequestParams,
) -> Any:
    """Run a single HTTP attempt, including timeout.

    Returns the parsed body (already envelope-checked) on 2xx, or raises
    :class:`ColberApiError` on a 4xx/5xx with a parseable error envelope.
    Raises :class:`ColberNetworkError` on transport failures; the caller
    decides whether to retry.
    """
    url = build_url(params.base_url, params.path, params.query)

    headers: dict[str, str] = {"accept": "application/json"}
    if params.body is not None:
        headers["content-type"] = "application/json"
    if options.auth_token is not None:
        headers["authorization"] = f"Bearer {options.auth_token}"

    request_kwargs: dict[str, Any] = {
        "method": params.method,
        "url": url,
        "headers": headers,
        "timeout": options.timeout_s,
    }
    if params.body is not None:
        request_kwargs["content"] = _json.dumps(params.body, ensure_ascii=False).encode("utf-8")

    try:
        response = options.fetch(**request_kwargs)
    except httpx.TimeoutException as cause:
        raise ColberNetworkError(
            code="TIMEOUT",
            message=f"Request timed out after {options.timeout_s}s: {params.method} {url}",
            cause=cause,
        ) from cause
    except httpx.HTTPError as cause:
        raise ColberNetworkError(
            code="FETCH_FAILED",
            message=f"fetch failed: {params.method} {url}",
            cause=cause,
        ) from cause

    # 204 / explicit no-body — short-circuit.
    if params.expect_no_body or response.status_code == 204:
        if not (200 <= response.status_code < 300):
            raise ColberApiError(
                code="HTTP_ERROR",
                message=f"HTTP {response.status_code} {response.reason_phrase}",
                status=response.status_code,
            )
        return None

    try:
        parsed: Any = response.json()
    except (ValueError, _json.JSONDecodeError) as cause:
        raise ColberNetworkError(
            code="INVALID_JSON",
            message=f"failed to parse JSON response: {params.method} {url}",
            cause=cause,
        ) from cause

    if 200 <= response.status_code < 300:
        if not is_ok_envelope(parsed):
            raise ColberNetworkError(
                code="INVALID_RESPONSE",
                message=f"unexpected response shape (missing ok/data): {params.method} {url}",
            )
        return parsed["data"]

    if is_error_envelope(parsed):
        raise ColberApiError.from_body(response.status_code, parsed["error"])

    raise ColberApiError(
        code="HTTP_ERROR",
        message=f"HTTP {response.status_code} {response.reason_phrase}",
        status=response.status_code,
    )


def request(options: HttpClientOptions, params: RequestParams) -> Any:
    """Outer driver — runs ``_run_once`` up to ``retries.count + 1`` times.

    Retries on:
      - :class:`ColberNetworkError` (except ``TIMEOUT``).
      - :class:`ColberApiError` with HTTP 5xx.

    Does NOT retry on:
      - ``TIMEOUT`` (user budget already exhausted).
      - 4xx (client error — replaying won't help).

    Backoff is exponential: ``backoff_ms * 2^attempt``.
    """
    sleep = options.sleep if options.sleep is not None else _default_sleep
    max_attempts = options.retries.count + 1
    attempt = 0
    last_error: BaseException | None = None

    while attempt < max_attempts:
        try:
            return _run_once(options, params)
        except (ColberNetworkError, ColberApiError) as err:
            last_error = err

            is_last = attempt == max_attempts - 1
            if is_last:
                break

            retriable = False
            if isinstance(err, ColberNetworkError):
                retriable = err.code != "TIMEOUT"
            elif isinstance(err, ColberApiError):
                retriable = _is_retriable_status(err.status)
            if not retriable:
                break

            delay_ms = options.retries.backoff_ms * (2**attempt)
            sleep(delay_ms / 1000.0)
            attempt += 1

    assert last_error is not None
    raise last_error


# Re-exported for typing-friendliness elsewhere in the SDK.
__all__ = [
    "HttpClientOptions",
    "HttpMethod",
    "RequestParams",
    "build_url",
    "request",
]


# `field` import is here for forward-compat — kept off `__all__`.
_ = field
