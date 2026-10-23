"""AI helpers for Ask Elon – Google Gemini via the official google-genai SDK.

Everything works with one key: GEMINI_API_KEY (Google AI Studio).
Optionally speech can use OpenAI instead (STT_PROVIDER=openai / TTS_PROVIDER=openai + OPENAI_API_KEY).
"""
import asyncio
import io
import os
import time
import wave
import logging
from typing import AsyncIterator, Iterable, List, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)


def _env(name: str, default: str = "") -> str:
    return (os.environ.get(name) or "").strip() or default


GEMINI_API_KEY = _env("GEMINI_API_KEY") or _env("GOOGLE_API_KEY")
GEMINI_MODEL = _env("GEMINI_MODEL", "gemini-3.5-flash")              # chat
GEMINI_DOC_MODEL = _env("GEMINI_DOC_MODEL", GEMINI_MODEL)            # documents, payslip audit, photo check
GEMINI_STT_MODEL = _env("GEMINI_STT_MODEL", GEMINI_MODEL)            # dictation (audio -> text)
GEMINI_TTS_MODEL = _env("GEMINI_TTS_MODEL", "gemini-2.5-flash-preview-tts")
GEMINI_TTS_VOICE = _env("GEMINI_TTS_VOICE", "Charon")
# Used in order when the main TTS model is out of quota or unavailable (each model has its own quota).
GEMINI_TTS_FALLBACK_MODELS = [m.strip() for m in _env(
    "GEMINI_TTS_FALLBACK_MODELS", "gemini-3.8-flash-lite-tts,gemini-3.1-flash-tts-preview").split(",") if m.strip()]
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


# Google sometimes answers 503 "high demand" / 429 for a few seconds. Retry those, then try the
# optional fallback model (GEMINI_FALLBACK_MODEL), before giving up.
GEMINI_FALLBACK_MODEL = _env("GEMINI_FALLBACK_MODEL", "")
RETRY_DELAYS = (2, 5)


def _retryable(e: Exception) -> bool:
    code = getattr(e, "code", None) or getattr(e, "status_code", None)
    return code in (429, 500, 502, 503, 504)


def _models(primary: str) -> List[str]:
    return [primary] + ([GEMINI_FALLBACK_MODEL] if GEMINI_FALLBACK_MODEL and GEMINI_FALLBACK_MODEL != primary else [])


async def stream_chat(system: str, history: List[dict], text: str) -> AsyncIterator[str]:
    """Streams text deltas. `history` = [{"role": "user"|"assistant", "content": str}] oldest first."""
    types = _types()
    cfg = types.GenerateContentConfig(system_instruction=system)
    contents = _history_contents(history, text)
    attempts = [(m, d) for m in _models(GEMINI_MODEL) for d in (0,) + RETRY_DELAYS]
    for i, (model, delay) in enumerate(attempts):
        if delay:
            await asyncio.sleep(delay)
        started = False
        try:
            stream = await client().aio.models.generate_content_stream(model=model, contents=contents, config=cfg)
            async for chunk in stream:
                try:
                    delta = chunk.text
                except Exception:  # chunks without text parts (e.g. safety metadata)
                    delta = None
                if delta:
                    started = True
                    yield delta
            return
        except Exception as e:
            # Only retry if nothing was sent to the user yet.
            if started or not _retryable(e) or i == len(attempts) - 1:
                raise
            logger.warning("Gemini %s busy (%s), retrying", model, getattr(e, "code", e))


