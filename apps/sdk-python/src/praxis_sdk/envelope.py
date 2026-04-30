"""Wire envelope used by every Praxis service.

Success: ``{"ok": true, "data": <T>}``
Failure: ``{"ok": false, "error": {"code", "message", "details"?, "traceId"?}}``

The SDK unwraps the envelope and surfaces ``data`` directly to callers, or
raises :class:`praxis_sdk.errors.PraxisApiError` carrying the structured
error fields.

This module mirrors ``apps/sdk-typescript/src/envelope.ts`` byte-for-byte
in semantics — the type guards return ``True``/``False`` exactly when the
TS guards return ``true``/``false``.
"""

from __future__ import annotations

from typing import Any, TypeGuard


def is_ok_envelope(value: Any) -> TypeGuard[dict[str, Any]]:
    """Return True when ``value`` matches the success envelope shape.

    A success envelope has ``ok=True`` and a ``data`` key (the value of
    ``data`` may be ``None``; only its presence is checked).
    """
    if not isinstance(value, dict):
        return False
    if value.get("ok") is not True:
        return False
    return "data" in value


def is_error_envelope(value: Any) -> TypeGuard[dict[str, Any]]:
    """Return True when ``value`` matches the error envelope shape.

    An error envelope has ``ok=False`` plus an ``error`` object carrying
    string ``code`` and ``message`` fields.
    """
    if not isinstance(value, dict):
        return False
    if value.get("ok") is not False:
        return False
    error = value.get("error")
    if not isinstance(error, dict):
        return False
    return isinstance(error.get("code"), str) and isinstance(error.get("message"), str)
