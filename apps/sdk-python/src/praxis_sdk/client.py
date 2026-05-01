"""``ColberClient`` — the main entry point of the SDK.

Bundles one typed client per service, sharing a single httpx session
configured with timeout / retry / auth. The constructor accepts a fully
explicit base-URL map; convenience factories ``local()`` and
``from_base_url()`` cover the common cases.

Mirror of ``apps/sdk-typescript/src/client.ts`` (snake_case).
"""

from __future__ import annotations

from collections.abc import Callable

import httpx

from ._http import HttpClientOptions
from .services import (
    IdentityService,
    InsuranceService,
    MemoryService,
    NegotiationService,
    ObservabilityService,
    ReputationService,
)
from .types import BaseUrls, RetryConfig, ServiceName

DEFAULT_TIMEOUT_S = 5.0
DEFAULT_RETRIES = RetryConfig(count=2, backoff_ms=100)

#: Default β-VM ports used by :meth:`ColberClient.local`.
DEFAULT_LOCAL_PORTS: dict[ServiceName, int] = {
    "identity": 14001,
    "reputation": 14011,
    "memory": 14021,
    "observability": 14031,
    "negotiation": 14041,
    "insurance": 14051,
}

#: Path mapping used by :meth:`ColberClient.from_base_url` (PROVISIONAL).
DEFAULT_INGRESS_PATHS: dict[ServiceName, str] = {
    "identity": "/identity",
    "reputation": "/reputation",
    "memory": "/memory",
    "observability": "/observability",
    "negotiation": "/negotiation",
    "insurance": "/insurance",
}


class ColberClient:
    """The main entry point. Call ``.identity``, ``.reputation``, etc."""

    identity: IdentityService
    reputation: ReputationService
    memory: MemoryService
    observability: ObservabilityService
    negotiation: NegotiationService
    insurance: InsuranceService

    def __init__(
        self,
        base_urls: BaseUrls,
        *,
        fetch: Callable[..., httpx.Response] | None = None,
        timeout_s: float = DEFAULT_TIMEOUT_S,
        retries: RetryConfig | dict[str, int] | None = None,
        auth_token: str | None = None,
        sleep: Callable[[float], None] | None = None,
    ) -> None:
        """Construct a typed client.

        Args:
            base_urls: Map from service name to base URL.
            fetch: Custom request callable. Signature must accept httpx
                ``method``, ``url``, ``headers``, ``content``, ``timeout``
                kwargs and return an :class:`httpx.Response`. Defaults to
                a shared :class:`httpx.Client` instance. Tests inject
                respx-managed clients here.
            timeout_s: Per-request timeout in seconds. Default: 5.0.
            retries: Retry policy on 5xx and transport failures. Either a
                :class:`RetryConfig` or a dict ``{"count", "backoff_ms"}``.
                Default: ``RetryConfig(count=2, backoff_ms=100)``.
            auth_token: Optional bearer token. Sent as
                ``Authorization: Bearer <token>`` on every request.
            sleep: Override the inter-retry sleep. Tests inject a no-op
                stub. Production leaves this ``None`` and the http layer
                uses ``time.sleep``.
        """
        retries_resolved: RetryConfig
        if retries is None:
            retries_resolved = DEFAULT_RETRIES
        elif isinstance(retries, RetryConfig):
            retries_resolved = retries
        else:
            retries_resolved = RetryConfig(
                count=int(retries["count"]),
                backoff_ms=int(retries["backoff_ms"]),
            )

        if fetch is None:
            # Shared client — keeps the connection pool warm across calls.
            self._owned_client: httpx.Client | None = httpx.Client()
            fetch_impl: Callable[..., httpx.Response] = self._owned_client.request
        else:
            self._owned_client = None
            fetch_impl = fetch

        self._http_opts = HttpClientOptions(
            fetch=fetch_impl,
            timeout_s=timeout_s,
            retries=retries_resolved,
            auth_token=auth_token,
            sleep=sleep,
        )

        self.identity = IdentityService(self._http_opts, base_urls["identity"])
        self.reputation = ReputationService(self._http_opts, base_urls["reputation"])
        self.memory = MemoryService(self._http_opts, base_urls["memory"])
        self.observability = ObservabilityService(self._http_opts, base_urls["observability"])
        self.negotiation = NegotiationService(self._http_opts, base_urls["negotiation"])
        self.insurance = InsuranceService(self._http_opts, base_urls["insurance"])

    def close(self) -> None:
        """Release the underlying httpx connection pool, if owned."""
        if self._owned_client is not None:
            self._owned_client.close()
            self._owned_client = None

    def __enter__(self) -> ColberClient:
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()

    @classmethod
    def local(
        cls,
        *,
        fetch: Callable[..., httpx.Response] | None = None,
        timeout_s: float = DEFAULT_TIMEOUT_S,
        retries: RetryConfig | dict[str, int] | None = None,
        auth_token: str | None = None,
        sleep: Callable[[float], None] | None = None,
    ) -> ColberClient:
        """Return a client wired to the default β-VM ports on ``localhost``.

        Handy for local dev against ``colber-stack/docker-compose.services.yml``.
        """
        base_urls: BaseUrls = {
            "identity": f"http://localhost:{DEFAULT_LOCAL_PORTS['identity']}",
            "reputation": f"http://localhost:{DEFAULT_LOCAL_PORTS['reputation']}",
            "memory": f"http://localhost:{DEFAULT_LOCAL_PORTS['memory']}",
            "observability": f"http://localhost:{DEFAULT_LOCAL_PORTS['observability']}",
            "negotiation": f"http://localhost:{DEFAULT_LOCAL_PORTS['negotiation']}",
            "insurance": f"http://localhost:{DEFAULT_LOCAL_PORTS['insurance']}",
        }
        return cls(
            base_urls,
            fetch=fetch,
            timeout_s=timeout_s,
            retries=retries,
            auth_token=auth_token,
            sleep=sleep,
        )

    @classmethod
    def from_base_url(
        cls,
        base: str,
        *,
        fetch: Callable[..., httpx.Response] | None = None,
        timeout_s: float = DEFAULT_TIMEOUT_S,
        retries: RetryConfig | dict[str, int] | None = None,
        auth_token: str | None = None,
        sleep: Callable[[float], None] | None = None,
    ) -> ColberClient:
        """Return a client where every service is reached via path-based
        routing under a single base.

        Example: ``https://api.colber.dev/identity``,
        ``https://api.colber.dev/reputation``, ...

        **PROVISIONAL** — assumes a future ingress configuration. The v1
        deployment exposes each service on a dedicated port; use the
        explicit ``base_urls`` constructor for that case.
        """
        trimmed = base.rstrip("/")
        base_urls: BaseUrls = {
            "identity": f"{trimmed}{DEFAULT_INGRESS_PATHS['identity']}",
            "reputation": f"{trimmed}{DEFAULT_INGRESS_PATHS['reputation']}",
            "memory": f"{trimmed}{DEFAULT_INGRESS_PATHS['memory']}",
            "observability": f"{trimmed}{DEFAULT_INGRESS_PATHS['observability']}",
            "negotiation": f"{trimmed}{DEFAULT_INGRESS_PATHS['negotiation']}",
            "insurance": f"{trimmed}{DEFAULT_INGRESS_PATHS['insurance']}",
        }
        return cls(
            base_urls,
            fetch=fetch,
            timeout_s=timeout_s,
            retries=retries,
            auth_token=auth_token,
            sleep=sleep,
        )
