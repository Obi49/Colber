"""Internal helpers for camelCase <-> snake_case conversion.

The Colber services speak camelCase on the wire (matching the TS SDK).
The Python SDK exposes snake_case on the public API, so this module
converts in both directions:

- Outgoing: snake_case kwargs -> camelCase dict for the body.
- Incoming: camelCase response dict -> snake_case dataclass instances.

These helpers are intentionally untyped beyond ``Any`` because they sit
behind dataclass constructors that re-assert the types on the way out.
"""

from __future__ import annotations

import re
from typing import Any, TypeVar

_camel_re = re.compile(r"(?<!^)(?=[A-Z])")

T = TypeVar("T")


def camel_to_snake(name: str) -> str:
    """``camelCase`` -> ``snake_case``. Idempotent."""
    return _camel_re.sub("_", name).lower()


def snake_to_camel(name: str) -> str:
    """``snake_case`` -> ``camelCase``. ``did`` -> ``did``."""
    parts = name.split("_")
    if len(parts) == 1:
        return name
    return parts[0] + "".join(p.title() for p in parts[1:])


def keys_to_snake(value: Any) -> Any:
    """Recursively convert all dict keys from camelCase to snake_case.

    Lists are walked element-wise; primitives pass through unchanged. The
    returned structure shares no mutable references with the input.
    """
    if isinstance(value, dict):
        return {camel_to_snake(k): keys_to_snake(v) for k, v in value.items()}
    if isinstance(value, list):
        return [keys_to_snake(item) for item in value]
    return value


def keys_to_camel(value: Any) -> Any:
    """Recursively convert dict keys from snake_case to camelCase.

    Used to build outgoing request bodies. ``None`` values are dropped at
    the top level only — nested ``None``s pass through (some endpoints
    accept null fields explicitly).
    """
    if isinstance(value, dict):
        return {snake_to_camel(k): keys_to_camel(v) for k, v in value.items() if v is not None}
    if isinstance(value, list):
        return [keys_to_camel(item) for item in value]
    return value


def _is_dataclass_type(t: Any) -> bool:
    import dataclasses

    return isinstance(t, type) and dataclasses.is_dataclass(t)


def _instantiate(cls: type[T], data: dict[str, Any]) -> T:
    """Instantiate ``cls`` from a snake_case dict, ignoring extra keys.

    Walks declared fields; nested dataclasses are constructed recursively.
    Lists of dataclasses are also handled. Anything else passes through
    as-is (preserves dicts/lists for free-form fields like ``payload``).
    """
    import dataclasses
    import typing
    from typing import get_args, get_origin

    type_hints = typing.get_type_hints(cls)
    init_kwargs: dict[str, Any] = {}
    for f in dataclasses.fields(cls):  # type: ignore[arg-type]
        if f.name not in data:
            # Skip — dataclass default kicks in. If no default exists, the
            # constructor will raise loudly.
            continue
        raw = data[f.name]
        ftype = type_hints.get(f.name, f.type)
        if _is_dataclass_type(ftype) and isinstance(raw, dict):
            init_kwargs[f.name] = _instantiate(ftype, raw)
            continue
        origin = get_origin(ftype)
        if origin in (list, tuple):
            args = get_args(ftype)
            inner = args[0] if args else None
            if inner is not None and _is_dataclass_type(inner) and isinstance(raw, list):
                init_kwargs[f.name] = [
                    _instantiate(inner, item) if isinstance(item, dict) else item for item in raw
                ]
                continue
        init_kwargs[f.name] = raw
    return cls(**init_kwargs)


def from_wire(cls: type[T], wire: dict[str, Any]) -> T:
    """Convert a camelCase wire dict to a snake_case dataclass instance."""
    return _instantiate(cls, keys_to_snake(wire))


def to_wire(value: Any) -> Any:
    """Convert outgoing kwargs (snake_case) to a wire dict (camelCase)."""
    return keys_to_camel(value)
