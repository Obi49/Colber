"""Mirror of ``apps/sdk-typescript/test/services/observability.test.ts``."""

from __future__ import annotations

import json
from collections.abc import Callable
from urllib.parse import parse_qs, urlparse

import respx

from colber_sdk import ColberClient

from .._helpers import TEST_BASE_URLS

ALERT_ID = "00000000-0000-0000-0000-0000000000aa"

SAMPLE_ALERT_RESPONSE = {
    "id": ALERT_ID,
    "ownerOperatorId": "op-1",
    "name": "high-error-rate",
    "description": "",
    "enabled": True,
    "scope": "logs",
    "condition": {
        "operator": "and",
        "filters": [{"field": "level", "op": "eq", "value": "error"}],
        "windowSeconds": 60,
        "threshold": 5,
    },
    "cooldownSeconds": 300,
    "notification": {"channels": []},
    "createdAt": "2026-04-30T00:00:00.000Z",
    "updatedAt": "2026-04-30T00:00:00.000Z",
}


def test_ingest_logs_posts_logs_returns_accept_count(
    make_client: Callable[..., ColberClient],
) -> None:
    with respx.mock:
        respx.post(f"{TEST_BASE_URLS['observability']}/v1/observability/logs").respond(
            status_code=202, json={"ok": True, "data": {"accepted": 2, "rejected": []}}
        )
        client = make_client()
        r = client.observability.ingest_logs(events=[{"a": 1}, {"b": 2}])
        assert r.accepted == 2


def test_ingest_spans_posts_traces(make_client: Callable[..., ColberClient]) -> None:
    with respx.mock:
        route = respx.post(f"{TEST_BASE_URLS['observability']}/v1/observability/traces").respond(
            status_code=202, json={"ok": True, "data": {"accepted": 1, "rejected": []}}
        )
        client = make_client()
        client.observability.ingest_spans(spans=[{"kind": "server"}])
        body = json.loads(route.calls.last.request.content)
        assert body == {"spans": [{"kind": "server"}]}


def test_query_posts_query_with_structured_filters(
    make_client: Callable[..., ColberClient],
) -> None:
    with respx.mock:
        respx.post(f"{TEST_BASE_URLS['observability']}/v1/observability/query").respond(
            json={"ok": True, "data": {"rows": [], "total": 0}}
        )
        client = make_client()
        r = client.observability.query(
            scope="logs",
            filters=[{"field": "service", "op": "eq", "value": "reputation"}],
            time_range={"from": "2026-04-29T00:00:00.000Z", "to": "2026-04-30T00:00:00.000Z"},
            limit=50,
        )
        assert r.total == 0


def test_list_alerts_gets_alerts_with_operator_id(
    make_client: Callable[..., ColberClient],
) -> None:
    with respx.mock:
        route = respx.get(f"{TEST_BASE_URLS['observability']}/v1/observability/alerts").respond(
            json={"ok": True, "data": {"alerts": [SAMPLE_ALERT_RESPONSE]}}
        )
        client = make_client()
        r = client.observability.list_alerts("op-1")
        url = urlparse(str(route.calls.last.request.url))
        assert parse_qs(url.query)["operatorId"] == ["op-1"]
        assert len(r.alerts) == 1


def test_create_alert_posts_alerts_returns_rule(
    make_client: Callable[..., ColberClient],
) -> None:
    with respx.mock:
        respx.post(f"{TEST_BASE_URLS['observability']}/v1/observability/alerts").respond(
            status_code=201, json={"ok": True, "data": SAMPLE_ALERT_RESPONSE}
        )
        client = make_client()
        r = client.observability.create_alert(
            owner_operator_id="op-1",
            name="high-error-rate",
            scope="logs",
            condition=SAMPLE_ALERT_RESPONSE["condition"],
        )
        assert r.id == ALERT_ID
        assert r.owner_operator_id == "op-1"


def test_get_alert_gets_alerts_id(make_client: Callable[..., ColberClient]) -> None:
    with respx.mock:
        route = respx.get(
            f"{TEST_BASE_URLS['observability']}/v1/observability/alerts/{ALERT_ID}"
        ).respond(json={"ok": True, "data": SAMPLE_ALERT_RESPONSE})
        client = make_client()
        client.observability.get_alert(ALERT_ID)
        assert urlparse(str(route.calls.last.request.url)).path == (
            f"/v1/observability/alerts/{ALERT_ID}"
        )


def test_patch_alert_patches_alerts_id(
    make_client: Callable[..., ColberClient],
) -> None:
    with respx.mock:
        route = respx.patch(
            f"{TEST_BASE_URLS['observability']}/v1/observability/alerts/{ALERT_ID}"
        ).respond(json={"ok": True, "data": {**SAMPLE_ALERT_RESPONSE, "enabled": False}})
        client = make_client()
        r = client.observability.patch_alert(ALERT_ID, enabled=False)
        body = json.loads(route.calls.last.request.content)
        assert body == {"enabled": False}
        assert r.enabled is False


def test_delete_alert_deletes_alerts_id_resolves_on_204(
    make_client: Callable[..., ColberClient],
) -> None:
    with respx.mock:
        route = respx.delete(
            f"{TEST_BASE_URLS['observability']}/v1/observability/alerts/{ALERT_ID}"
        ).respond(status_code=204)
        client = make_client()
        client.observability.delete_alert(ALERT_ID)
        assert route.call_count == 1
