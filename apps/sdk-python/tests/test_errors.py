"""Mirror of ``apps/sdk-typescript/test/errors.test.ts``."""

from __future__ import annotations

from praxis_sdk.errors import (
    PraxisApiError,
    PraxisError,
    PraxisNetworkError,
    PraxisValidationError,
)


def test_praxis_api_error_carries_structured_wire_fields() -> None:
    err = PraxisApiError(
        code="NOT_FOUND",
        message="agent not registered",
        status=404,
        details={"did": "did:key:zfoo"},
        trace_id="t-1",
    )
    assert isinstance(err, PraxisError)
    assert err.name == "PraxisApiError"
    assert err.code == "NOT_FOUND"
    assert err.status == 404
    assert err.details == {"did": "did:key:zfoo"}
    assert err.trace_id == "t-1"


def test_praxis_api_error_from_body_round_trips_a_parsed_envelope() -> None:
    err = PraxisApiError.from_body(
        409, {"code": "IDEMPOTENCY_REPLAY", "message": "already accepted"}
    )
    assert err.code == "IDEMPOTENCY_REPLAY"
    assert err.status == 409
    assert err.details is None
    assert err.trace_id is None


def test_praxis_api_error_from_body_picks_up_details_and_trace_id() -> None:
    err = PraxisApiError.from_body(
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


def test_praxis_api_error_to_dict_returns_a_logger_friendly_snapshot() -> None:
    err = PraxisApiError(code="X", message="y", status=500)
    assert err.to_dict() == {
        "name": "PraxisApiError",
        "code": "X",
        "message": "y",
        "status": 500,
    }


def test_praxis_api_error_to_dict_includes_optional_fields_when_set() -> None:
    err = PraxisApiError(code="X", message="y", status=500, details={"a": 1}, trace_id="t")
    out = err.to_dict()
    assert out["details"] == {"a": 1}
    assert out["trace_id"] == "t"


def test_praxis_network_error_exposes_the_failure_code() -> None:
    err = PraxisNetworkError(code="TIMEOUT", message="slow")
    assert isinstance(err, PraxisError)
    assert err.code == "TIMEOUT"
    assert err.name == "PraxisNetworkError"


def test_praxis_network_error_preserves_cause() -> None:
    cause = RuntimeError("original")
    err = PraxisNetworkError(code="FETCH_FAILED", message="boom", cause=cause)
    assert err.__cause__ is cause


def test_praxis_validation_error_preserves_its_path() -> None:
    err = PraxisValidationError("bad", "body.field")
    assert err.path == "body.field"
    assert err.name == "PraxisValidationError"


def test_praxis_validation_error_path_is_none_when_omitted() -> None:
    err = PraxisValidationError("bad")
    assert err.path is None


def test_all_subclasses_pass_isinstance_praxis_error() -> None:
    assert isinstance(PraxisApiError(code="X", message="y", status=500), PraxisError)
    assert isinstance(PraxisNetworkError(code="TIMEOUT", message="slow"), PraxisError)
    assert isinstance(PraxisValidationError("bad"), PraxisError)
