"""Mirror of ``apps/sdk-typescript/test/envelope.test.ts``."""

from __future__ import annotations

from colber_sdk.envelope import is_error_envelope, is_ok_envelope


class TestIsOkEnvelope:
    def test_accepts_a_valid_success_envelope(self) -> None:
        assert is_ok_envelope({"ok": True, "data": {"foo": 1}}) is True
        assert is_ok_envelope({"ok": True, "data": None}) is True

    def test_rejects_none_primitives_and_lists(self) -> None:
        assert is_ok_envelope(None) is False
        assert is_ok_envelope(42) is False
        assert is_ok_envelope("ok") is False
        assert is_ok_envelope([]) is False

    def test_rejects_an_envelope_with_ok_false(self) -> None:
        assert is_ok_envelope({"ok": False, "error": {"code": "X", "message": "y"}}) is False

    def test_rejects_an_envelope_missing_the_data_field(self) -> None:
        assert is_ok_envelope({"ok": True}) is False


class TestIsErrorEnvelope:
    def test_accepts_a_valid_error_envelope(self) -> None:
        assert is_error_envelope({"ok": False, "error": {"code": "X", "message": "y"}}) is True

    def test_accepts_an_error_envelope_with_details_and_trace_id(self) -> None:
        assert (
            is_error_envelope(
                {
                    "ok": False,
                    "error": {
                        "code": "X",
                        "message": "y",
                        "details": {"foo": 1},
                        "traceId": "t-1",
                    },
                }
            )
            is True
        )

    def test_rejects_when_error_code_or_message_is_missing_or_wrong_type(self) -> None:
        assert is_error_envelope({"ok": False, "error": {"code": "X"}}) is False
        assert is_error_envelope({"ok": False, "error": {"code": 1, "message": "y"}}) is False
        assert is_error_envelope({"ok": False, "error": None}) is False

    def test_rejects_when_ok_is_not_false(self) -> None:
        assert is_error_envelope({"ok": True, "error": {"code": "X", "message": "y"}}) is False
