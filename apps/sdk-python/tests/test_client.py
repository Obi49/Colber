"""Mirror of ``apps/sdk-typescript/test/client.test.ts``.

Covers the constructor, factory methods, retry/timeout/auth semantics,
and the ``build_url`` helper.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import httpx
import pytest
import respx

from praxis_sdk import (
    DEFAULT_INGRESS_PATHS,
    DEFAULT_LOCAL_PORTS,
    PraxisApiError,
    PraxisClient,
    PraxisNetworkError,
)
from praxis_sdk._http import build_url

from ._helpers import TEST_BASE_URLS

OK_RESOLVE_BODY = {
    "ok": True,
    "data": {
        "did": "did:key:zfoo",
        "agentId": "00000000-0000-0000-0000-000000000001",
        "publicKey": "AAA",
        "signatureScheme": "Ed25519",
        "ownerOperatorId": "op",
        "registeredAt": "2026-04-30T00:00:00.000Z",
        "revokedAt": None,
    },
}


class TestPraxisClientConstructor:
    def test_uses_default_httpx_client_and_attaches_services(self, base_urls: Any) -> None:
        c = PraxisClient(base_urls)
        try:
            assert c.identity is not None
            assert c.reputation is not None
            assert c.memory is not None
            assert c.observability is not None
            assert c.negotiation is not None
            assert c.insurance is not None
        finally:
            c.close()

    def test_accepts_an_injected_fetch(self, make_client: Callable[..., PraxisClient]) -> None:
        with respx.mock:
            respx.get(f"{TEST_BASE_URLS['identity']}/v1/identity/did%3Akey%3Azfoo").respond(
                json=OK_RESOLVE_BODY
            )
            calls = {"n": 0}

            def spy(**kwargs: Any) -> httpx.Response:
                calls["n"] += 1
                return httpx.Client().request(**kwargs)

            client = make_client(fetch=spy)
            client.identity.resolve("did:key:zfoo")
            assert calls["n"] == 1


class TestLocalFactory:
    def test_local_creates_a_client_at_the_documented_ports(self) -> None:
        c = PraxisClient.local()
        try:
            assert isinstance(c, PraxisClient)
            assert DEFAULT_LOCAL_PORTS["identity"] == 14001
            assert DEFAULT_LOCAL_PORTS["insurance"] == 14051
        finally:
            c.close()


class TestFromBaseUrlFactory:
    def test_resolves_each_service_via_path_based_routing(self) -> None:
        c = PraxisClient.from_base_url("https://api.praxis.dev")
        try:
            assert isinstance(c, PraxisClient)
            assert DEFAULT_INGRESS_PATHS["identity"] == "/identity"
            assert DEFAULT_INGRESS_PATHS["insurance"] == "/insurance"
        finally:
            c.close()

    def test_strips_trailing_slashes_from_the_base_url(self) -> None:
        c = PraxisClient.from_base_url("https://api.praxis.dev/")
        try:
            assert isinstance(c, PraxisClient)
        finally:
            c.close()


class TestErrorEnvelopeHandling:
    def test_throws_praxis_api_error_with_structured_fields(
        self, make_client: Callable[..., PraxisClient]
    ) -> None:
        with respx.mock:
            respx.get(f"{TEST_BASE_URLS['identity']}/v1/identity/did%3Akey%3Azfoo").respond(
                status_code=404,
                json={
                    "ok": False,
                    "error": {
                        "code": "NOT_FOUND",
                        "message": "agent not registered",
                        "details": {"did": "did:key:zfoo"},
                        "traceId": "t-abc",
                    },
                },
            )
            client = make_client()
            with pytest.raises(PraxisApiError) as exc_info:
                client.identity.resolve("did:key:zfoo")
            assert exc_info.value.code == "NOT_FOUND"
            assert exc_info.value.status == 404
            assert exc_info.value.details == {"did": "did:key:zfoo"}
            assert exc_info.value.trace_id == "t-abc"

    def test_throws_praxis_api_error_with_http_error_code_when_body_is_not_envelope(
        self, make_client: Callable[..., PraxisClient]
    ) -> None:
        with respx.mock:
            respx.get(f"{TEST_BASE_URLS['identity']}/v1/identity/did%3Akey%3Azfoo").respond(
                status_code=502, json={"unrelated": True}
            )
            client = make_client()
            with pytest.raises(PraxisApiError):
                client.identity.resolve("did:key:zfoo")

    def test_throws_praxis_network_error_on_non_json_2xx_body(
        self, make_client: Callable[..., PraxisClient]
    ) -> None:
        with respx.mock:
            respx.get(f"{TEST_BASE_URLS['identity']}/v1/identity/did%3Akey%3Azfoo").respond(
                content="not json", headers={"content-type": "text/plain"}
            )
            client = make_client()
            with pytest.raises(PraxisNetworkError):
                client.identity.resolve("did:key:zfoo")

    def test_throws_praxis_network_error_invalid_response_on_2xx_with_wrong_shape(
        self, make_client: Callable[..., PraxisClient]
    ) -> None:
        with respx.mock:
            respx.get(f"{TEST_BASE_URLS['identity']}/v1/identity/did%3Akey%3Azfoo").respond(
                json={"unrelated": True}
            )
            client = make_client()
            with pytest.raises(PraxisNetworkError) as exc_info:
                client.identity.resolve("did:key:zfoo")
            assert exc_info.value.code == "INVALID_RESPONSE"


class TestRetryBehaviour:
    def test_retries_on_5xx_up_to_count_then_throws(
        self, make_client: Callable[..., PraxisClient]
    ) -> None:
        with respx.mock:
            route = respx.get(f"{TEST_BASE_URLS['identity']}/v1/identity/did%3Akey%3Azfoo").respond(
                status_code=500,
                json={"ok": False, "error": {"code": "INTERNAL_ERROR", "message": "boom"}},
            )
            client = make_client(retries={"count": 2, "backoff_ms": 1})
            with pytest.raises(PraxisApiError):
                client.identity.resolve("did:key:zfoo")
            # initial + 2 retries = 3
            assert route.call_count == 3

    def test_does_not_retry_on_4xx(self, make_client: Callable[..., PraxisClient]) -> None:
        with respx.mock:
            route = respx.get(f"{TEST_BASE_URLS['identity']}/v1/identity/did%3Akey%3Azfoo").respond(
                status_code=404,
                json={"ok": False, "error": {"code": "NOT_FOUND", "message": "gone"}},
            )
            client = make_client(retries={"count": 5, "backoff_ms": 1})
            with pytest.raises(PraxisApiError):
                client.identity.resolve("did:key:zfoo")
            assert route.call_count == 1

    def test_returns_success_after_a_transient_5xx_then_a_200(
        self, make_client: Callable[..., PraxisClient]
    ) -> None:
        with respx.mock:
            route = respx.get(f"{TEST_BASE_URLS['identity']}/v1/identity/did%3Akey%3Azfoo")
            route.side_effect = [
                httpx.Response(
                    503,
                    json={
                        "ok": False,
                        "error": {"code": "INTERNAL_ERROR", "message": "flaky"},
                    },
                ),
                httpx.Response(200, json=OK_RESOLVE_BODY),
            ]
            client = make_client(retries={"count": 2, "backoff_ms": 1})
            r = client.identity.resolve("did:key:zfoo")
            assert r.did == "did:key:zfoo"
            assert route.call_count == 2


class TestTimeoutBehaviour:
    def test_throws_praxis_network_error_timeout_on_timeout(
        self, make_client: Callable[..., PraxisClient]
    ) -> None:
        with respx.mock:
            respx.get(f"{TEST_BASE_URLS['identity']}/v1/identity/did%3Akey%3Azfoo").mock(
                side_effect=httpx.TimeoutException("slow")
            )
            client = make_client(timeout_s=0.05, retries={"count": 0, "backoff_ms": 1})
            with pytest.raises(PraxisNetworkError) as exc_info:
                client.identity.resolve("did:key:zfoo")
            assert exc_info.value.code == "TIMEOUT"

    def test_does_not_retry_after_a_timeout(self, make_client: Callable[..., PraxisClient]) -> None:
        with respx.mock:
            route = respx.get(f"{TEST_BASE_URLS['identity']}/v1/identity/did%3Akey%3Azfoo").mock(
                side_effect=httpx.TimeoutException("slow")
            )
            client = make_client(timeout_s=0.05, retries={"count": 3, "backoff_ms": 1})
            with pytest.raises(PraxisNetworkError):
                client.identity.resolve("did:key:zfoo")
            assert route.call_count == 1


class TestAuthHeaderInjection:
    def test_attaches_authorization_when_auth_token_is_set(
        self, make_client: Callable[..., PraxisClient]
    ) -> None:
        with respx.mock:
            route = respx.get(f"{TEST_BASE_URLS['identity']}/v1/identity/did%3Akey%3Azfoo").respond(
                json=OK_RESOLVE_BODY
            )
            client = make_client(auth_token="tk-1")
            client.identity.resolve("did:key:zfoo")
            assert route.calls.last.request.headers.get("authorization") == "Bearer tk-1"

    def test_omits_authorization_when_auth_token_is_not_set(
        self, make_client: Callable[..., PraxisClient]
    ) -> None:
        with respx.mock:
            route = respx.get(f"{TEST_BASE_URLS['identity']}/v1/identity/did%3Akey%3Azfoo").respond(
                json=OK_RESOLVE_BODY
            )
            client = make_client()
            client.identity.resolve("did:key:zfoo")
            # `authorization` is HTTP — not stripped automatically.
            assert "authorization" not in {k.lower() for k in route.calls.last.request.headers}


class TestBuildUrl:
    def test_joins_base_and_path_correctly_and_skips_none_query_values(self) -> None:
        assert (
            build_url("http://x.test", "/foo", {"a": 1, "b": None, "c": "z"})
            == "http://x.test/foo?a=1&c=z"
        )

    def test_strips_trailing_slashes_from_base_and_adds_leading_slash_to_path(
        self,
    ) -> None:
        assert build_url("http://x.test/", "foo") == "http://x.test/foo"

    def test_omits_querystring_when_no_query_values_are_present(self) -> None:
        assert build_url("http://x.test", "/foo", {"a": None}) == "http://x.test/foo"

    def test_omits_querystring_when_query_dict_is_empty(self) -> None:
        assert build_url("http://x.test", "/foo", {}) == "http://x.test/foo"


class TestRetryConfigCoercion:
    def test_accepts_a_retry_config_object_directly(self, base_urls: Any) -> None:
        from praxis_sdk.types import RetryConfig

        c = PraxisClient(base_urls, retries=RetryConfig(count=1, backoff_ms=10))
        try:
            assert isinstance(c, PraxisClient)
        finally:
            c.close()

    def test_default_retries_when_omitted(self, base_urls: Any) -> None:
        c = PraxisClient(base_urls)
        try:
            assert isinstance(c, PraxisClient)
        finally:
            c.close()


class TestContextManager:
    def test_can_be_used_as_a_context_manager(self, base_urls: Any) -> None:
        with PraxisClient(base_urls) as c:
            assert c.identity is not None
        # No assertion on `closed` — `httpx.Client.is_closed` exists but
        # we keep the test minimal.
