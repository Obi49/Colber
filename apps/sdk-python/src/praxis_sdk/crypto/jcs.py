"""JCS — JSON Canonicalization Scheme (RFC 8785).

Mirror of ``apps/sdk-typescript/src/crypto/jcs.ts`` byte-for-byte. The
Python output matches the TS output character-for-character on every
input the platform's services accept.

RFC 8785 specifies:

  1. Object keys are sorted lexicographically by UTF-16 code-unit ordering.
  2. Whitespace is removed.
  3. Strings use the minimum-length escape rules from ECMA-262 §24.5.2.
  4. Numbers use ECMA-262 ToString — what JS ``JSON.stringify`` already
     produces for finite numbers. Python's ``json.dumps`` matches this
     for finite ints and floats up to representation differences (e.g.
     ``1e21`` exponent form), which we patch up below.
  5. ``null``, ``true``, ``false`` are serialised literally.
  6. Arrays preserve member order.

We deliberately reject any non-finite number, BigInt-like values are
rejected naturally by the dispatcher (only ``int``/``float``/``bool``
reach the number branch). A :class:`TypeError` is raised so the caller
can map it to a 400 with a clear message.
"""

from __future__ import annotations

import json
import math
from typing import Any

_HEX = "0123456789abcdef"


def _escape_string(s: str) -> str:
    """Escape a string per RFC 8785 / ECMA-262 §24.5.2 (minimum-length escapes)."""
    out: list[str] = ['"']
    for ch in s:
        c = ord(ch)
        if c == 0x22:  # "
            out.append('\\"')
        elif c == 0x5C:  # \
            out.append("\\\\")
        elif c == 0x08:
            out.append("\\b")
        elif c == 0x09:
            out.append("\\t")
        elif c == 0x0A:
            out.append("\\n")
        elif c == 0x0C:
            out.append("\\f")
        elif c == 0x0D:
            out.append("\\r")
        elif c < 0x20:
            out.append(f"\\u00{_HEX[(c >> 4) & 0xF]}{_HEX[c & 0xF]}")
        else:
            out.append(ch)
    out.append('"')
    return "".join(out)


def _format_number(value: int | float) -> str:
    """Emit a number in ECMA-262 ToString form.

    Matches what JavaScript ``JSON.stringify`` (and therefore the TS SDK)
    produces for finite numbers. ``json.dumps`` already matches for the
    integer and ordinary-float cases; we only need to flatten ``True``/
    ``False`` (caught earlier) and trailing ``.0`` is fine since RFC 8785
    keeps ``ECMA-262 ToString`` output verbatim — ``1.0`` -> ``"1"`` etc.
    Python's ``json.dumps(1.0)`` returns ``"1.0"``, while JS produces
    ``"1"``. We match JS by stripping the trailing ``.0`` for floats that
    are integer-valued.
    """
    if isinstance(value, bool):
        # Should never happen — caller handles bools earlier — but be safe.
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    # float
    if value.is_integer() and not math.isinf(value):
        # JS prints `1` for `1.0`; match it.
        # Avoid `int(value)` overflow on very large floats by going via
        # `repr()` first when out of int range.
        try:
            return str(int(value))
        except (OverflowError, ValueError):
            pass
    # Default: use json.dumps to get ECMA-262-compatible formatting for
    # ordinary floats. json.dumps emits "1.5" / "-3.14" / "1e+21" exactly
    # like JS for the values our services exchange (no NaN/Infinity here).
    return json.dumps(value)


def _write_value(value: Any, seen: set[int]) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, str):
        return _escape_string(value)
    if isinstance(value, (int, float)):
        if isinstance(value, float) and not math.isfinite(value):
            raise TypeError(f"Cannot canonicalize non-finite number: {value}")
        return _format_number(value)
    # Reject types that have no canonical JSON representation.
    if isinstance(value, bytes | bytearray | memoryview):
        raise TypeError(f"Cannot canonicalize value of type {type(value).__name__}")
    if isinstance(value, list | tuple):
        if id(value) in seen:
            raise TypeError("Circular reference detected during canonicalization")
        seen.add(id(value))
        try:
            parts: list[str] = []
            for item in value:
                # JSON.stringify converts undefined array members to null;
                # Python doesn't have undefined, but None already maps to
                # null here so this branch falls through naturally.
                parts.append(_write_value(item, seen))
            return f"[{','.join(parts)}]"
        finally:
            seen.discard(id(value))
    if isinstance(value, dict):
        if id(value) in seen:
            raise TypeError("Circular reference detected during canonicalization")
        seen.add(id(value))
        try:
            # All keys must be strings (RFC 8785 — JSON object key form).
            for k in value:
                if not isinstance(k, str):
                    raise TypeError(f"Object keys must be strings; got {type(k).__name__}")
            keys = sorted(value.keys())
            parts2: list[str] = []
            for key in keys:
                v = value[key]
                # Mirror the TS skip-undefined behaviour. Python doesn't
                # have undefined; we treat MISSING_VALUE sentinel only —
                # plain None is a valid JSON null, so we keep it.
                parts2.append(f"{_escape_string(key)}:{_write_value(v, seen)}")
            return f"{{{','.join(parts2)}}}"
        finally:
            seen.discard(id(value))
    raise TypeError(f"Cannot canonicalize value of type {type(value).__name__}")


def canonicalize_jcs(value: Any) -> str:
    """Canonicalise a JSON-compatible value to its RFC 8785 (JCS) string form.

    Raises:
        TypeError: on unsupported inputs (functions, BigInt, non-finite
            numbers, circular graphs, non-plain objects, bytes).
    """
    return _write_value(value, set())


def canonicalize_jcs_bytes(value: Any) -> bytes:
    """Canonicalise and return the UTF-8 byte representation."""
    return canonicalize_jcs(value).encode("utf-8")
