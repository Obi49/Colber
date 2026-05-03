"""Shared types for the public SDK surface.

Each service module re-exports its own request/response types as
``dataclasses``. This module centralises the cross-service types: the
``ServiceName`` literal union, the ``BaseUrls`` mapping, and the
``IdempotentOptions`` dict.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, TypedDict

ServiceName = Literal[
    "identity",
    "reputation",
    "memory",
    "observability",
    "negotiation",
    "insurance",
]


class BaseUrls(TypedDict):
    """Map from service name to base URL.

    Mirrors the TS ``BaseUrls`` type. Pass an instance to
    :class:`colber_sdk.ColberClient` to wire each typed sub-client.
    """

    identity: str
    reputation: str
    memory: str
    observability: str
    negotiation: str
    insurance: str


class IdempotentOptions(TypedDict):
    """Options dict for idempotent endpoints.

    Used internally by the TS SDK's idempotent calls. Python callers pass
    ``idempotency_key`` as a keyword argument directly.
    """

    idempotency_key: str


@dataclass(frozen=True, slots=True)
class RetryConfig:
    """Retry policy for the HTTP client.

    Args:
        count: Maximum number of *extra* attempts after the first try.
            ``count=2`` means up to 3 total attempts.
        backoff_ms: Initial backoff in milliseconds; subsequent attempts
            double the delay (exponential).
    """

    count: int
    backoff_ms: int
