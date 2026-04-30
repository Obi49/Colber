"""Constants shared across the test suite.

Lives in a regular module (not ``conftest.py``) so it can be imported
explicitly. ``conftest.py`` is reserved for pytest fixtures.
"""

from __future__ import annotations

from praxis_sdk.types import BaseUrls

TEST_BASE_URLS: BaseUrls = {
    "identity": "http://identity.test",
    "reputation": "http://reputation.test",
    "memory": "http://memory.test",
    "observability": "http://observability.test",
    "negotiation": "http://negotiation.test",
    "insurance": "http://insurance.test",
}
