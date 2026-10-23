"""AI helpers for Ask Elon – Google Gemini via the official google-genai SDK.

Everything works with one key: GEMINI_API_KEY (Google AI Studio).
Optionally speech can use OpenAI instead (STT_PROVIDER=openai / TTS_PROVIDER=openai + OPENAI_API_KEY).
"""
import io
import os
import wave
import logging
from typing import AsyncIterator, Iterable, List, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)


def _env(name: str, default: str = "") -> str:
    return (os.environ.get(name) or "").strip() or default


GEMINI_API_KEY = _env("GEMINI_API_KEY") or _env("GOOGLE_API_KEY")
GEMINI_MODEL = _env("GEMINI_MODEL", "gemini-2.5-flash")              # chat
GEMINI_DOC_MODEL = _env("GEMINI_DOC_MODEL", GEMINI_MODEL)            # documents, payslip audit, photo check
GEMINI_STT_MODEL = _env("GEMINI_STT_MODEL", GEMINI_MODEL)            # dictation (audio -> text)
GEMINI_TTS_MODEL = _env("GEMINI_TTS_MODEL", "gemini-2.5-flash-preview-tts")
GEMINI_TTS_VOICE = _env("GEMINI_TTS_VOICE", "Charon")
TTS_SAMPLE_RATE = 24000  # Gemini TTS returns 16-bit mono PCM @ 24 kHz

OPENAI_API_KEY = _env("OPENAI_API_KEY")
STT_PROVIDER = _env("STT_PROVIDER", "gemini").lower()
TTS_PROVIDER = _env("TTS_PROVIDER", "gemini").lower()
OPENAI_STT_MODEL = _env("OPENAI_STT_MODEL", "gpt-4o-mini-transcribe")
OPENAI_TTS_MODEL = _env("OPENAI_TTS_MODEL", "gpt-4o-mini-tts")
OPENAI_TTS_VOICE = _env("OPENAI_TTS_VOICE", "onyx")


class AINotConfigured(Exception):
    """Raised when the AI key is missing – endpoints turn it into a clear 503."""


_client = None


def ai_configured() -> bool:
    return bool(GEMINI_API_KEY)


def client():
    global _client
    if not GEMINI_API_KEY:
        raise AINotConfigured("AI is not configured on the server (GEMINI_API_KEY missing)")
    if _client is None:
        from google import genai
        _client = genai.Client(api_key=GEMINI_API_KEY)
    return _client


def _types():
    from google.genai import types
    return types


def _history_contents(history: Iterable[dict], text: Optional[str] = None):
    types = _types()
    out = []
    for m in history:
        if not m.get("content"):
            continue
        role = "model" if m["role"] == "assistant" else "user"
        out.append(types.Content(role=role, parts=[types.Part.from_text(text=m["content"])]))
    if text is not None:
        out.append(types.Content(role="user", parts=[types.Part.from_text(text=text)]))
    return out


async def stream_chat(system: str, history: List[dict], text: str) -> AsyncIterator[str]:
    """Streams text deltas. `history` = [{"role": "user"|"assistant", "content": str}] oldest first."""
    types = _types()
    cfg = types.GenerateContentConfig(system_instruction=system)
    stream = await client().aio.models.generate_content_stream(
        model=GEMINI_MODEL, contents=_history_contents(history, text), config=cfg)
    async for chunk in stream:
        try:
            delta = chunk.text
        except Exception:  # chunks without text parts (e.g. safety metadata)
            delta = None
        if delta:
            yield delta


async def generate(system: str, prompt: str, files: Optional[List[Tuple[bytes, str]]] = None,
                   json_output: bool = False, model: Optional[str] = None) -> str:
    """One-shot generation, optionally with files (PDF / images) as (bytes, mime)."""
    types = _types()
    parts = [types.Part.from_bytes(data=d, mime_type=m) for d, m in (files or [])]
    parts.append(types.Part.from_text(text=prompt))
    cfg = types.GenerateContentConfig(system_instruction=system,
                                      response_mime_type="application/json" if json_output else None)
    resp = await client().aio.models.generate_content(
        model=model or GEMINI_DOC_MODEL, contents=[types.Content(role="user", parts=parts)], config=cfg)
    return resp.text or ""


