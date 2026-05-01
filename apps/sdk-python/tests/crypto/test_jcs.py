"""Mirror of ``apps/sdk-typescript/test/crypto/jcs.test.ts``.

Vectors must match byte-for-byte the TS / reputation-service implementation
so signatures produced here verify on the platform.
"""

from __future__ import annotations

import math

import pytest

from colber_sdk.crypto import canonicalize_jcs, canonicalize_jcs_bytes


def test_serialises_primitives_like_json_stringify() -> None:
    assert canonicalize_jcs(None) == "null"
    assert canonicalize_jcs(True) == "true"
    assert canonicalize_jcs(False) == "false"
    assert canonicalize_jcs(0) == "0"
    assert canonicalize_jcs(42) == "42"
    assert canonicalize_jcs(-3.14) == "-3.14"
    assert canonicalize_jcs("hello") == '"hello"'
    assert canonicalize_jcs("") == '""'


def test_sorts_object_keys_lexicographically_by_code_unit() -> None:
    assert canonicalize_jcs({"b": 2, "a": 1, "c": 3}) == '{"a":1,"b":2,"c":3}'
    assert canonicalize_jcs({"Z": 1, "A": 2, "a": 3}) == '{"A":2,"Z":1,"a":3}'


def test_handles_nested_objects_with_stable_ordering() -> None:
    input_dict = {
        "score": 642,
        "did": "did:key:abc",
        "scoreVersion": "v1.0",
        "computedAt": "2026-04-27T00:00:00.000Z",
    }
    expected = (
        '{"computedAt":"2026-04-27T00:00:00.000Z",'
        '"did":"did:key:abc",'
        '"score":642,'
        '"scoreVersion":"v1.0"}'
    )
    assert canonicalize_jcs(input_dict) == expected


def test_preserves_array_order_and_recurses_into_items() -> None:
    assert canonicalize_jcs([3, 1, 2]) == "[3,1,2]"
    assert canonicalize_jcs([{"b": 1, "a": 2}]) == '[{"a":2,"b":1}]'


def test_escapes_control_characters_and_quotes() -> None:
    assert canonicalize_jcs('a"b') == '"a\\"b"'
    assert canonicalize_jcs("line1\nline2") == '"line1\\nline2"'
    assert canonicalize_jcs(chr(1)) == '"\\u0001"'
    assert canonicalize_jcs("\\") == '"\\\\"'


def test_escapes_each_low_control_character_pair() -> None:
    # Spot-check a few additional control characters.
    assert canonicalize_jcs(chr(0x08)) == '"\\b"'
    assert canonicalize_jcs(chr(0x09)) == '"\\t"'
    assert canonicalize_jcs(chr(0x0C)) == '"\\f"'
    assert canonicalize_jcs(chr(0x0D)) == '"\\r"'


def test_produces_deterministic_output_independent_of_property_insertion_order() -> None:
    a = {"foo": 1, "bar": 2}
    b = {"bar": 2, "foo": 1}
    assert canonicalize_jcs(a) == canonicalize_jcs(b)


def test_keeps_explicit_none_object_property_as_null() -> None:
    # JS skips `undefined` but keeps `null`. Python only has `None` (= JSON null),
    # so we keep it. This is a deliberate divergence from the TS behaviour and
    # is the most consistent choice for Python callers.
    assert canonicalize_jcs({"a": 1, "b": None}) == '{"a":1,"b":null}'


def test_encodes_array_members_recursively() -> None:
    assert canonicalize_jcs([1, None, 3]) == "[1,null,3]"


def test_rejects_non_finite_numbers() -> None:
    with pytest.raises(TypeError):
        canonicalize_jcs(math.nan)
    with pytest.raises(TypeError):
        canonicalize_jcs(math.inf)
    with pytest.raises(TypeError):
        canonicalize_jcs(-math.inf)


def test_rejects_bytes_like_values() -> None:
    with pytest.raises(TypeError):
        canonicalize_jcs(b"raw")


def test_rejects_non_string_dict_keys() -> None:
    with pytest.raises(TypeError):
        canonicalize_jcs({1: "a"})


def test_rejects_circular_structures() -> None:
    a: dict[str, object] = {}
    a["self"] = a
    with pytest.raises(TypeError):
        canonicalize_jcs(a)


def test_rejects_circular_lists() -> None:
    a: list[object] = []
    a.append(a)
    with pytest.raises(TypeError):
        canonicalize_jcs(a)


def test_returns_utf8_bytes_via_canonicalize_jcs_bytes() -> None:
    bytes_out = canonicalize_jcs_bytes({"a": 1})
    assert isinstance(bytes_out, bytes)
    assert bytes_out.decode("utf-8") == '{"a":1}'


def test_serialises_integer_valued_floats_without_trailing_zero() -> None:
    """JS emits ``1`` for ``1.0``; we match that to keep signatures stable."""
    assert canonicalize_jcs(1.0) == "1"
    assert canonicalize_jcs(-2.0) == "-2"
