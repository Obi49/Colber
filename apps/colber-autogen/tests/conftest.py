# Copyright 2026 Colber Contributors
# SPDX-License-Identifier: Apache-2.0
"""Shared fixtures for the colber-autogen test suite.

The plugin never makes real network calls in tests:

- The :class:`colber_sdk.ColberClient` is wired to a tiny in-memory
  fake backend via :class:`httpx.MockTransport`.
- AutoGen components (instrumentation, memory, tools) accept the test
  client so the public surface can be exercised end-to-end without
  spinning up a Colber stack.

The fake backend mirrors the wire shapes the real services emit. It is
trimmed to the surface the plugin actually exercises (no full Zod
validation re-implementation — that's the service's job, and the
service tests cover it).
"""

from __future__ import annotations

import base64
import hashlib
import json
import urllib.parse
import uuid
from collections.abc import Callable, Iterator
from datetime import UTC, datetime
from typing import Any

import httpx
import pytest
from colber_sdk import ColberClient
from colber_sdk.types import BaseUrls, RetryConfig


class FakeColberBackend:
    """In-memory state machine returning plausible Colber API responses."""

    def __init__(self) -> None:
        self.agents: dict[str, dict[str, Any]] = {}
        self.memories: dict[str, dict[str, Any]] = {}
        self.memory_shares: dict[str, list[str]] = {}
        self.scores: dict[str, int] = {}
        self.feedbacks: list[dict[str, Any]] = []
        self.negotiations: dict[str, dict[str, Any]] = {}
        self.policies: dict[str, dict[str, Any]] = {}
        self.claims: dict[str, dict[str, Any]] = {}
        self.spans: list[dict[str, Any]] = []
        self.logs: list[dict[str, Any]] = []
        self.calls: list[tuple[str, str, dict[str, Any] | None]] = []
        self.fail_for: dict[tuple[str, str], int] = {}

    # ------------------------------------------------------------------
    # Top-level dispatch
    # ------------------------------------------------------------------

    def handle(self, request: httpx.Request) -> httpx.Response:
        method = request.method.upper()
        path = request.url.path
        for prefix in (
            "/identity",
            "/reputation",
            "/memory",
            "/observability",
            "/negotiation",
            "/insurance",
        ):
            if path.startswith(prefix + "/"):
                path = path[len(prefix) :]
                break
        body: dict[str, Any] | None
        if request.content:
            try:
                body = json.loads(request.content)
            except json.JSONDecodeError:
                body = None
        else:
            body = None
        self.calls.append((method, path, body))

        # Fault injection.
        for (m_frag, p_frag), remaining in list(self.fail_for.items()):
            if method == m_frag and p_frag in path and remaining > 0:
                self.fail_for[(m_frag, p_frag)] = remaining - 1
                return httpx.Response(
                    status_code=500,
                    json={
                        "ok": False,
                        "error": {"code": "INJECTED", "message": "fault injection"},
                    },
                )

        # ---- identity ----
        if path == "/v1/identity/register" and method == "POST":
            return self._register(body or {})
        if path.startswith("/v1/identity/") and method == "GET":
            return self._resolve(path)

        # ---- reputation ----
        if path == "/v1/reputation/feedback" and method == "POST":
            return self._feedback(body or {})
        if path.startswith("/v1/reputation/score/") and method == "GET":
            did = _last_segment(path)
            return _ok(
                {
                    "did": did,
                    "score": self.scores.get(did, 500),
                    "scoreVersion": "v1",
                    "computedAt": _iso_now(),
                    "attestation": "stub-attestation",
                }
            )

        # ---- memory ----
        if path == "/v1/memory" and method == "POST":
            return self._memory_store(body or {})
        if path == "/v1/memory/search" and method == "POST":
            return self._memory_search(body or {})
        if path.endswith("/share") and path.startswith("/v1/memory/") and method == "POST":
            mem_id = path[len("/v1/memory/") : -len("/share")]
            return self._memory_share(mem_id, body or {})

        # ---- observability ----
        if path == "/v1/observability/traces" and method == "POST":
            spans = (body or {}).get("spans", [])
            self.spans.extend(spans)
            return _ok({"accepted": len(spans), "rejected": []})
        if path == "/v1/observability/logs" and method == "POST":
            events = (body or {}).get("events", [])
            self.logs.extend(events)
            return _ok({"accepted": len(events), "rejected": []})

        # ---- negotiation ----
        if path == "/v1/negotiation" and method == "POST":
            return self._negotiation_start(body or {})
        if path.endswith("/propose") and method == "POST":
            return self._negotiation_propose(path, body or {}, kind="proposal")
        if path.endswith("/counter") and method == "POST":
            return self._negotiation_propose(path, body or {}, kind="counter")
        if path.endswith("/settle") and method == "POST":
            return self._negotiation_settle(path, body or {})

        # ---- insurance ----
        if path == "/v1/insurance/quote" and method == "POST":
            return self._insurance_quote(body or {})
        if path == "/v1/insurance/subscribe" and method == "POST":
            return self._insurance_subscribe(body or {})
        if path == "/v1/insurance/claims" and method == "POST":
            return self._insurance_claim(body or {})

        return httpx.Response(
            status_code=404,
            json={
                "ok": False,
                "error": {"code": "NOT_FOUND", "message": f"unhandled {method} {path}"},
            },
        )

    # ------------------------------------------------------------------
    # Per-service handlers
    # ------------------------------------------------------------------

    def _register(self, body: dict[str, Any]) -> httpx.Response:
        public_key = str(body.get("publicKey", ""))
        operator_id = str(body.get("ownerOperatorId", ""))
        digest = hashlib.sha256(public_key.encode("utf-8")).hexdigest()[:32]
        did = f"did:key:zTest{digest}"
        agent_id = "agt-" + uuid.uuid4().hex[:8]
        record = {
            "did": did,
            "agentId": agent_id,
            "publicKey": public_key,
            "ownerOperatorId": operator_id,
            "registeredAt": _iso_now(),
        }
        self.agents[did] = record
        return httpx.Response(
            status_code=201,
            json={
                "ok": True,
                "data": {
                    "did": did,
                    "agentId": agent_id,
                    "registeredAt": record["registeredAt"],
                },
            },
        )

    def _resolve(self, path: str) -> httpx.Response:
        did = urllib.parse.unquote(path[len("/v1/identity/") :])
        record = self.agents.get(did)
        if record is None:
            return httpx.Response(
                status_code=404,
                json={
                    "ok": False,
                    "error": {"code": "NOT_FOUND", "message": "no such DID"},
                },
            )
        return _ok(
            {
                "did": did,
                "agentId": record["agentId"],
                "publicKey": record["publicKey"],
                "signatureScheme": "ed25519",
                "ownerOperatorId": record["ownerOperatorId"],
                "registeredAt": record["registeredAt"],
            }
        )

    def _feedback(self, body: dict[str, Any]) -> httpx.Response:
        target = str(body.get("toDid", ""))
        rating = int(body.get("rating", 3))
        delta = 10 if rating >= 4 else -40 if rating <= 2 else 0
        self.scores[target] = self.scores.get(target, 500) + delta
        feedback_id = body.get("feedbackId", str(uuid.uuid4()))
        self.feedbacks.append(body)
        return httpx.Response(
            status_code=201,
            json={
                "ok": True,
                "data": {
                    "accepted": True,
                    "idempotent": False,
                    "feedbackId": feedback_id,
                },
            },
        )

    def _memory_store(self, body: dict[str, Any]) -> httpx.Response:
        mem_id = "mem-" + uuid.uuid4().hex[:12]
        self.memories[mem_id] = body
        return httpx.Response(
            status_code=201,
            json={
                "ok": True,
                "data": {
                    "id": mem_id,
                    "embedding": {"model": "stub", "dim": 768},
                },
            },
        )

    def _memory_search(self, body: dict[str, Any]) -> httpx.Response:
        query = str(body.get("queryText", "")).lower()
        caller = str(body.get("queryDid", ""))
        hits: list[dict[str, Any]] = []
        for mem_id, record in self.memories.items():
            owner = str(record.get("ownerDid", record.get("owner_did", "")))
            shared_with = self.memory_shares.get(mem_id, [])
            if owner != caller and caller not in shared_with:
                continue
            text = str(record.get("text", ""))
            if query and query not in text.lower():
                continue
            hits.append(
                {
                    "id": mem_id,
                    "score": 0.92,
                    "type": str(record.get("type", "fact")),
                    "ownerDid": owner,
                    "snippet": text[:80],
                }
            )
        return _ok({"hits": hits})

    def _memory_share(self, mem_id: str, body: dict[str, Any]) -> httpx.Response:
        if mem_id not in self.memories:
            return httpx.Response(
                status_code=404,
                json={
                    "ok": False,
                    "error": {"code": "NOT_FOUND", "message": "no such memory"},
                },
            )
        share_with = body.get("shareWith") or body.get("share_with") or []
        if not isinstance(share_with, list):
            return httpx.Response(
                status_code=400,
                json={
                    "ok": False,
                    "error": {
                        "code": "VALIDATION_FAILED",
                        "message": "shareWith must be a list",
                    },
                },
            )
        existing = self.memory_shares.setdefault(mem_id, [])
        for did in share_with:
            if isinstance(did, str) and did and did not in existing:
                existing.append(did)
        return _ok({"id": mem_id, "sharedWith": list(existing)})

    def _negotiation_start(self, body: dict[str, Any]) -> httpx.Response:
        nego_id = "nego-" + uuid.uuid4().hex[:12]
        terms = body.get("terms", {})
        record = {
            "negotiationId": nego_id,
            "status": "open",
            "strategy": terms.get("strategy", "ascending-auction"),
            "terms": terms,
            "partyDids": terms.get("partyDids", []),
            "proposals": [],
            "createdAt": _iso_now(),
            "updatedAt": _iso_now(),
            "expiresAt": terms.get("deadline", _iso_now()),
        }
        self.negotiations[nego_id] = record
        return httpx.Response(
            status_code=201,
            json={"ok": True, "data": record},
        )

    def _negotiation_propose(
        self,
        path: str,
        body: dict[str, Any],
        *,
        kind: str,
    ) -> httpx.Response:
        nego_id = path.split("/")[3]
        record = self.negotiations.get(nego_id)
        if record is None:
            return httpx.Response(
                status_code=404,
                json={
                    "ok": False,
                    "error": {"code": "NOT_FOUND", "message": "no such negotiation"},
                },
            )
        proposal = body.get("proposal", {})
        record["proposals"].append({**proposal, "kind": kind})
        record["currentBestProposalId"] = proposal.get("proposalId")
        record["status"] = "negotiating"
        record["updatedAt"] = _iso_now()
        return _ok(record)

    def _negotiation_settle(self, path: str, body: dict[str, Any]) -> httpx.Response:
        nego_id = path.split("/")[3]
        record = self.negotiations.get(nego_id)
        if record is None:
            return httpx.Response(
                status_code=404,
                json={
                    "ok": False,
                    "error": {"code": "NOT_FOUND", "message": "no such negotiation"},
                },
            )
        record["status"] = "settled"
        record["winningProposalId"] = body.get("winningProposalId")
        record["settlementSignatures"] = body.get("signatures", [])
        record["updatedAt"] = _iso_now()
        return _ok(record)

    def _insurance_quote(self, body: dict[str, Any]) -> httpx.Response:
        amount = float(body.get("amountUsdc", 0))
        return _ok(
            {
                "subscriberDid": body.get("subscriberDid", ""),
                "beneficiaryDid": body.get("beneficiaryDid", ""),
                "dealSubject": body.get("dealSubject", ""),
                "amountUsdc": amount,
                "premiumUsdc": amount * 0.02,
                "riskMultiplier": 1.0,
                "reputationScore": 510,
                "computedAt": _iso_now(),
                "validUntil": _iso_now(),
            }
        )

    def _insurance_subscribe(self, body: dict[str, Any]) -> httpx.Response:
        amount = float(body.get("amountUsdc", 0))
        if amount < 0:
            return httpx.Response(
                status_code=400,
                json={
                    "ok": False,
                    "error": {
                        "code": "VALIDATION_FAILED",
                        "message": "amountUsdc must be non-negative",
                    },
                },
            )
        policy_id = "pol-" + uuid.uuid4().hex[:12]
        escrow_id = "esc-" + uuid.uuid4().hex[:12]
        sla_terms = body.get("slaTerms", {})
        record = {
            "policy": {
                "id": policy_id,
                "subscriberDid": body.get("subscriberDid", ""),
                "beneficiaryDid": body.get("beneficiaryDid", ""),
                "dealSubject": body.get("dealSubject", ""),
                "amountUsdc": amount,
                "premiumUsdc": amount * 0.02,
                "riskMultiplier": 1.0,
                "reputationScore": 510,
                "slaTerms": {
                    "deliveryWindowHours": sla_terms.get(
                        "deliveryWindowHours",
                        sla_terms.get("delivery_window_hours", 24),
                    ),
                    "requirements": sla_terms.get("requirements"),
                },
                "status": "active",
                "createdAt": _iso_now(),
                "expiresAt": _iso_now(),
            },
            "escrow": {
                "id": escrow_id,
                "policyId": policy_id,
                "amountUsdc": amount,
                "status": "locked",
                "lockedAt": _iso_now(),
            },
            "claims": [],
        }
        self.policies[policy_id] = record
        return httpx.Response(
            status_code=201,
            json={"ok": True, "data": record},
        )

    def _insurance_claim(self, body: dict[str, Any]) -> httpx.Response:
        policy_id = str(body.get("policyId", ""))
        if not policy_id or policy_id not in self.policies:
            return httpx.Response(
                status_code=404,
                json={
                    "ok": False,
                    "error": {"code": "NOT_FOUND", "message": "no such policy"},
                },
            )
        claim_id = "clm-" + uuid.uuid4().hex[:12]
        record = {
            "id": claim_id,
            "policyId": policy_id,
            "claimantDid": body.get("claimantDid", ""),
            "reason": body.get("reason", ""),
            "evidence": body.get("evidence", {}),
            "status": "pending",
            "createdAt": _iso_now(),
        }
        self.claims[claim_id] = record
        return httpx.Response(
            status_code=201,
            json={"ok": True, "data": record},
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _ok(data: dict[str, Any]) -> httpx.Response:
    return httpx.Response(status_code=200, json={"ok": True, "data": data})


def _last_segment(path: str) -> str:
    return urllib.parse.unquote(path.rstrip("/").rsplit("/", 1)[-1])


def _iso_now() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def fake_pubkey_b64() -> str:
    """Return a syntactically-valid base64 32-byte public key."""
    return base64.b64encode(b"\x00" * 32).decode("ascii")


# ---------------------------------------------------------------------------
# Pytest fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def fake_backend() -> FakeColberBackend:
    return FakeColberBackend()


@pytest.fixture
def colber_client(fake_backend: FakeColberBackend) -> Iterator[ColberClient]:
    """A :class:`ColberClient` wired to the fake backend.

    Retries are turned off and the inter-retry sleep is a no-op so
    tests stay fast and deterministic.
    """
    transport = httpx.MockTransport(fake_backend.handle)
    transport_client = httpx.Client(transport=transport)

    def _fetch(*args: Any, **kwargs: Any) -> httpx.Response:
        return transport_client.request(*args, **kwargs)

    base_urls: BaseUrls = {
        "identity": "http://test/identity",
        "reputation": "http://test/reputation",
        "memory": "http://test/memory",
        "observability": "http://test/observability",
        "negotiation": "http://test/negotiation",
        "insurance": "http://test/insurance",
    }
    client = ColberClient(
        base_urls,
        fetch=_fetch,
        retries=RetryConfig(count=0, backoff_ms=0),
        sleep=lambda _s: None,
    )
    yield client
    client.close()
    transport_client.close()


@pytest.fixture
def make_instrumentation(colber_client: ColberClient) -> Callable[..., Any]:
    """Factory: build a :class:`ColberToolInstrumentation` bound to the test client."""
    from colber_autogen import ColberToolInstrumentation

    def _build(
        *,
        agent_did: str = "did:key:zTestAgent",
        operator_id: str = "test-op",
        service_name: str = "test-service",
        log_input_outputs: bool = False,
    ) -> ColberToolInstrumentation:
        return ColberToolInstrumentation(
            client=colber_client,
            agent_did=agent_did,
            operator_id=operator_id,
            service_name=service_name,
            log_input_outputs=log_input_outputs,
        )

    return _build


@pytest.fixture
def make_message_hook(colber_client: ColberClient) -> Callable[..., Any]:
    """Factory: build a :class:`ColberAgentMessageHook` bound to the test client."""
    from colber_autogen import ColberAgentMessageHook

    def _build(
        *,
        agent_did: str = "did:key:zTestAgent",
        operator_id: str = "test-op",
        service_name: str = "test-service",
        log_input_outputs: bool = False,
    ) -> ColberAgentMessageHook:
        return ColberAgentMessageHook(
            client=colber_client,
            agent_did=agent_did,
            operator_id=operator_id,
            service_name=service_name,
            log_input_outputs=log_input_outputs,
        )

    return _build


@pytest.fixture
def make_memory(colber_client: ColberClient) -> Callable[..., Any]:
    """Factory: build a :class:`ColberMemory` bound to the test client."""
    from colber_autogen import ColberMemory

    def _build(
        *,
        agent_did: str = "did:key:zTestAgent",
        **kwargs: Any,
    ) -> ColberMemory:
        return ColberMemory(client=colber_client, agent_did=agent_did, **kwargs)

    return _build
