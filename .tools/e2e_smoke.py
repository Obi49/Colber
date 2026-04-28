#!/usr/bin/env python3
"""End-to-end smoke test of Praxis services running on the VM.

Exercises agent-identity, reputation, memory, observability by:
1. Generating a fresh Ed25519 keypair locally.
2. Registering a new agent on agent-identity.
3. Resolving the agent.
4. Submitting a signed feedback on reputation (between 2 freshly registered agents).
5. Reading the reputation score.
6. Storing a memory and searching it.
7. Ingesting logs + traces on observability and querying them back.
8. CRUD on observability alerts.

All HTTP requests go through the VM's exposed ports.
"""
import sys
import io
import os
import json
import time
import uuid
import base64
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

VM = os.environ.get("PRAXIS_VM", "100.83.10.125")
IDENTITY = f"http://{VM}:14001"
REPUTATION = f"http://{VM}:14011"
MEMORY = f"http://{VM}:14021"
OBSERVABILITY = f"http://{VM}:14031"


def http(method: str, url: str, body: dict | None = None) -> tuple[int, dict | str]:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url, data=data, method=method,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            payload = resp.read().decode("utf-8", errors="replace")
            try:
                return resp.status, json.loads(payload)
            except json.JSONDecodeError:
                return resp.status, payload
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        try:
            return e.code, json.loads(body)
        except json.JSONDecodeError:
            return e.code, body


def gen_ed25519_keypair() -> tuple[bytes, bytes]:
    """Generate Ed25519 keypair via Python stdlib (no external lib)."""
    # Use ed25519 from cryptography if available, else fall back to nacl
    try:
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        from cryptography.hazmat.primitives.serialization import (
            Encoding, PrivateFormat, PublicFormat, NoEncryption,
        )
    except ImportError:
        # Fall back: ask the VM to do it via SSH.
        raise SystemExit(
            "cryptography lib missing locally; install: pip install cryptography"
        )
    sk = Ed25519PrivateKey.generate()
    priv = sk.private_bytes(Encoding.Raw, PrivateFormat.Raw, NoEncryption())
    pub = sk.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
    return priv, pub


def sign_ed25519(priv: bytes, message: bytes) -> bytes:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    sk = Ed25519PrivateKey.from_private_bytes(priv)
    return sk.sign(message)


def b64(b: bytes) -> str:
    return base64.b64encode(b).decode()


