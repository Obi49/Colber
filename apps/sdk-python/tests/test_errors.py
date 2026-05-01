"""Mirror of ``apps/sdk-typescript/test/errors.test.ts``."""

from __future__ import annotations

from colber_sdk.errors import (
    ColberApiError,
    ColberError,
    ColberNetworkError,
    ColberValidationError,
)


def test_colber_api_error_carries_structured_wire_fields() -> None:
    err = ColberApiError(
        code="NOT_FOUND",
        message="agent not registered",
        status=404,
        details={"did": "did:key:zfoo"},
        trace_id="t-1",
    )
    assert isinstance(err, ColberError)
    assert err.name == "ColberApiError"
    assert err.code == "NOT_FOUND"
    assert err.status == 404
    assert err.details == {"did": "did:key:zfoo"}
    assert err.trace_id == "t-1"


def test_colber_api_error_from_body_round_trips_a_parsed_envelope() -> None:
    err = ColberApiError.from_body(
        409, {"code": "IDEMPOTENCY_REPLAY", "message": "already accepted"}
    )
    assert err.code == "IDEMPOTENCY_REPLAY"
    assert err.status == 409
    assert err.details is None
    assert err.trace_id is None


def test_colber_api_error_from_body_picks_up_details_and_trace_id() -> None:
    err = ColberApiError.from_body(
        400,
        {
            "code": "VALIDATION_FAILED",
            "message": "bad",
            "details": {"field": "x"},
            "traceId": "abc",
        },
    )
    assert err.details == {"field": "x"}
    assert err.trace_id == "abc"


def test_colber_api_error_to_dict_returns_a_logger_friendly_snapshot() -> None:
    err = ColberApiError(code="X", message="y", status=500)
    assert err.to_dict() == {
        "name": "ColberApiError",
        "code": "X",
        "message": "y",
        "status": 500,
    }


def test_colber_api_error_to_dict_includes_optional_fields_when_set() -> None:
    err = ColberApiError(code="X", message="y", status=500, details={"a": 1}, trace_id="t")
    out = err.to_dict()
    assert out["details"] == {"a": 1}
    assert out["trace_id"] == "t"


def test_colber_network_error_exposes_the_failure_code() -> None:
    err = ColberNetworkError(code="TIMEOUT", message="slow")
    assert isinstance(err, ColberError)
    assert err.code == "TIMEOUT"
    assert err.name == "ColberNetworkError"


def test_colber_network_error_preserves_cause() -> None:
    cause = RuntimeError("original")
    err = ColberNetworkError(code="FETCH_FAILED", message="boom", cause=cause)
    assert err.__cause__ is cause


def test_colber_validation_error_preserves_its_path() -> None:
    err = ColberValidationError("bad", "body.field")
    assert err.path == "body.field"
    assert err.name == "ColberValidationError"


def test_colber_validation_error_path_is_none_when_omitted() -> None:
    err = ColberValidationError("bad")
    assert err.path is None


def test_all_subclasses_pass_isinstance_colber_error() -> None:
    assert isinstance(ColberApiError(code="X", message="y", status=500), ColberError)
    assert isinstance(ColberNetworkError(code="TIMEOUT", message="slow"), ColberError)
    assert isinstance(ColberValidationError("bad"), ColberError)
