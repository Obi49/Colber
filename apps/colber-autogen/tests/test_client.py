# Copyright 2026 Colber Contributors
# SPDX-License-Identifier: Apache-2.0
"""Tests for :func:`colber_autogen.build_client_from_env`."""

from __future__ import annotations

import json

import pytest

from colber_autogen import build_client_from_env


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Strip any pre-existing Colber env vars to keep tests deterministic."""
    for name in ("COLBER_BASE_URLS", "COLBER_BASE_URL", "COLBER_AUTH_TOKEN"):
        monkeypatch.delenv(name, raising=False)


def test_falls_back_to_local() -> None:
    """No env set → ``ColberClient.local()`` (β-VM ports)."""
    client = build_client_from_env()
    # We only assert that we got an object back; the local() ports are
    # an SDK detail we don't re-test here.
    assert client is not None


def test_uses_base_url_when_set(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("COLBER_BASE_URL", "https://api.example.com")
    client = build_client_from_env()
    assert client is not None


def test_uses_explicit_base_urls_json(monkeypatch: pytest.MonkeyPatch) -> None:
    urls = {
        "identity": "http://i",
        "reputation": "http://r",
        "memory": "http://m",
        "observability": "http://o",
        "negotiation": "http://n",
        "insurance": "http://ins",
    }
    monkeypatch.setenv("COLBER_BASE_URLS", json.dumps(urls))
    client = build_client_from_env()
    assert client is not None


def test_rejects_malformed_base_urls_json(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("COLBER_BASE_URLS", "not-json")
    with pytest.raises(ValueError, match="must be valid JSON"):
        build_client_from_env()


def test_rejects_base_urls_with_missing_services(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(
        "COLBER_BASE_URLS",
        json.dumps({"identity": "http://i"}),  # missing 5 entries
    )
    with pytest.raises(ValueError, match="missing entries"):
        build_client_from_env()


def test_rejects_non_object_base_urls(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("COLBER_BASE_URLS", json.dumps(["a", "b"]))
    with pytest.raises(ValueError, match="must decode to a JSON object"):
        build_client_from_env()


def test_auth_token_is_picked_up(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("COLBER_BASE_URL", "https://api.example.com")
    monkeypatch.setenv("COLBER_AUTH_TOKEN", "tok-secret-123")
    # We don't assert the token is exposed (the client doesn't reveal it
    # by design) — just that construction succeeds.
    client = build_client_from_env()
    assert client is not None