def jcs_canonical(d: dict) -> bytes:
    """Tiny JCS-canonical (RFC 8785) serializer for our payload shapes.
    Sorts keys, no whitespace. Sufficient for flat dicts of strings/numbers."""
    return json.dumps(d, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def step(label: str):
    print(f"\n=== {label} ===")


def main() -> int:
    failed = []

    # ---- 1. Healthchecks ----
    step("Healthchecks")
    for name, base in [
        ("agent-identity", IDENTITY),
        ("reputation", REPUTATION),
        ("memory", MEMORY),
        ("observability", OBSERVABILITY),
    ]:
        code, body = http("GET", f"{base}/healthz")
        ok = code == 200
        print(f"  {name:<16} /healthz  -> {code} {'OK' if ok else 'FAIL'}")
        if not ok:
            failed.append(f"{name} healthz")

    # ---- 2. Register two agents ----
    step("Register agent A and B")
    operator_id = "op-test-" + uuid.uuid4().hex[:8]
    agents = {}
    for who in ("A", "B"):
        priv, pub = gen_ed25519_keypair()
        code, body = http("POST", f"{IDENTITY}/v1/identity/register", {
            "publicKey": b64(pub),
            "ownerOperatorId": operator_id,
        })
        if code not in (200, 201):
            print(f"  ✗ register {who}: {code} {body}")
            failed.append(f"register {who}")
            continue
        did = body.get("did") or (body.get("data") or {}).get("did")
        agent_id = body.get("agentId") or (body.get("data") or {}).get("agentId")
        agents[who] = {"priv": priv, "pub": pub, "did": did, "agentId": agent_id}
        print(f"  ✓ {who}: did={did[:60]}...")

    # ---- 3. Resolve A ----
    step("Resolve agent A")
    if "A" in agents:
        code, body = http("GET", f"{IDENTITY}/v1/identity/{agents['A']['did']}")
        print(f"  resolve A -> {code}")
        if code != 200:
            failed.append("resolve A")

    # ---- 4. Verify a signature via agent-identity ----
    step("Verify a signature via agent-identity")
    if "A" in agents:
        msg = b"hello praxis"
        sig = sign_ed25519(agents["A"]["priv"], msg)
        code, body = http("POST", f"{IDENTITY}/v1/identity/verify", {
            "did": agents["A"]["did"],
            "message": b64(msg),
            "signature": b64(sig),
        })
        print(f"  verify A -> {code} {body}")
        data = body.get("data", {}) if isinstance(body, dict) else {}
        valid = data.get("valid") is True
        if code != 200 or not valid:
            failed.append("verify A signature")

    # ---- 5. Submit a signed feedback A -> B ----
    step("Submit signed feedback A -> B")
    if "A" in agents and "B" in agents:
        feedback_id = str(uuid.uuid4())
        tx_id = "tx-" + uuid.uuid4().hex[:12]
        signed_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        payload = {
            "feedbackId": feedback_id,
            "fromDid": agents["A"]["did"],
            "toDid": agents["B"]["did"],
            "txId": tx_id,
            "rating": 5,
            "dimensions": {"delivery": 5, "quality": 5, "communication": 4},
            "signedAt": signed_at,
        }
        sig = sign_ed25519(agents["A"]["priv"], jcs_canonical(payload))
        code, body = http("POST", f"{REPUTATION}/v1/reputation/feedback", {
            **payload,
            "signature": b64(sig),
        })
        print(f"  feedback -> {code}")
        if code not in (200, 201):
            print(f"     body: {body}")
            failed.append("submit feedback")

    # ---- 6. Read reputation score for B ----
    step("Read score B")
    if "B" in agents:
        code, body = http("GET", f"{REPUTATION}/v1/reputation/score/{agents['B']['did']}")
        print(f"  score B -> {code} {body if isinstance(body, dict) else body[:120]}")
        if code != 200:
            failed.append("score B")

    # ---- 7. Memory store + search ----
    step("Memory store + search")
    if "A" in agents:
        store = http("POST", f"{MEMORY}/v1/memory", {
            "ownerDid": agents["A"]["did"],
            "type": "fact",
            "text": "Agent A delivers structured PDF reports within 24 hours, in French and English.",
            "payload": {"language": ["fr", "en"], "format": "pdf"},
            "permissions": {"visibility": "public"},
        })
        code, body = store
        print(f"  store -> {code}")
        if code not in (200, 201):
            print(f"     body: {body}")
            failed.append("memory store")
        else:
            search = http("POST", f"{MEMORY}/v1/memory/search", {
                "queryDid": agents["A"]["did"],
                "queryText": "fast PDF delivery",
                "topK": 3,
            })
            scode, sbody = search
            print(f"  search -> {scode} {len(sbody) if isinstance(sbody, list) else sbody}")
            if scode != 200:
                failed.append("memory search")

    # ---- 8. Observability: ingest logs + query ----
    step("Observability ingest logs + query")
    trace_id = uuid.uuid4().hex + uuid.uuid4().hex[:0]  # 32 hex
    trace_id = trace_id[:32]
    span_a = uuid.uuid4().hex[:16]
    span_b = uuid.uuid4().hex[:16]
    now_iso = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    log_events = [
        {
            "timestamp": now_iso,
            "traceId": trace_id,
            "spanId": span_a,
            "service": "e2e-smoke",
            "operatorId": operator_id,
            "level": "info",
            "message": "smoke test log A",
            "attributes": {"step": "ingest-logs", "n": 1},
            "resource": {"env": "dev", "region": "vm-beta"},
        },
        {
            "timestamp": now_iso,
            "traceId": trace_id,
            "spanId": span_b,
            "service": "e2e-smoke",
            "operatorId": operator_id,
            "level": "warn",
            "message": "smoke test log B",
            "attributes": {"step": "ingest-logs", "n": 2},
            "resource": {"env": "dev", "region": "vm-beta"},
        },
    ]
    code, body = http("POST", f"{OBSERVABILITY}/v1/observability/logs", {"events": log_events})
    print(f"  POST /logs -> {code}")
    if code != 202:
        print(f"     body: {body}")
        failed.append("observability ingest logs")
    else:
        accepted = (body.get("data") or {}).get("accepted") if isinstance(body, dict) else 0
        print(f"     accepted={accepted}, rejected={(body.get('data') or {}).get('rejected')}")

    # Give the batcher a chance to flush (flush interval = 1s).
    time.sleep(2.5)

    # Query logs back. Use a generous time window: ±5 minutes.
    now_dt = datetime.now(timezone.utc)
    window_from = (now_dt - timedelta(minutes=5)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    window_to = (now_dt + timedelta(minutes=5)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    code, body = http("POST", f"{OBSERVABILITY}/v1/observability/query", {
        "scope": "logs",
        "filters": [
            {"field": "service", "op": "eq", "value": "e2e-smoke"},
            {"field": "operatorId", "op": "eq", "value": operator_id},
        ],
        "timeRange": {"from": window_from, "to": window_to},
        "limit": 50,
        "offset": 0,
    })
    rows = (body.get("data") or {}).get("rows", []) if isinstance(body, dict) else []
    print(f"  POST /query (logs) -> {code} rows={len(rows)}")
    if code != 200 or len(rows) < 2:
        print(f"     body: {body}")
        failed.append("observability query logs")

    # ---- 9. Observability: ingest spans + query ----
    step("Observability ingest spans + query")
    span_start = (now_dt - timedelta(seconds=2)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    span_end = now_dt.isoformat(timespec="milliseconds").replace("+00:00", "Z")
    span_payload = {
        "traceId": trace_id,
        "spanId": uuid.uuid4().hex[:16],
        "name": "smoke.span",
        "kind": "internal",
        "service": "e2e-smoke",
        "operatorId": operator_id,
        "startTimestamp": span_start,
        "endTimestamp": span_end,
        "durationMs": 2000,
        "status": "ok",
        "attributes": {"step": "ingest-spans"},
    }
    code, body = http("POST", f"{OBSERVABILITY}/v1/observability/traces", {"spans": [span_payload]})
    print(f"  POST /traces -> {code}")
    if code != 202:
        print(f"     body: {body}")
        failed.append("observability ingest spans")

    time.sleep(2.5)

    code, body = http("POST", f"{OBSERVABILITY}/v1/observability/query", {
        "scope": "spans",
        "filters": [{"field": "service", "op": "eq", "value": "e2e-smoke"}],
        "timeRange": {"from": window_from, "to": window_to},
        "limit": 50,
        "offset": 0,
    })
    rows = (body.get("data") or {}).get("rows", []) if isinstance(body, dict) else []
    print(f"  POST /query (spans) -> {code} rows={len(rows)}")
    if code != 200 or len(rows) < 1:
        print(f"     body: {body}")
        failed.append("observability query spans")

    # ---- 10. Observability: CRUD alert ----
    step("Observability CRUD alert")
    alert_create = {
        "ownerOperatorId": operator_id,
        "name": "smoke-alert-error-rate",
        "description": "Alert when e2e-smoke service emits >=3 errors in 60s",
        "scope": "logs",
        "condition": {
            "operator": "and",
            "filters": [
                {"field": "service", "op": "eq", "value": "e2e-smoke"},
                {"field": "level", "op": "eq", "value": "error"},
            ],
            "windowSeconds": 60,
            "threshold": 3,
        },
        "cooldownSeconds": 120,
        "notification": {
            "channels": [{"type": "webhook", "url": "https://example.invalid/hook"}]
        },
    }
    code, body = http("POST", f"{OBSERVABILITY}/v1/observability/alerts", alert_create)
    alert_id = ((body.get("data") or {}).get("id") if isinstance(body, dict) else None)
    print(f"  POST /alerts -> {code} id={alert_id}")
    if code != 201 or not alert_id:
        print(f"     body: {body}")
        failed.append("observability create alert")

    if alert_id:
        code, body = http("GET", f"{OBSERVABILITY}/v1/observability/alerts/{alert_id}")
        print(f"  GET /alerts/:id -> {code}")
        if code != 200:
            failed.append("observability get alert")

        code, body = http("PATCH", f"{OBSERVABILITY}/v1/observability/alerts/{alert_id}", {
            "enabled": False,
            "cooldownSeconds": 600,
        })
        enabled_after = ((body.get("data") or {}).get("enabled") if isinstance(body, dict) else None)
        print(f"  PATCH /alerts/:id -> {code} enabled={enabled_after}")
        if code != 200 or enabled_after is not False:
            failed.append("observability patch alert")

        code, body = http("GET", f"{OBSERVABILITY}/v1/observability/alerts?operatorId={operator_id}")
        alerts = ((body.get("data") or {}).get("alerts", []) if isinstance(body, dict) else [])
        print(f"  GET /alerts?operatorId -> {code} count={len(alerts)}")
        if code != 200 or not any(a.get("id") == alert_id for a in alerts):
            failed.append("observability list alerts")

        code, body = http("DELETE", f"{OBSERVABILITY}/v1/observability/alerts/{alert_id}")
        print(f"  DELETE /alerts/:id -> {code}")
        if code != 204:
            failed.append("observability delete alert")

        code, body = http("GET", f"{OBSERVABILITY}/v1/observability/alerts/{alert_id}")
        print(f"  GET /alerts/:id (post-delete) -> {code}")
        if code != 404:
            failed.append("observability get alert post-delete")

    # ---- Summary ----
    print("\n" + ("=" * 50))
    if failed:
        print(f"FAILURES ({len(failed)}):")
        for f in failed:
            print(f"  - {f}")
        return 1
    print("ALL E2E STEPS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
