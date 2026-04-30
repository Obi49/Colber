"""Mirror of ``apps/sdk-typescript/test/services/identity.test.ts``."""

from __future__ import annotations

import json
from collections.abc import Callable

import pytest
import respx

from praxis_sdk import PraxisClient

from .._helpers import TEST_BASE_URLS


class TestRegister:
    def test_posts_to_register_and_returns_unwrapped_data(
        self, make_client: Callable[..., PraxisClient]
    ) -> None:
        with respx.mock:
            route = respx.post(f"{TEST_BASE_URLS['identity']}/v1/identity/register").respond(
                status_code=201,
                json={
                    "ok": True,
                    "data": {
                        "did": "did:key:zfoo",
                        "agentId": "00000000-0000-0000-0000-000000000001",
                        "registeredAt": "2026-04-30T00:00:00.000Z",
                    },
                },
            )
            client = make_client()
            result = client.identity.register(public_key="AAA", owner_operator_id="op-1")
            assert json.loads(route.calls.last.request.content) == {
                "publicKey": "AAA",
                "ownerOperatorId": "op-1",
            }
            assert result.did == "did:key:zfoo"
            assert result.agent_id == "00000000-0000-0000-0000-000000000001"


class TestResolve:
    def test_gets_identity_did_with_url_encoded_did(
        self, make_client: Callable[..., PraxisClient]
    ) -> None:
        with respx.mock:
            route = respx.get(f"{TEST_BASE_URLS['identity']}/v1/identity/did%3Akey%3Azfoo").respond(
                json={
                    "ok": True,
                    "data": {
                        "did": "did:key:zfoo",
                        "agentId": "00000000-0000-0000-0000-000000000001",
                        "publicKey": "AAA",
                        "signatureScheme": "Ed25519",
                        "ownerOperatorId": "op-1",
                        "registeredAt": "2026-04-30T00:00:00.000Z",
                        "revokedAt": None,
                    },
                }
            )
            client = make_client()
            result = client.identity.resolve("did:key:zfoo")
            assert route.call_count == 1
            assert result.did == "did:key:zfoo"
            assert result.public_key == "AAA"


class TestVerify:
    def test_posts_to_verify_and_returns_typed_result(
        self, make_client: Callable[..., PraxisClient]
    ) -> None:
        with respx.mock:
            respx.post(f"{TEST_BASE_URLS['identity']}/v1/identity/verify").respond(
                json={"ok": True, "data": {"valid": True}}
            )
            client = make_client()
            r = client.identity.verify(did="did:key:zfoo", message="aGVsbG8=", signature="AAA")
            assert r.valid is True

    def test_forwards_400_level_error_envelopes_verbatim(
        self, make_client: Callable[..., PraxisClient]
    ) -> None:
        with respx.mock:
            respx.post(f"{TEST_BASE_URLS['identity']}/v1/identity/verify").respond(
                status_code=400,
                json={
                    "ok": False,
                    "error": {"code": "VALIDATION_FAILED", "message": "bad sig"},
                },
            )
            client = make_client()
            from praxis_sdk import PraxisApiError

            with pytest.raises(PraxisApiError) as exc_info:
                client.identity.verify(did="did:key:zfoo", message="", signature="")
            assert exc_info.value.code == "VALIDATION_FAILED"
            assert exc_info.value.status == 400