# ---------------- Speech-to-text ----------------
AUDIO_MIME = {".webm": "audio/webm", ".m4a": "audio/mp4", ".mp4": "audio/mp4", ".aac": "audio/aac",
              ".mp3": "audio/mp3", ".wav": "audio/wav", ".ogg": "audio/ogg", ".flac": "audio/flac",
              ".caf": "audio/x-caf", ".3gp": "audio/3gpp"}


def audio_mime(filename: str, content_type: str) -> str:
    ct = (content_type or "").split(";")[0].strip().lower()
    if ct.startswith("audio/") or ct == "video/webm":
        return "audio/webm" if ct == "video/webm" else ct
    ext = os.path.splitext((filename or "").lower())[1]
    return AUDIO_MIME.get(ext, "audio/mp4")


async def transcribe(data: bytes, filename: str, content_type: str, language: Optional[str],
                     language_name: Optional[str], hint: str) -> str:
    if STT_PROVIDER == "openai" and OPENAI_API_KEY:
        return await _openai_transcribe(data, filename, language, hint)
    types = _types()
    lang = f" The speaker most likely speaks {language_name}." if language_name else ""
    instruction = ("Transcribe this voice recording word for word." + lang +
                   " Keep the original language (Polish, English or Romanian) – do not translate. "
                   f"Vocabulary that may appear: {hint} "
                   "Return ONLY the transcript text. If there is no intelligible speech, return an empty string.")
    resp = await client().aio.models.generate_content(
        model=GEMINI_STT_MODEL,
        contents=[types.Content(role="user", parts=[
            types.Part.from_text(text=instruction),
            types.Part.from_bytes(data=data, mime_type=audio_mime(filename, content_type))])],
        config=types.GenerateContentConfig(temperature=0.0))
    return (resp.text or "").strip()


async def _openai_transcribe(data: bytes, filename: str, language: Optional[str], hint: str) -> str:
    form = {"model": OPENAI_STT_MODEL, "response_format": "json", "prompt": hint, "temperature": "0"}
    if language:
        form["language"] = language
    async with httpx.AsyncClient(timeout=120) as hc:
        r = await hc.post("https://api.openai.com/v1/audio/transcriptions",
                          headers={"Authorization": f"Bearer {OPENAI_API_KEY}"}, data=form,
                          files={"file": (filename or "recording.m4a", data)})
    r.raise_for_status()
    return (r.json().get("text") or "").strip()


# ---------------- Text-to-speech ----------------
def tts_signature() -> str:
    if TTS_PROVIDER == "openai" and OPENAI_API_KEY:
        return f"openai|{OPENAI_TTS_MODEL}|{OPENAI_TTS_VOICE}|mp3"
    return f"gemini|{GEMINI_TTS_MODEL}|{GEMINI_TTS_VOICE}|wav"


def pcm_to_wav(pcm: bytes, rate: int = TTS_SAMPLE_RATE) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    return buf.getvalue()


async def synthesize(chunks: List[str], style: str) -> Tuple[bytes, str, str]:
    """Returns (audio bytes, mime type, file extension)."""
    if TTS_PROVIDER == "openai" and OPENAI_API_KEY:
        audio = b""
        async with httpx.AsyncClient(timeout=120) as hc:
            for part in chunks:
                r = await hc.post("https://api.openai.com/v1/audio/speech",
                                  headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
                                  json={"model": OPENAI_TTS_MODEL, "voice": OPENAI_TTS_VOICE, "input": part,
                                        "instructions": style, "response_format": "mp3"})
                r.raise_for_status()
                audio += r.content
        return audio, "audio/mpeg", "mp3"
    types = _types()
    cfg = types.GenerateContentConfig(
        response_modalities=["AUDIO"],
        speech_config=types.SpeechConfig(voice_config=types.VoiceConfig(
            prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=GEMINI_TTS_VOICE))))
    pcm = b""
    for part in chunks:
        resp = await client().aio.models.generate_content(
            model=GEMINI_TTS_MODEL, contents=f"{style}\n\n{part}", config=cfg)
        for p in resp.candidates[0].content.parts:
            if p.inline_data and p.inline_data.data:
                pcm += p.inline_data.data
    if not pcm:
        raise RuntimeError("TTS returned no audio")
    return pcm_to_wav(pcm), "audio/wav", "wav"
