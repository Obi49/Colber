"""Per-service typed clients.

Each module exposes a single class plus its request/response dataclasses.
Public re-exports happen at the package root (``praxis_sdk``).
"""

from __future__ import annotations

from .identity import IdentityService
from .insurance import InsuranceService
from .memory import MemoryService
from .negotiation import NegotiationService
from .observability import ObservabilityService
from .reputation import ReputationService

__all__ = [
    "IdentityService",
    "InsuranceService",
    "MemoryService",
    "NegotiationService",
    "ObservabilityService",
    "ReputationService",
]
