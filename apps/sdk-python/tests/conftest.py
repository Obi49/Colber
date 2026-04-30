"""Test fixtures shared across the suite.

The Python SDK uses ``respx`` (the Python equivalent of MSW) to intercept
httpx requests. Each test registers handlers via ``respx_mock.post(...)``
or similar; the ``conftest`` hooks below give every test:

  - ``base_urls``: the static test base-URL map.
  - ``make_client``: factory returning a :class:`PraxisClient` wired to a
    no-op sleep and zero retries by default. Tests that exercise retry
    semantics override these explicitly.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import httpx
import pytest

from praxis_sdk import PraxisClient
from praxis_sdk.types import BaseUrls

from ._helpers import TEST_BASE_URLS


@pytest.fixture
def base_urls() -> BaseUrls:
    """Stable test base URLs. Mirrors ``apps/sdk-typescript/test/fixtures.ts``."""
    return TEST_BASE_URLS


@pytest.fixture
def make_client() -> Callable[..., PraxisClient]:
    """Factory returning a :class:`PraxisClient` with test-friendly defaults.

    Defaults:
      - ``timeout_s=1.0``
      - ``retries=RetryConfig(count=0, backoff_ms=1)``
      - ``sleep`` is a no-op so retry tests don't pause the suite.

    Override any of these via keyword arguments.
    """

    def _make(**overrides: Any) -> PraxisClient:
        kwargs: dict[str, Any] = {
            "timeout_s": 1.0,
            "retries": {"count": 0, "backoff_ms": 1},
            "sleep": lambda _ms: None,
        }
        kwargs.update(overrides)
        return PraxisClient(TEST_BASE_URLS, **kwargs)

    return _make


@pytest.fixture
def make_respx_client() -> Callable[..., PraxisClient]:
    """Factory that injects an ``httpx.Client`` whose ``request`` is a callable.

    respx works on the global httpx transport when used as a context
    manager (``respx.mock``), so the default :class:`PraxisClient` (which
    creates its own ``httpx.Client``) intercepts naturally. This fixture
    exists for tests that want to inspect the raw httpx invocations.
    """

    def _make(**overrides: Any) -> PraxisClient:
        kwargs: dict[str, Any] = {
            "timeout_s": 1.0,
            "retries": {"count": 0, "backoff_ms": 1},
            "sleep": lambda _ms: None,
            "fetch": httpx.Client().request,
        }
        kwargs.update(overrides)
        return PraxisClient(TEST_BASE_URLS, **kwargs)

    return _make
