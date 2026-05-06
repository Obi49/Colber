# Copyright 2026 Colber Contributors
# SPDX-License-Identifier: Apache-2.0
"""Helpers to obtain a :class:`colber_sdk.ColberClient`.

Plugin components (callbacks, memory, tools) all accept an optional
``client`` kwarg. When the caller doesn't pass one, we build one from
environment variables — keeping the CrewAI integration a one-liner for
the common case (Colber stack reachable on localhost or via a single
ingress URL).

Environment variables consulted, in priority order:

1. ``COLBER_BASE_URLS`` — JSON object mapping each of the 6 service
   names to its base URL. Wins if set.
2. ``COLBER_BASE_URL`` — single ingress base URL (e.g.
   ``https://api.colber.dev``); paths are appended internally per
   :class:`colber_sdk.ColberClient.from_base_url`.
3. Otherwise, fall back to :meth:`colber_sdk.ColberClient.local`
   (β-VM ports on ``localhost``).

``COLBER_AUTH_TOKEN`` is forwarded as a bearer token when present.
"""

from __future__ import annotations

import json
import os
from typing import TYPE_CHECKING, cast

from colber_sdk import ColberClient

if TYPE_CHECKING:
    from colber_sdk.types import BaseUrls


def build_client_from_env() -> ColberClient:
    """Build a :class:`ColberClient` from environment variables.

    Resolution order:

    1. ``COLBER_BASE_URLS`` (JSON object).
    2. ``COLBER_BASE_URL`` (single ingress URL).
    3. ``ColberClient.local()`` fallback (β-VM ports).

    Bearer token taken from ``COLBER_AUTH_TOKEN`` (optional).

    Raises:
        ValueError: When ``COLBER_BASE_URLS`` is set but malformed (not
            JSON or missing one of the 6 required service entries).
    """
    auth_token = os.environ.get("COLBER_AUTH_TOKEN") or None

    explicit = os.environ.get("COLBER_BASE_URLS")
    if explicit:
        try:
            parsed = json.loads(explicit)
        except json.JSONDecodeError as exc:
            raise ValueError(
                f"COLBER_BASE_URLS must be valid JSON, got: {explicit!r}"
            ) from exc
        if not isinstance(parsed, dict):
            raise ValueError(
                f"COLBER_BASE_URLS must decode to a JSON object, "
                f"got {type(parsed).__name__}"
            )
        required = (
            "identity",
            "reputation",
            "memory",
            "observability",
            "negotiation",
            "insurance",
        )
        missing = [name for name in required if name not in parsed]
        if missing:
            raise ValueError(
                f"COLBER_BASE_URLS missing entries for: {missing}"
            )
        return ColberClient(cast("BaseUrls", parsed), auth_token=auth_token)

    single = os.environ.get("COLBER_BASE_URL")
    if single:
        return ColberClient.from_base_url(single, auth_token=auth_token)

    return ColberClient.local(auth_token=auth_token)


__all__ = ["build_client_from_env"]
