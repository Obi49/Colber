"""Mirror of ``apps/sdk-typescript/test/services/memory.test.ts``."""

from __future__ import annotations

import json
from collections.abc import Callable
from urllib.parse import parse_qs, urlparse

import respx

from colber_sdk import ColberClient

from .._helpers import TEST_BASE_URLS

ID = "00000000-0000-0000-0000-000000000001"
OWNER = "did:key:zfoo"


def test_store_posts_to_memory_returns_id_embedding(
    make_client: Callable[..., ColberClient],
) -> None:
    with respx.mock:
        respx.post(f"{TEST_BASE_URLS['memory']}/v1/memory").respond(
            status_code=201,
            json={
                "ok": True,
                "data": {"id": ID, "embedding": {"model": "nomic-embed-text", "dim": 768}},
            },
        )
        client = make_client()
        r = client.memory.store(
            owner_did=OWNER,
            type="fact",
            text="water boils at 100C",
            permissions={"visibility": "private"},
        )
        assert r.id == ID
        assert r.embedding.dim == 768


def test_search_posts_to_memory_search_returns_hit_list(
    make_client: Callable[..., ColberClient],
) -> None:
    with respx.mock:
        route = respx.post(f"{TEST_BASE_URLS['memory']}/v1/memory/search").respond(
            json={
                "ok": True,
                "data": {
                    "hits": [
                        {
                            "id": ID,
                            "score": 0.91,
                            "type": "fact",
                            "ownerDid": OWNER,
                            "snippet": "water...",
                        }
                    ]
                },
            }
        )
        client = make_client()
        r = client.memory.search(
            query_did=OWNER, query_text="boiling", top_k=3, filters={"type": "fact"}
        )
        body = json.loads(route.calls.last.request.content)
        assert body["topK"] == 3
        assert body["filters"] == {"type": "fact"}
        assert len(r.hits) == 1
        assert r.hits[0].id == ID


def test_retrieve_gets_memory_id_with_caller_did(
    make_client: Callable[..., ColberClient],
) -> None:
    with respx.mock:
        route = respx.get(f"{TEST_BASE_URLS['memory']}/v1/memory/{ID}").respond(
            json={
                "ok": True,
                "data": {
                    "id": ID,
                    "ownerDid": OWNER,
                    "type": "fact",
                    "text": "water boils at 100C",
                    "payload": {},
                    "permissions": {"visibility": "private", "sharedWith": []},
                    "encryption": {"enabled": False, "algorithm": "", "keyId": ""},
                    "createdAt": "2026-04-30T00:00:00.000Z",
                    "updatedAt": "2026-04-30T00:00:00.000Z",
                    "version": 1,
                    "embedding": {"model": "nomic-embed-text", "dim": 768},
                },
            }
        )
        client = make_client()
        client.memory.retrieve(id=ID, caller_did=OWNER)
        url = urlparse(str(route.calls.last.request.url))
        assert parse_qs(url.query)["callerDid"] == [OWNER]
        assert url.path == f"/v1/memory/{ID}"


def test_update_patches_memory_id_with_partial_body(
    make_client: Callable[..., ColberClient],
) -> None:
    with respx.mock:
        route = respx.patch(f"{TEST_BASE_URLS['memory']}/v1/memory/{ID}").respond(
            json={
                "ok": True,
                "data": {
                    "id": ID,
                    "version": 2,
                    "embedding": {"model": "nomic-embed-text", "dim": 768},
                },
            }
        )
        client = make_client()
        r = client.memory.update(id=ID, caller_did=OWNER, text="water boils at 100°C at 1 atm")
        body = json.loads(route.calls.last.request.content)
        assert body == {"callerDid": OWNER, "text": "water boils at 100°C at 1 atm"}
        assert r.version == 2


def test_share_posts_to_memory_id_share_with_share_list(
    make_client: Callable[..., ColberClient],
) -> None:
    with respx.mock:
        route = respx.post(f"{TEST_BASE_URLS['memory']}/v1/memory/{ID}/share").respond(
            json={"ok": True, "data": {"id": ID, "sharedWith": ["did:key:zbar"]}}
        )
        client = make_client()
        r = client.memory.share(id=ID, caller_did=OWNER, share_with=["did:key:zbar"])
        body = json.loads(route.calls.last.request.content)
        assert body["shareWith"] == ["did:key:zbar"]
        assert r.shared_with == ["did:key:zbar"]
