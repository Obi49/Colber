"""``ObservabilityService`` — typed client for the ``observability`` service.

Mirror of ``apps/sdk-typescript/src/services/observability.ts`` and
``apps/observability/src/http/routes.ts``:

- ``POST   /v1/observability/logs``
- ``POST   /v1/observability/traces``
- ``POST   /v1/observability/query``
- ``GET    /v1/observability/alerts``
- ``POST   /v1/observability/alerts``
- ``GET    /v1/observability/alerts/:id``
- ``PATCH  /v1/observability/alerts/:id``
- ``DELETE /v1/observability/alerts/:id``  (204 No Content)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal
from urllib.parse import quote

from .._http import HttpClientOptions, RequestParams, request
from ._convert import from_wire, to_wire

AlertScope = Literal["logs", "spans"]


@dataclass(frozen=True, slots=True)
class IngestRejection:
    index: int
    reason: str


@dataclass(frozen=True, slots=True)
class IngestResponse:
    accepted: int
    rejected: list[IngestRejection] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class QueryRow:
    timestamp: str
    trace_id: str
    span_id: str
    service: str
    attributes: dict[str, Any] = field(default_factory=dict)
    resource: dict[str, str] = field(default_factory=dict)
    parent_span_id: str | None = None
    agent_did: str | None = None
    operator_id: str | None = None
    level: str | None = None
    message: str | None = None
    name: str | None = None
    kind: str | None = None
    status: str | None = None
    status_message: str | None = None
    start_timestamp: str | None = None
    end_timestamp: str | None = None
    duration_ms: float | None = None


@dataclass(frozen=True, slots=True)
class QueryResponse:
    rows: list[QueryRow] = field(default_factory=list)
    total: int = 0


@dataclass(frozen=True, slots=True)
class AlertRule:
    id: str
    owner_operator_id: str
    name: str
    description: str
    enabled: bool
    scope: str
    condition: dict[str, Any]
    cooldown_seconds: int
    notification: dict[str, Any]
    created_at: str
    updated_at: str


@dataclass(frozen=True, slots=True)
class AlertListResponse:
    alerts: list[AlertRule] = field(default_factory=list)


class ObservabilityService:
    """Typed client for the ``observability`` service."""

    def __init__(self, opts: HttpClientOptions, base_url: str) -> None:
        self._opts = opts
        self._base_url = base_url

    def ingest_logs(self, *, events: list[Any]) -> IngestResponse:
        """``POST /v1/observability/logs``."""
        data = request(
            self._opts,
            RequestParams(
                method="POST",
                base_url=self._base_url,
                path="/v1/observability/logs",
                body={"events": events},
            ),
        )
        if data is None:
            raise RuntimeError("observability.ingest_logs: empty response body")
        return from_wire(IngestResponse, data)

    def ingest_spans(self, *, spans: list[Any]) -> IngestResponse:
        """``POST /v1/observability/traces``."""
        data = request(
            self._opts,
            RequestParams(
                method="POST",
                base_url=self._base_url,
                path="/v1/observability/traces",
                body={"spans": spans},
            ),
        )
        if data is None:
            raise RuntimeError("observability.ingest_spans: empty response body")
        return from_wire(IngestResponse, data)

    def query(
        self,
        *,
        scope: AlertScope,
        time_range: dict[str, str],
        filters: list[dict[str, Any]] | None = None,
        limit: int | None = None,
        offset: int | None = None,
    ) -> QueryResponse:
        """``POST /v1/observability/query``."""
        body_in: dict[str, Any] = {"scope": scope, "time_range": time_range}
        if filters is not None:
            body_in["filters"] = filters
        if limit is not None:
            body_in["limit"] = limit
        if offset is not None:
            body_in["offset"] = offset
        data = request(
            self._opts,
            RequestParams(
                method="POST",
                base_url=self._base_url,
                path="/v1/observability/query",
                body=to_wire(body_in),
            ),
        )
        if data is None:
            raise RuntimeError("observability.query: empty response body")
        return from_wire(QueryResponse, data)

    def list_alerts(self, operator_id: str) -> AlertListResponse:
        """``GET /v1/observability/alerts?operatorId=...``."""
        data = request(
            self._opts,
            RequestParams(
                method="GET",
                base_url=self._base_url,
                path="/v1/observability/alerts",
                query={"operatorId": operator_id},
            ),
        )
        if data is None:
            raise RuntimeError("observability.list_alerts: empty response body")
        return from_wire(AlertListResponse, data)

    def create_alert(
        self,
        *,
        owner_operator_id: str,
        name: str,
        scope: AlertScope,
        condition: dict[str, Any],
        description: str | None = None,
        enabled: bool | None = None,
        cooldown_seconds: int | None = None,
        notification: dict[str, Any] | None = None,
    ) -> AlertRule:
        """``POST /v1/observability/alerts``."""
        body_in: dict[str, Any] = {
            "owner_operator_id": owner_operator_id,
            "name": name,
            "scope": scope,
            "condition": condition,
        }
        if description is not None:
            body_in["description"] = description
        if enabled is not None:
            body_in["enabled"] = enabled
        if cooldown_seconds is not None:
            body_in["cooldown_seconds"] = cooldown_seconds
        if notification is not None:
            body_in["notification"] = notification
        data = request(
            self._opts,
            RequestParams(
                method="POST",
                base_url=self._base_url,
                path="/v1/observability/alerts",
                body=to_wire(body_in),
            ),
        )
        if data is None:
            raise RuntimeError("observability.create_alert: empty response body")
        return from_wire(AlertRule, data)

    def get_alert(self, alert_id: str) -> AlertRule:
        """``GET /v1/observability/alerts/:id``."""
        data = request(
            self._opts,
            RequestParams(
                method="GET",
                base_url=self._base_url,
                path=f"/v1/observability/alerts/{quote(alert_id, safe='')}",
            ),
        )
        if data is None:
            raise RuntimeError("observability.get_alert: empty response body")
        return from_wire(AlertRule, data)

    def patch_alert(
        self,
        alert_id: str,
        *,
        name: str | None = None,
        description: str | None = None,
        enabled: bool | None = None,
        scope: AlertScope | None = None,
        condition: dict[str, Any] | None = None,
        cooldown_seconds: int | None = None,
        notification: dict[str, Any] | None = None,
    ) -> AlertRule:
        """``PATCH /v1/observability/alerts/:id``."""
        body_in: dict[str, Any] = {}
        if name is not None:
            body_in["name"] = name
        if description is not None:
            body_in["description"] = description
        if enabled is not None:
            body_in["enabled"] = enabled
        if scope is not None:
            body_in["scope"] = scope
        if condition is not None:
            body_in["condition"] = condition
        if cooldown_seconds is not None:
            body_in["cooldown_seconds"] = cooldown_seconds
        if notification is not None:
            body_in["notification"] = notification
        data = request(
            self._opts,
            RequestParams(
                method="PATCH",
                base_url=self._base_url,
                path=f"/v1/observability/alerts/{quote(alert_id, safe='')}",
                body=to_wire(body_in),
            ),
        )
        if data is None:
            raise RuntimeError("observability.patch_alert: empty response body")
        return from_wire(AlertRule, data)

    def delete_alert(self, alert_id: str) -> None:
        """``DELETE /v1/observability/alerts/:id``  (204 No Content)."""
        request(
            self._opts,
            RequestParams(
                method="DELETE",
                base_url=self._base_url,
                path=f"/v1/observability/alerts/{quote(alert_id, safe='')}",
                expect_no_body=True,
            ),
        )
