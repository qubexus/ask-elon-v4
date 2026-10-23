"""Unit tests for backend/ai.py with a fake Gemini client (no network, no key needed)."""
import asyncio, importlib, os, sys, types as pytypes, wave, io
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))


class FakeModels:
    def __init__(self):
        self.calls = []

    async def generate_content_stream(self, **kw):
        self.calls.append(("stream", kw))
        async def gen():
            for t in ["Cześć", ", ", "Jan"]:
                yield pytypes.SimpleNamespace(text=t)
        return gen()

    async def generate_content(self, **kw):
        self.calls.append(("gen", kw))
        cfg = kw.get("config")
        if cfg is not None and getattr(cfg, "response_modalities", None):
            part = pytypes.SimpleNamespace(inline_data=pytypes.SimpleNamespace(data=b"\x00\x01" * 2400))
            return pytypes.SimpleNamespace(candidates=[pytypes.SimpleNamespace(content=pytypes.SimpleNamespace(parts=[part]))])
        return pytypes.SimpleNamespace(text='{"ok": true}', candidates=[])


@pytest.fixture()
def ai(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.delenv("STT_PROVIDER", raising=False)
    monkeypatch.delenv("TTS_PROVIDER", raising=False)
    import ai as mod
    mod = importlib.reload(mod)
    fake = FakeModels()
    mod._client = pytypes.SimpleNamespace(aio=pytypes.SimpleNamespace(models=fake))
    mod._fake = fake
    return mod


def test_not_configured(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    import ai as mod
    mod = importlib.reload(mod)
    assert not mod.ai_configured()
    with pytest.raises(mod.AINotConfigured):
        mod.client()


def test_stream_chat_builds_history(ai):
    async def run():
        return [d async for d in ai.stream_chat("SYSTEM", [{"role": "user", "content": "a"},
                                                             {"role": "assistant", "content": "b"}], "c")]
    assert "".join(asyncio.run(run())) == "Cześć, Jan"
    kind, kw = ai._fake.calls[0]
    assert kw["model"] == ai.GEMINI_MODEL
    assert [c.role for c in kw["contents"]] == ["user", "model", "user"]
    assert kw["contents"][-1].parts[0].text == "c"
    assert kw["config"].system_instruction == "SYSTEM"


def test_generate_with_pdf_and_json(ai):
    out = asyncio.run(ai.generate("SYS", "Analyse", files=[(b"%PDF-1.4", "application/pdf")], json_output=True))
    assert out == '{"ok": true}'
    kw = ai._fake.calls[0][1]
    parts = kw["contents"][0].parts
    assert parts[0].inline_data.mime_type == "application/pdf" and parts[-1].text == "Analyse"
    assert kw["config"].response_mime_type == "application/json"


def test_transcribe_sends_audio(ai):
    asyncio.run(ai.transcribe(b"x" * 3000, "recording.webm", "", "pl", "Polish", "SSP"))
    parts = ai._fake.calls[0][1]["contents"][0].parts
    assert parts[1].inline_data.mime_type == "audio/webm"
    assert "Polish" in parts[0].text
    assert ai.audio_mime("recording.m4a", "application/octet-stream") == "audio/mp4"


def test_tts_returns_audio(ai):
    audio, mime, ext = asyncio.run(ai.synthesize(["Cześć"], "Read calmly:"))
    if ai._mp3_encoder():
        assert (mime, ext) == ("audio/mpeg", "mp3") and len(audio) > 0
    else:
        assert (mime, ext) == ("audio/wav", "wav")
        with wave.open(io.BytesIO(audio)) as w:
            assert w.getframerate() == 24000 and w.getnchannels() == 1 and w.getsampwidth() == 2
    kw = ai._fake.calls[0][1]
    assert kw["model"] == ai.GEMINI_TTS_MODEL
    assert kw["config"].speech_config.voice_config.prebuilt_voice_config.voice_name == ai.GEMINI_TTS_VOICE
