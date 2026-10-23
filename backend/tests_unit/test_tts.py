"""Unit tests for read-aloud (TTS): text cleaning, chunking, /api/tts auth, ownership, caching, limits.
Fake collections + fake synthesiser – no real database, no network, no key needed.

Run:  cd backend && python -m pytest tests_unit -n 0
"""
import asyncio
import io
import os
import types as pytypes
import wave
from datetime import datetime, timezone

os.environ["DB_NAME"] = "ask_elon_unit_tts"  # never the live DB
os.environ.setdefault("JWT_SECRET", "unit-test-secret-unit-test-secret-1234")

import pytest  # noqa: E402
from fastapi import HTTPException, Request  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import ai  # noqa: E402
import server  # noqa: E402


class Coll:
    def __init__(self, docs=None):
        self.docs = list(docs or [])

    async def find_one(self, q, proj=None):
        for d in self.docs:
            if all(d.get(k) == v for k, v in q.items()):
                return dict(d)
        return None

    async def update_one(self, q, upd, upsert=False):
        doc = await self.find_one(q)
        if doc:
            for d in self.docs:
                if all(d.get(k) == v for k, v in q.items()):
                    d.update(upd["$set"])
        elif upsert:
            self.docs.append({"_id": len(self.docs) + 1, **upd["$set"]})

    async def count_documents(self, q):
        return len(self.docs)

    def find(self, q, proj=None):
        docs = self.docs

        class C:
            def sort(self, k, d):
                self.d = sorted(docs, key=lambda x: x.get(k))
                return self

            def limit(self, n):
                self.d = self.d[:n]
                return self

            async def to_list(self, n):
                return self.d

        return C()

    async def delete_many(self, q):
        ids = set(q["_id"]["$in"])
        self.docs = [d for d in self.docs if d["_id"] not in ids]


USERS = {"tok-a": {"user_id": "user_a", "locale": "pl"}, "tok-b": {"user_id": "user_b", "locale": "ro"}}


@pytest.fixture()
def env(monkeypatch):
    msgs = Coll([
        {"message_id": "msg_a", "user_id": "user_a", "text": "**Masz prawo** do urlopu 🙂 Zobacz [gov.uk](https://gov.uk)."},
        {"message_id": "msg_long", "user_id": "user_a", "text": "To jest zdanie testowe. " * 400},
        {"message_id": "msg_emoji", "user_id": "user_a", "text": "🙂👍"},
        {"message_id": "msg_b", "user_id": "user_b", "text": "Ai dreptul la concediu."},
    ])
    cache = Coll()
    monkeypatch.setattr(server, "db", pytypes.SimpleNamespace(messages=msgs, tts_cache=cache))

    async def fake_user(request: Request):
        tok = request.headers.get("Authorization", "")[7:]
        if tok not in USERS:
            raise HTTPException(401, "Not authenticated")
        return USERS[tok]

    monkeypatch.setattr(server, "current_user", fake_user)
    calls = []

    async def fake_synth(chunks, style):
        calls.append((chunks, style))
        return b"ID3fake", "audio/mpeg", "mp3"

    monkeypatch.setattr(server.ai, "synthesize", fake_synth)
    server._hits.clear()
    return pytypes.SimpleNamespace(client=TestClient(server.app), cache=cache, calls=calls)


def h(tok):
    return {"Authorization": f"Bearer {tok}"}


def test_clean_for_tts_markdown_links_emoji():
    t = "## Twoje prawa 🙂\n**Urlop**: 5,6 tyg. Zobacz [gov.uk](https://gov.uk/x).\n- SSP £118.75\n1. Napisz do HR\nWięcej: https://acas.org.uk"
    out = server.clean_for_tts(t)
    assert out == "Twoje prawa. Urlop: 5,6 tyg. Zobacz gov.uk. SSP £118.75. Napisz do HR. Więcej"
    assert "http" not in out and "*" not in out and "🙂" not in out
    assert server.clean_for_tts("🙂👍") == ""
    assert server.clean_for_tts("Kod `ACAS` i ```print(1)``` koniec") == "Kod ACAS i koniec"


def test_chunk_text_respects_limit():
    chunks = server.chunk_text("Ala ma kota. " * 300, 700)
    assert len(chunks) > 1 and all(len(c) <= 700 for c in chunks)
    assert " ".join(chunks).count("Ala") == 300


def test_tts_requires_auth(env):
    assert env.client.post("/api/tts", json={"message_id": "msg_a"}).status_code == 401
    assert env.client.post("/api/tts", json={"message_id": "msg_a"}, headers=h("bad")).status_code == 401
    assert not env.calls


def test_tts_only_own_messages(env):
    assert env.client.post("/api/tts", json={"message_id": "msg_b"}, headers=h("tok-a")).status_code == 404
    assert env.client.post("/api/tts", json={"message_id": "msg_emoji"}, headers=h("tok-a")).status_code == 400


