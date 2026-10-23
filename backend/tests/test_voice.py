"""UNION Elon voice endpoints (TTS + STT) tests"""
import io
import json
import pytest
import requests

from conftest import BASE_URL, TOKEN

AUTH = {"Authorization": f"Bearer {TOKEN}"}


def _get_or_create_assistant_message_id() -> str:
    """Return a persisted assistant message_id (prefix msg_) for the test user."""
    # First try existing messages
    r = requests.get(f"{BASE_URL}/api/chat/messages?thread_id=main", headers=AUTH, timeout=15)
    if r.status_code == 200:
        for m in r.json():
            if m.get("role") == "assistant" and m.get("message_id", "").startswith("msg_") and m.get("text"):
                return m["message_id"]

    # Otherwise create one via SSE stream
    with requests.post(
        f"{BASE_URL}/api/chat/stream",
        headers={**AUTH, "Content-Type": "application/json"},
        json={"text": "In one short sentence, what is minimum wage in UK?", "thread_id": "main"},
        stream=True,
        timeout=60,
    ) as r:
        assert r.status_code == 200
        mid = None
        for raw in r.iter_lines(decode_unicode=True):
            if not raw or not raw.startswith("data: "):
                continue
            payload = json.loads(raw[6:])
            if payload.get("done"):
                mid = payload.get("message_id")
                break
            if "error" in payload:
                pytest.fail(f"stream error: {payload['error']}")
        assert mid, "No message_id from stream done event"
        return mid


# ---------------- TTS ----------------
class TestTTS:
    url = None
    audio_bytes = None
    message_id = None

    def test_tts_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/tts", json={"message_id": "x"})
        assert r.status_code == 401

    def test_tts_unknown_message(self):
        r = requests.post(f"{BASE_URL}/api/tts", headers=AUTH,
                          json={"message_id": "msg_doesnotexist_1234"})
        assert r.status_code == 404

    def test_tts_valid_message(self):
        TestTTS.message_id = _get_or_create_assistant_message_id()
        r = requests.post(f"{BASE_URL}/api/tts", headers=AUTH,
                          json={"message_id": TestTTS.message_id}, timeout=120)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "url" in d and d["url"].startswith("/api/tts/audio/") and d["url"].endswith(".mp3")
        TestTTS.url = d["url"]

    def test_tts_audio_fetch(self):
        assert TestTTS.url
        r = requests.get(f"{BASE_URL}{TestTTS.url}", timeout=60)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("audio/mpeg")
        assert len(r.content) > 1000, f"Audio too small: {len(r.content)}"
        TestTTS.audio_bytes = r.content

    def test_tts_audio_unknown_key(self):
        r = requests.get(f"{BASE_URL}/api/tts/audio/deadbeef.mp3")
        assert r.status_code == 404


# ---------------- Transcribe ----------------
class TestTranscribe:
    def test_transcribe_requires_auth(self):
        files = {"audio": ("tiny.m4a", b"\x00" * 500, "audio/m4a")}
        data = {"language": "pl"}
        r = requests.post(f"{BASE_URL}/api/transcribe", files=files, data=data)
        assert r.status_code == 401

    def test_transcribe_too_short(self):
        # <2000 bytes triggers too_short branch
        files = {"audio": ("tiny.m4a", b"\x00" * 500, "audio/m4a")}
        data = {"language": "pl"}
        r = requests.post(f"{BASE_URL}/api/transcribe", headers=AUTH, files=files, data=data)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["text"] == ""
        assert d["reason"] == "too_short"

    def test_transcribe_real_audio(self):
        # Use the TTS audio produced in TestTTS as input for STT
        audio = TestTTS.audio_bytes
        if not audio:
            # Produce one if TTS test did not run first
            mid = _get_or_create_assistant_message_id()
            r = requests.post(f"{BASE_URL}/api/tts", headers=AUTH, json={"message_id": mid}, timeout=120)
            assert r.status_code == 200
            r2 = requests.get(f"{BASE_URL}{r.json()['url']}", timeout=60)
            assert r2.status_code == 200
            audio = r2.content

        files = {"audio": ("sample.mp3", audio, "audio/mpeg")}
        data = {"language": "en"}
        r = requests.post(f"{BASE_URL}/api/transcribe", headers=AUTH,
                          files=files, data=data, timeout=120)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "text" in d
        # Should get some non-empty transcription
        assert isinstance(d["text"], str)
        assert len(d["text"]) > 0, f"Empty transcript: {d}"
