"""Error classes raised by the SDK.

Three concrete subclasses, mutually exclusive at the ``isinstance`` level:

- :class:`ColberApiError` — service responded with ``{"ok": false, "error"}``
  or a non-2xx the SDK couldn't parse as an envelope.
- :class:`ColberNetworkError` — transport failed (httpx error, timeout,
  malformed body).
- :class:`ColberValidationError` — local SDK rejected the call before
  sending. Currently unused, reserved.

All three extend :class:`ColberError` so callers can do a single base catch.

Mirror of ``apps/sdk-typescript/src/errors.ts`` (snake_case).
"""

from __future__ import annotations

from typing import Any, Literal


class ColberError(Exception):
    """Base class for every SDK error."""

    name: str = "ColberError"


class ColberApiError(ColberError):
    """Raised when a service returns a structured error envelope or a
    non-2xx response.

    Carries the wire fields verbatim so callers can branch on ``code``
    (e.g. ``VALIDATION_FAILED``, ``NOT_FOUND``, ``IDEMPOTENCY_REPLAY``).
    """

    name: str = "ColberApiError"

    def __init__(
        self,
        *,
        code: str,
        message: str,
        status: int,
        details: dict[str, Any] | None = None,
        trace_id: str | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.details = details
        self.trace_id = trace_id

    @classmethod
    def from_body(cls, status: int, body: dict[str, Any]) -> ColberApiError:
        """Construct from a parsed ``{"ok": false, "error": ...}`` envelope.

        ``body`` is the inner ``error`` object. Accepts the wire field names
        ``code``, ``message``, ``details``, and ``traceId`` (camelCase).
        """
        details = body.get("details")
        trace_id = body.get("traceId")
        return cls(
            code=str(body["code"]),
            message=str(body["message"]),
            status=status,
            details=details if isinstance(details, dict) else None,
            trace_id=trace_id if isinstance(trace_id, str) else None,
        )

    def to_dict(self) -> dict[str, Any]:
        """Logger-friendly representation."""
        out: dict[str, Any] = {
            "name": self.name,
            "code": self.code,
            "message": self.message,
            "status": self.status,
        }
        if self.details is not None:
            out["details"] = self.details
        if self.trace_id is not None:
            out["trace_id"] = self.trace_id
        return out


ColberNetworkErrorCode = Literal["TIMEOUT", "FETCH_FAILED", "INVALID_RESPONSE", "INVALID_JSON"]


class ColberNetworkError(ColberError):
    """Raised for transport-level failures.

    ``code`` is one of:

    - ``TIMEOUT`` — request exceeded ``timeout_s`` (no retry).
    - ``FETCH_FAILED`` — httpx raised a transport error (retriable).
    - ``INVALID_RESPONSE`` — body was JSON but didn't match the envelope shape.
    - ``INVALID_JSON`` — body wasn't valid JSON.
    """

    name: str = "ColberNetworkError"

    def __init__(
        self,
        *,
        code: ColberNetworkErrorCode,
        message: str,
        cause: BaseException | None = None,
    ) -> None:
        super().__init__(message)
        self.code: ColberNetworkErrorCode = code
        self.message = message
        if cause is not None:
            # Mirror the TS `cause` option — preserves the original exception
            # for debuggers/loggers without forcing it onto the chain.
            self.__cause__ = cause


class ColberValidationError(ColberError):
    """Raised when the SDK rejects the call locally (currently unused; reserved)."""

    name: str = "ColberValidationError"

    def __init__(self, message: str, path: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.path = path