def test_tts_generates_caches_and_serves(env):
    r = env.client.post("/api/tts", json={"message_id": "msg_a"}, headers=h("tok-a"))
    assert r.status_code == 200, r.text
    url = r.json()["url"]
    assert url.startswith("/api/tts/audio/") and url.endswith(".mp3") and r.json()["lang"] == "pl"
    chunks, style = env.calls[0]
    assert chunks == ["Masz prawo do urlopu Zobacz gov.uk."]
    assert "Polish" in style
    # second request: served from cache, no new synthesis
    assert env.client.post("/api/tts", json={"message_id": "msg_a"}, headers=h("tok-a")).json()["url"] == url
    assert len(env.calls) == 1
    a = env.client.get(url)
    assert a.status_code == 200 and a.headers["content-type"] == "audio/mpeg" and a.content == b"ID3fake"
    assert env.client.get("/api/tts/audio/nothex.mp3").status_code == 404


def test_tts_language_follows_user(env):
    env.client.post("/api/tts", json={"message_id": "msg_b"}, headers=h("tok-b"))
    assert "Romanian" in env.calls[0][1]


def test_tts_caps_long_text(env):
    env.client.post("/api/tts", json={"message_id": "msg_long"}, headers=h("tok-a"))
    chunks = env.calls[0][0]
    assert sum(len(c) for c in chunks) <= server.TTS_MAX_CHARS
    assert all(len(c) <= server.TTS_CHUNK_CHARS for c in chunks)
    assert chunks[-1].endswith(".")


def test_tts_rate_limited(env, monkeypatch):
    monkeypatch.setattr(server, "RATE_LIMIT_OFF", False)
    for i in range(15):
        env.cache.docs.clear()
        assert env.client.post("/api/tts", json={"message_id": "msg_a"}, headers=h("tok-a")).status_code == 200
    env.cache.docs.clear()
    assert env.client.post("/api/tts", json={"message_id": "msg_a"}, headers=h("tok-a")).status_code == 429


def test_tts_cache_is_bounded(env, monkeypatch):
    monkeypatch.setattr(server, "TTS_CACHE_MAX", 2)
    env.cache.docs[:] = [{"_id": 100 + i, "key": f"k{i}", "created_at": datetime(2026, 1, i + 1, tzinfo=timezone.utc)} for i in range(3)]
    env.client.post("/api/tts", json={"message_id": "msg_a"}, headers=h("tok-a"))
    assert len(env.cache.docs) == 2 and {d.get("key") for d in env.cache.docs} >= {"k2"}


def test_synthesize_mp3_parallel_with_retry(monkeypatch):
    seen = []

    class Models:
        async def generate_content(self, **kw):
            part = kw["contents"].split("\n\n", 1)[1]
            seen.append(part)
            if part == "B" and seen.count("B") == 1:  # first try empty -> retried
                return pytypes.SimpleNamespace(candidates=[pytypes.SimpleNamespace(content=pytypes.SimpleNamespace(parts=[]))])
            data = b"\x00\x01" * 2400
            p = pytypes.SimpleNamespace(inline_data=pytypes.SimpleNamespace(data=data))
            return pytypes.SimpleNamespace(candidates=[pytypes.SimpleNamespace(content=pytypes.SimpleNamespace(parts=[p]))])

    monkeypatch.setattr(ai, "GEMINI_API_KEY", "k")
    monkeypatch.setattr(ai, "TTS_PROVIDER", "gemini")
    monkeypatch.setattr(ai, "_tts_cooldown", {})
    monkeypatch.setattr(ai, "_client", pytypes.SimpleNamespace(aio=pytypes.SimpleNamespace(models=Models())))
    audio, mime, ext = asyncio.run(ai.synthesize(["A", "B", "C"], "Read:"))
    assert seen.count("B") == 2
    if ai._mp3_encoder():
        assert (mime, ext) == ("audio/mpeg", "mp3") and len(audio) > 100
        assert ai.tts_signature().endswith("|mp3")
    else:
        assert (mime, ext) == ("audio/wav", "wav")
        with wave.open(io.BytesIO(audio)) as w:
            assert w.getframerate() == 24000


def test_synthesize_falls_back_when_model_out_of_quota(monkeypatch):
    used = []

    class QuotaError(Exception):
        code = 429

    class Models:
        async def generate_content(self, **kw):
            used.append(kw["model"])
            if kw["model"] == "main-tts":
                raise QuotaError("429 RESOURCE_EXHAUSTED free tier")
            p = pytypes.SimpleNamespace(inline_data=pytypes.SimpleNamespace(data=b"\x00\x01" * 2400))
            return pytypes.SimpleNamespace(candidates=[pytypes.SimpleNamespace(content=pytypes.SimpleNamespace(parts=[p]))])

    monkeypatch.setattr(ai, "GEMINI_API_KEY", "k")
    monkeypatch.setattr(ai, "TTS_PROVIDER", "gemini")
    monkeypatch.setattr(ai, "GEMINI_TTS_MODEL", "main-tts")
    monkeypatch.setattr(ai, "GEMINI_TTS_FALLBACK_MODELS", ["backup-tts"])
    monkeypatch.setattr(ai, "_tts_cooldown", {})
    monkeypatch.setattr(ai, "_client", pytypes.SimpleNamespace(aio=pytypes.SimpleNamespace(models=Models())))
    asyncio.run(ai.synthesize(["Zdanie."], "Read:"))
    assert used == ["main-tts", "backup-tts"]
    asyncio.run(ai.synthesize(["Drugie."], "Read:"))  # exhausted model is skipped for a while
    assert used == ["main-tts", "backup-tts", "backup-tts"]