async def generate(system: str, prompt: str, files: Optional[List[Tuple[bytes, str]]] = None,
                   json_output: bool = False, model: Optional[str] = None) -> str:
    """One-shot generation, optionally with files (PDF / images) as (bytes, mime)."""
    types = _types()
    parts = [types.Part.from_bytes(data=d, mime_type=m) for d, m in (files or [])]
    parts.append(types.Part.from_text(text=prompt))
    cfg = types.GenerateContentConfig(system_instruction=system,
                                      response_mime_type="application/json" if json_output else None)
    attempts = [(m, d) for m in _models(model or GEMINI_DOC_MODEL) for d in (0,) + RETRY_DELAYS]
    for i, (m, delay) in enumerate(attempts):
        if delay:
            await asyncio.sleep(delay)
        try:
            resp = await client().aio.models.generate_content(
                model=m, contents=[types.Content(role="user", parts=parts)], config=cfg)
            return resp.text or ""
        except Exception as e:
            if not _retryable(e) or i == len(attempts) - 1:
                raise
            logger.warning("Gemini %s busy (%s), retrying", m, getattr(e, "code", e))
    return ""


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
TTS_PARALLEL = 3  # chunks synthesised at the same time (long replies would otherwise take minutes)
_tts_cooldown: dict = {}  # model -> monotonic time until which it is skipped (quota exhausted / unavailable)


def tts_models() -> List[str]:
    out = []
    for m in [GEMINI_TTS_MODEL, *GEMINI_TTS_FALLBACK_MODELS]:
        if m and m not in out:
            out.append(m)
    return out


def _skip_model_error(e: Exception) -> Optional[float]:
    """Seconds to skip a model after this error, or None when the error is not model-specific."""
    code = getattr(e, "code", None) or getattr(e, "status_code", None)
    text = str(e)
    if code == 429 or "RESOURCE_EXHAUSTED" in text:
        return 15 * 60
    if code in (404, 400) and ("not found" in text.lower() or "not supported" in text.lower()):
        return 6 * 3600
    if code in (500, 502, 503, 504) or "UNAVAILABLE" in text:
        return 60
    return None


def _mp3_encoder():
    try:
        import lameenc  # small wheel, no ffmpeg needed
        return lameenc
    except Exception:  # pragma: no cover - optional dependency
        return None


def tts_signature() -> str:
    if TTS_PROVIDER == "openai" and OPENAI_API_KEY:
        return f"openai|{OPENAI_TTS_MODEL}|{OPENAI_TTS_VOICE}|mp3"
    fmt = "mp3" if _mp3_encoder() else "wav"
    return f"gemini|{GEMINI_TTS_MODEL}|{GEMINI_TTS_VOICE}|{fmt}"


def pcm_to_mp3(pcm: bytes, rate: int = TTS_SAMPLE_RATE, kbps: int = 48) -> bytes:
    lameenc = _mp3_encoder()
    enc = lameenc.Encoder()
    enc.set_bit_rate(kbps)
    enc.set_in_sample_rate(rate)
    enc.set_channels(1)
    enc.set_quality(2)
    return bytes(enc.encode(pcm) + enc.flush())


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
    sem = asyncio.Semaphore(TTS_PARALLEL)
    gap = b"\x00\x00" * int(TTS_SAMPLE_RATE * 0.25)  # short pause between chunks

    async def one(part: str) -> bytes:
        async with sem:
            last: Exception = RuntimeError("no TTS model available")
            for model in tts_models():
                if _tts_cooldown.get(model, 0) > time.monotonic():
                    continue
                for attempt in range(2):  # preview TTS models occasionally return an empty candidate
                    try:
                        resp = await client().aio.models.generate_content(
                            model=model, contents=f"{style}\n\n{part}", config=cfg)
                        cand = (resp.candidates or [None])[0]
                        parts = (cand.content.parts if cand and cand.content else None) or []
                        data = b"".join(p.inline_data.data for p in parts
                                        if getattr(p, "inline_data", None) and p.inline_data.data)
                        if data:
                            return data
                        last = RuntimeError("TTS returned no audio")
                    except AINotConfigured:
                        raise
                    except Exception as e:
                        last = e
                        skip = _skip_model_error(e)
                        if skip:
                            _tts_cooldown[model] = time.monotonic() + skip
                            logger.warning("TTS model %s skipped for %ss: %s", model, int(skip), str(e)[:160])
                            break  # next model
            raise last

    parts = await asyncio.gather(*(one(p) for p in chunks if p.strip()))
    pcm = gap.join(x for x in parts if x)
    if not pcm:
        raise RuntimeError("TTS returned no audio")
    if _mp3_encoder():
        return pcm_to_mp3(pcm), "audio/mpeg", "mp3"
    return pcm_to_wav(pcm), "audio/wav", "wav"
