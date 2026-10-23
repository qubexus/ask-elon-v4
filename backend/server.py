from fastapi import FastAPI, APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse, HTMLResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
from typing import Optional, List
from pathlib import Path
from datetime import datetime, timezone, timedelta
from urllib.parse import quote
import os
import json
import uuid
import logging
import httpx

from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone
from emergentintegrations.llm.openai import OpenAISpeechToText, OpenAITextToSpeech
from fastapi import UploadFile, File, Form, Response
import hashlib
import io
import re
import emoji
import asyncio
import requests
from starlette.concurrency import run_in_threadpool
import secrets
import jwt
from pwdlib import PasswordHash
from pydantic import EmailStr

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

client = AsyncIOMotorClient(os.environ['MONGO_URL'])
db = client[os.environ['DB_NAME']]
EMERGENT_LLM_KEY = os.environ['EMERGENT_LLM_KEY']
PAYPAL_CLIENT_ID = os.environ.get('PAYPAL_CLIENT_ID', '')
PAYPAL_SECRET = os.environ.get('PAYPAL_SECRET', '')
PAYPAL_API_BASE = os.environ['PAYPAL_API_BASE']
JWT_SECRET = os.environ['JWT_SECRET']
DEMO_EMAIL = "demo@unionelon.app"
DEMO_PASSWORD = "UnionDemo2026!"
USER_PROJ = {"_id": 0, "password_hash": 0}
passwords = PasswordHash.recommended()

ELON_PROMPT = (ROOT_DIR / 'elon_prompt.txt').read_text()
TEMPLATES = json.loads((ROOT_DIR / 'legal_templates.json').read_text())
LANG_NAMES = {"pl": "Polish", "en": "English", "ro": "Romanian"}

app = FastAPI()
api = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


def now():
    return datetime.now(timezone.utc)


def new_id(prefix):
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


# ---------------- Auth ----------------
class SessionIn(BaseModel):
    session_id: str


async def current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    return await user_from_token(auth[7:])


async def user_from_token(token: str) -> dict:
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess:
        raise HTTPException(401, "Invalid session")
    if sess.get("auth_method") == "password":
        try:
            jwt.decode(token, JWT_SECRET, algorithms=["HS256"], issuer="union-elon", audience="union-elon-app",
                       options={"require": ["sub", "sid", "exp", "iat"]})
        except jwt.PyJWTError:
            raise HTTPException(401, "Invalid token")
    exp = sess["expires_at"]
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < now():
        raise HTTPException(401, "Session expired")
    user = await db.users.find_one({"user_id": sess["user_id"]}, USER_PROJ)
    if not user:
        raise HTTPException(401, "User not found")
    return user


async def create_user(email: str, name: str, picture: Optional[str], password_hash: Optional[str] = None,
                      onboarded: bool = False) -> str:
    user_id = new_id("user")
    doc = {"user_id": user_id, "email": email, "name": name, "picture": picture, "employer": "", "job_title": "",
           "locale": "pl", "is_member": email in ADMIN_EMAILS, "role": "admin" if email in ADMIN_EMAILS else "user",
           "onboarded": onboarded, "created_at": now()}
    if password_hash:
        doc["password_hash"] = password_hash
    await db.users.insert_one(doc)
    for i, (t, d, s, st) in enumerate(SEED_CASES):
        await db.cases.insert_one({
            "case_id": new_id("case"), "user_id": user_id, "title": t, "description": d,
            "sector": s, "status": st, "created_at": now() - timedelta(days=10 - i * 3),
            "updated_at": now() - timedelta(days=3 - i),
        })
    return user_id


SEED_CASES = [
    ("Hours cut without notice", "Supervisor uciął z grafiku 24h w tygodniu bez uprzedzenia po tym, jak odmówiłem pracy w niedzielę. Agencja twierdzi, że na zero-hours mogą to zrobić w każdej chwili.", "Logistics & Warehouses", "open"),
    ("Unpaid overtime × 6 weeks", "Brak wypłaty 42 godzin nadgodzin i dodatku za nocki za lipiec i sierpień. Łączna zaległość pracodawcy to £565.56.", "Transport & Haulage Hub", "open"),
    ("SSP denied after severe flu", "Manager odmówił wypłaty Statutory Sick Pay za 2 tygodnie zwolnienia lekarskiego, twierdząc, że pracownicy agencyjni nie mają prawa do chorobowego.", "Food Production", "resolved"),
]


@api.post("/auth/session")
async def auth_session(body: SessionIn):
    async with httpx.AsyncClient(timeout=20) as hc:
        r = await hc.get("https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                         headers={"X-Session-ID": body.session_id})
    if r.status_code != 200:
        raise HTTPException(401, "Invalid session_id")
    data = r.json()
    email = data["email"]
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one({"user_id": user_id}, {"$set": {"picture": data.get("picture")}})
    else:
        user_id = await create_user(email, data.get("name", ""), data.get("picture"))
    await db.user_sessions.insert_one({
        "session_token": data["session_token"], "user_id": user_id, "auth_method": "google",
        "expires_at": now() + timedelta(days=7), "created_at": now(),
    })
    user = await db.users.find_one({"user_id": user_id}, USER_PROJ)
    return {"session_token": data["session_token"], "user": user}


@api.get("/auth/me")
async def auth_me(request: Request):
    return await current_user(request)


@api.post("/auth/logout")
async def auth_logout(request: Request):
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        await db.user_sessions.delete_one({"session_token": auth[7:]})
    return {"ok": True}


# ---------------- Email + password auth ----------------
class RegisterIn(BaseModel):
    name: str = ""
    email: EmailStr
    password: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class ResetRequestIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    email: EmailStr
    code: str
    new_password: str


def norm_email(e: str) -> str:
    return e.strip().lower()


def digest(v: str) -> str:
    return hashlib.sha256(v.encode()).hexdigest()


async def issue_password_session(user_id: str) -> str:
    sid = uuid.uuid4().hex
    exp = now() + timedelta(days=7)
    token = jwt.encode({"sub": user_id, "sid": sid, "iss": "union-elon", "aud": "union-elon-app",
                        "iat": now(), "exp": exp, "typ": "access"}, JWT_SECRET, algorithm="HS256")
    await db.user_sessions.insert_one({"session_token": token, "sid": sid, "user_id": user_id,
                                       "auth_method": "password", "expires_at": exp, "created_at": now()})
    return token


def check_password(pw: str):
    if len(pw) < 8:
        raise HTTPException(422, "Password must be at least 8 characters")


@api.post("/auth/register")
async def register(body: RegisterIn):
    email = norm_email(body.email)
    check_password(body.password)
    if await db.users.find_one({"email": email}, {"_id": 1}):
        raise HTTPException(409, "Email already registered")
    user_id = await create_user(email, body.name.strip(), None, password_hash=passwords.hash(body.password))
    token = await issue_password_session(user_id)
    return {"session_token": token, "user": await db.users.find_one({"user_id": user_id}, USER_PROJ)}


@api.post("/auth/login")
async def login(body: LoginIn):
    email = norm_email(body.email)
    since = now() - timedelta(minutes=15)
    if await db.login_attempts.count_documents({"email": email, "at": {"$gte": since}}) >= 10:
        raise HTTPException(429, "Too many attempts. Try again in 15 minutes.")
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not user.get("password_hash") or not passwords.verify(body.password, user["password_hash"]):
        await db.login_attempts.insert_one({"email": email, "at": now()})
        raise HTTPException(401, "Invalid email or password")
    await db.login_attempts.delete_many({"email": email})
    token = await issue_password_session(user["user_id"])
    return {"session_token": token, "user": await db.users.find_one({"user_id": user["user_id"]}, USER_PROJ)}


@api.post("/auth/request-reset")
async def request_reset(body: ResetRequestIn):
    email = norm_email(body.email)
    user = await db.users.find_one({"email": email}, {"_id": 0, "user_id": 1})
    if user:
        code = f"{secrets.randbelow(10**6):06d}"
        await db.password_resets.delete_many({"user_id": user["user_id"]})
        await db.password_resets.insert_one({"user_id": user["user_id"], "token_hash": digest(f"{email}:{code}"),
                                             "expires_at": now() + timedelta(minutes=30), "attempts": 0, "created_at": now()})
        # No email provider configured yet: the code is written to the server log.
        logger.info("PASSWORD RESET CODE for %s: %s", email, code)
    return {"message": "If the account exists, a reset code has been sent."}


@api.post("/auth/reset-password")
async def reset_password(body: ResetIn):
    email = norm_email(body.email)
    check_password(body.new_password)
    user = await db.users.find_one({"email": email}, {"_id": 0, "user_id": 1})
    row = user and await db.password_resets.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not row:
        raise HTTPException(400, "Invalid or expired code")
    exp = row["expires_at"] if row["expires_at"].tzinfo else row["expires_at"].replace(tzinfo=timezone.utc)
    if exp <= now() or row["attempts"] >= 5 or row["token_hash"] != digest(f"{email}:{body.code.strip()}"):
        await db.password_resets.update_one({"user_id": user["user_id"]}, {"$inc": {"attempts": 1}})
        raise HTTPException(400, "Invalid or expired code")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"password_hash": passwords.hash(body.new_password)}})
    await db.password_resets.delete_many({"user_id": user["user_id"]})
    await db.user_sessions.delete_many({"user_id": user["user_id"]})
    token = await issue_password_session(user["user_id"])
    return {"session_token": token, "user": await db.users.find_one({"user_id": user["user_id"]}, USER_PROJ)}


@api.post("/auth/demo")
async def demo_login():
    user = await db.users.find_one({"email": DEMO_EMAIL}, {"_id": 0, "user_id": 1})
    token = await issue_password_session(user["user_id"])
    return {"session_token": token, "user": await db.users.find_one({"user_id": user["user_id"]}, USER_PROJ)}



# ---------------- Profile ----------------
class ProfileIn(BaseModel):
    name: Optional[str] = None
    employer: Optional[str] = None
    job_title: Optional[str] = None
    locale: Optional[str] = None
    onboarded: Optional[bool] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    industry: Optional[str] = None
    contract_type: Optional[str] = None
    start_date: Optional[str] = None
    workplace_address: Optional[str] = None
    hr_email: Optional[str] = None


PROFILE_REQUIRED = ["name", "address", "phone", "employer", "industry", "job_title",
                    "contract_type", "start_date", "workplace_address"]


def is_profile_complete(u: dict) -> bool:
    return all(str(u.get(k) or "").strip() for k in PROFILE_REQUIRED)


@api.put("/profile")
async def update_profile(body: ProfileIn, request: Request):
    user = await current_user(request)
    upd = {k: (v.strip() if isinstance(v, str) else v) for k, v in body.model_dump().items() if v is not None}
    if "locale" in upd and upd["locale"] not in LANG_NAMES:
        raise HTTPException(400, "Invalid locale")
    if upd.get("hr_email") and "@" not in upd["hr_email"]:
        raise HTTPException(400, "Invalid HR email")
    merged = {**user, **upd}
    upd["profile_complete"] = is_profile_complete(merged)
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": upd})
    return await db.users.find_one({"user_id": user["user_id"]}, USER_PROJ)


# ---------------- Cases ----------------
class CaseIn(BaseModel):
    title: str
    description: str
    sector: str = ""


class CasePatch(BaseModel):
    status: str


@api.get("/cases")
async def list_cases(request: Request):
    user = await current_user(request)
    return await db.cases.find({"user_id": user["user_id"]}, {"_id": 0}).sort("updated_at", -1).to_list(200)


@api.post("/cases")
async def create_case(body: CaseIn, request: Request):
    user = await current_user(request)
    if not body.title.strip():
        raise HTTPException(400, "Title required")
    doc = {"case_id": new_id("case"), "user_id": user["user_id"], "title": body.title.strip(),
           "description": body.description.strip(), "sector": body.sector.strip(), "status": "open",
           "created_at": now(), "updated_at": now()}
    await db.cases.insert_one(doc)
    doc.pop("_id", None)
    return doc


class FromThreadIn(BaseModel):
    thread_id: str


@api.post("/cases/from-thread")
async def case_from_thread(body: FromThreadIn, request: Request):
    """Turns a main-chat session into a case: creates the case and moves the conversation into its thread."""
    user = await current_user(request)
    uid = user["user_id"]
    first = await db.messages.find_one({"user_id": uid, "thread_id": body.thread_id, "role": "user"}, {"_id": 0}, sort=[("created_at", 1)])
    if not first:
        raise HTTPException(400, "Conversation is empty")
    text = first["text"].strip()
    title = text if len(text) <= 60 else text[:57].rsplit(" ", 1)[0] + "…"
    doc = {"case_id": new_id("case"), "user_id": uid, "title": title, "description": text[:1000],
           "sector": user.get("industry") or "", "status": "open", "created_at": now(), "updated_at": now()}
    await db.cases.insert_one(dict(doc))
    await db.messages.update_many({"user_id": uid, "thread_id": body.thread_id}, {"$set": {"thread_id": doc["case_id"]}})
    doc.pop("_id", None)
    return doc


@api.get("/cases/{case_id}")
async def get_case(case_id: str, request: Request):
    user = await current_user(request)
    c = await db.cases.find_one({"case_id": case_id, "user_id": user["user_id"]}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Case not found")
    return c


@api.patch("/cases/{case_id}")
async def patch_case(case_id: str, body: CasePatch, request: Request):
    user = await current_user(request)
    if body.status not in ("open", "resolved"):
        raise HTTPException(400, "Invalid status")
    res = await db.cases.update_one({"case_id": case_id, "user_id": user["user_id"]},
                                    {"$set": {"status": body.status, "updated_at": now()}})
    if not res.matched_count:
        raise HTTPException(404, "Case not found")
    return await db.cases.find_one({"case_id": case_id}, {"_id": 0})


# ---------------- Chat (Gemini 3 Flash, streaming) ----------------
class ChatIn(BaseModel):
    text: str
    thread_id: str = "main"


@api.get("/chat/messages")
async def chat_messages(request: Request, thread_id: str = "main"):
    user = await current_user(request)
    return await db.messages.find({"user_id": user["user_id"], "thread_id": thread_id}, {"_id": 0}) \
        .sort("created_at", 1).to_list(500)


@api.delete("/chat/messages")
async def clear_chat(request: Request, thread_id: str = "main"):
    user = await current_user(request)
    await db.messages.delete_many({"user_id": user["user_id"], "thread_id": thread_id})
    return {"ok": True}


FREE_DAILY_MESSAGES = 3
FREE_TRIAL_DAYS = 7


@api.get("/chat/usage")
async def chat_usage(request: Request):
    """Free-tier usage info; the client enforces the limits (PRO status lives in RevenueCat)."""
    user = await current_user(request)
    start = now().replace(hour=0, minute=0, second=0, microsecond=0)
    today = await db.messages.count_documents({"user_id": user["user_id"], "role": "user", "created_at": {"$gte": start}})
    created = user.get("created_at") or now()
    if isinstance(created, str):
        created = datetime.fromisoformat(created)
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    return {"today": today, "days_since_signup": (now() - created).days,
            "free_daily": FREE_DAILY_MESSAGES, "trial_days": FREE_TRIAL_DAYS}


@api.post("/chat/stream")
async def chat_stream(body: ChatIn, request: Request):
    user = await current_user(request)
    text = body.text.strip()
    if not text:
        raise HTTPException(400, "Empty message")
    uid, tid = user["user_id"], body.thread_id
    if not user.get("profile_complete"):
        raise HTTPException(403, "Complete your profile to unlock Elon")

    p = lambda k: user.get(k) or "-"  # noqa: E731
    context = (f"\n\nKONTEKST UŻYTKOWNIKA (z profilu – nie pytaj o te dane ponownie):\n"
               f"- Imię i nazwisko: {p('name')}; adres: {p('address')}; e-mail: {p('email')}; tel: {p('phone')}\n"
               f"- Pracodawca/agencja: {p('employer')}; branża: {p('industry')}; stanowisko: {p('job_title')}\n"
               f"- Typ umowy: {p('contract_type')}; zatrudniony od: {p('start_date')}; adres zakładu: {p('workplace_address')}; "
               f"e-mail HR: {p('hr_email')}\n- Język aplikacji: {LANG_NAMES.get(user.get('locale', 'pl'))}.")
    context += await documents_context(uid, text)
    if tid != "main":
        c = await db.cases.find_one({"case_id": tid, "user_id": uid}, {"_id": 0})
        if c:
            context += f"\nROZMOWA DOTYCZY SPRAWY: \"{c['title']}\" ({c['sector']}). Opis: {c['description']}"
    system = ELON_PROMPT + context
    history = await db.messages.find({"user_id": uid, "thread_id": tid}, {"_id": 0}).sort("created_at", -1).to_list(30)
    initial = [{"role": "system", "content": system}] + [
        {"role": m["role"], "content": m["text"]} for m in reversed(history)]

    await db.messages.insert_one({"message_id": new_id("msg"), "user_id": uid, "thread_id": tid,
                                  "role": "user", "text": text, "created_at": now()})

    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"{uid}_{tid}", system_message=system,
                   initial_messages=initial).with_model("gemini", "gemini-3-flash-preview")

    async def gen():
        full = ""
        try:
            async for ev in chat.stream_message(UserMessage(text=text)):
                if isinstance(ev, TextDelta):
                    full += ev.content
                    yield f"data: {json.dumps({'delta': ev.content})}\n\n"
                elif isinstance(ev, StreamDone):
                    break
        except Exception as e:
            logger.exception("LLM error")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        if full:
            msg = {"message_id": new_id("msg"), "user_id": uid, "thread_id": tid,
                   "role": "assistant", "text": full, "created_at": now()}
            await db.messages.insert_one(msg)
            yield f"data: {json.dumps({'done': True, 'message_id': msg['message_id']})}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ---------------- Voice: speech-to-text & text-to-speech ----------------
STT_MODEL = "gpt-4o-mini-transcribe"
TTS_MODEL = "gpt-4o-mini-tts"
TTS_VOICE = "onyx"
TTS_INSTRUCTIONS = ("You are Elon from Ask Elon, an experienced, calm and confident UK work-rights AI assistant. "
                    "Speak clearly at a steady, reassuring pace, warm but professional, like a trusted colleague.")
STT_PROMPT = "UK employment law: payslip, grievance, ACAS, SSP, holiday pay, zero-hours, HR, Employment Tribunal, agencja, nadgodziny."


@api.post("/transcribe")
async def transcribe(request: Request, audio: UploadFile = File(...), language: str = Form("pl")):
    await current_user(request)
    data = await audio.read()
    if len(data) < 2000:
        return {"text": "", "reason": "too_short"}
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(413, "Audio too large")
    buf = io.BytesIO(data)
    buf.name = audio.filename or "recording.m4a"
    try:
        stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
        resp = await stt.transcribe(file=buf, model=STT_MODEL, response_format="json",
                                    language=language if language in LANG_NAMES else None,
                                    prompt=STT_PROMPT, temperature=0.0)
    except Exception as e:
        logger.exception("STT failed")
        raise HTTPException(502, f"Transcription failed: {e}")
    return {"text": (resp.text or "").strip(), "reason": None}


def clean_for_tts(text: str) -> str:
    text = emoji.replace_emoji(text, replace="")
    text = re.sub(r"https?://\S+", "", text)
    text = re.sub(r"`{1,3}[^`]*`{1,3}", "", text)
    text = re.sub(r"[*_#>~|]", "", text)
    return re.sub(r"\s+", " ", text).strip()


def chunk_text(text: str, limit: int = 4000) -> List[str]:
    chunks, cur = [], ""
    for sentence in re.split(r"(?<=[.!?])\s+", text):
        if len(cur) + len(sentence) + 1 > limit and cur:
            chunks.append(cur)
            cur = ""
        cur = (cur + " " + sentence).strip()
    if cur:
        chunks.append(cur[:limit])
    return chunks


class TtsIn(BaseModel):
    message_id: str


@api.post("/tts")
async def tts(body: TtsIn, request: Request):
    user = await current_user(request)
    msg = await db.messages.find_one({"message_id": body.message_id, "user_id": user["user_id"]}, {"_id": 0})
    if not msg:
        raise HTTPException(404, "Message not found")
    text = clean_for_tts(msg["text"])
    if not text:
        raise HTTPException(400, "Nothing to read")
    key = hashlib.sha256(f"{text}|{TTS_VOICE}|1.0|{TTS_MODEL}|mp3|{TTS_INSTRUCTIONS}".encode()).hexdigest()
    if not await db.tts_cache.find_one({"key": key}, {"_id": 1}):
        engine = OpenAITextToSpeech(api_key=EMERGENT_LLM_KEY)
        audio = b""
        try:
            for part in chunk_text(text):
                audio += await engine.generate_speech(text=part, model=TTS_MODEL, voice=TTS_VOICE,
                                                      instructions=TTS_INSTRUCTIONS, response_format="mp3")
        except Exception as e:
            logger.exception("TTS failed")
            raise HTTPException(502, f"Speech generation failed: {e}")
        await db.tts_cache.update_one({"key": key}, {"$set": {"key": key, "audio": audio, "created_at": now()}}, upsert=True)
    return {"url": f"/api/tts/audio/{key}.mp3"}


@api.get("/tts/audio/{key}.mp3")
async def tts_audio(key: str):
    doc = await db.tts_cache.find_one({"key": key}, {"_id": 0, "audio": 1})
    if not doc:
        raise HTTPException(404, "Not found")
    return Response(content=bytes(doc["audio"]), media_type="audio/mpeg",
                    headers={"Cache-Control": "public, max-age=31536000"})


# ---------------- Documents (object storage + Gemini extraction) ----------------
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
STORAGE_APP = "union-elon"
storage_key = None
DOC_MIME = {"application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg"}
DOC_MAX = 20 * 1024 * 1024
DOC_CATEGORIES = ["contract", "annex", "policy", "correspondence", "payslip", "other"]


def init_storage():
    global storage_key
    if storage_key:
        return storage_key
    r = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_LLM_KEY}, timeout=30)
    r.raise_for_status()
    storage_key = r.json()["storage_key"]
    return storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    global storage_key
    for attempt in range(2):
        r = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": init_storage(), "Content-Type": content_type},
                         data=data, timeout=120)
        if r.status_code == 503 and attempt == 0:
            storage_key = None
            continue
        r.raise_for_status()
        return r.json()


def get_object(path: str):
    r = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": init_storage()}, timeout=60)
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "application/octet-stream")


def make_thumbnail(data: bytes, mime: str) -> Optional[bytes]:
    try:
        import pymupdf
        if mime == "application/pdf":
            doc = pymupdf.open(stream=data, filetype="pdf")
            page = doc[0]
            pix = page.get_pixmap(matrix=pymupdf.Matrix(360 / page.rect.width, 360 / page.rect.width))
            return pix.tobytes("png")
        img = pymupdf.Pixmap(data)
        if img.width > 360:
            img = pymupdf.Pixmap(img, 360, int(img.height * 360 / img.width))
        return img.tobytes("png")
    except Exception:
        logger.exception("thumbnail failed")
        return None


DOC_EXTRACT_PROMPT = """You analyse UK workplace documents for Ask Elon, a UK work-rights AI assistant.
Return ONLY valid JSON (no markdown) with keys:
"category": one of contract, annex, policy, correspondence, payslip, other;
"title": short document title;
"summary": 1-2 sentence factual summary in {lang} (e.g. contract type, date signed, hours, notice period, pay, key amounts);
"tags": array of up to 5 short tags in {lang};
"key_facts": array of up to 8 short facts with clause/section numbers where visible;
"text": the full extracted text of the document (OCR), max 15000 characters."""


async def process_document(doc_id: str):
    doc = await db.documents.find_one({"doc_id": doc_id}, {"_id": 0})
    user = await db.users.find_one({"user_id": doc["user_id"]}, {"_id": 0, "locale": 1})
    lang = LANG_NAMES.get((user or {}).get("locale", "pl"), "Polish")
    import tempfile
    try:
        data, _ = await run_in_threadpool(get_object, doc["storage_path"])
        with tempfile.NamedTemporaryFile(suffix="." + DOC_MIME[doc["mime"]], delete=False) as f:
            f.write(data)
            tmp = f.name
        chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"doc_{doc_id}",
                       system_message=DOC_EXTRACT_PROMPT.format(lang=lang)).with_model("gemini", "gemini-3-flash-preview")
        from emergentintegrations.llm.chat import FileContentWithMimeType
        raw = await chat.send_message(UserMessage(text=f"Analyse this document: {doc['filename']}",
                                                  file_contents=[FileContentWithMimeType(doc["mime"], tmp)]))
        os.unlink(tmp)
        m = re.search(r"\{.*\}", raw, re.S)
        res = json.loads(m.group(0)) if m else {}
        cat = res.get("category") if res.get("category") in DOC_CATEGORIES else (doc.get("category") or "other")
        await db.documents.update_one({"doc_id": doc_id}, {"$set": {
            "status": "ready", "category": doc.get("category_user") or cat, "title": res.get("title") or doc["filename"],
            "summary": res.get("summary", ""), "tags": res.get("tags", [])[:5], "key_facts": res.get("key_facts", [])[:8],
            "extracted_text": (res.get("text") or "")[:15000], "processed_at": now()}})
        if (doc.get("category_user") or cat) == "payslip":
            await audit_payslip(doc_id)
    except Exception as e:
        logger.exception("document processing failed")
        await db.documents.update_one({"doc_id": doc_id}, {"$set": {"status": "failed", "error": str(e)[:300]}})


PAYSLIP_AUDIT_PROMPT = """You are Elon from Ask Elon, a UK payroll auditor. Compare the worker's PAYSLIP with their CONTRACT
and UK law (National Minimum/Living Wage 2024-26 rates, Working Time Regulations 1998 holiday pay 12.07% accrual for irregular hours,
overtime/night premiums in the contract, SSP, unlawful deductions s.13 ERA 1996).
Return ONLY valid JSON (no markdown) with keys:
"verdict": "ok" or "issues";
"summary": 1-2 sentences in {lang};
"pay_period": string or "";
"pay_month": "YYYY-MM" of the pay period end / pay date, or "";
"hours_paid": number or null; "hours_expected": number or null; "unpaid_hours": number (0 if none);
"hourly_rate_paid": number or null; "hourly_rate_contract": number or null;
"estimated_owed_gbp": number (0 if none);
"issues": array of up to 6 objects {{"title": short in {lang}, "detail": 1 sentence in {lang} citing contract clause or law, "amount_gbp": number or null, "severity": "high"|"medium"|"low"}}.
If no contract is provided, audit against UK statutory minimums and say so in summary. Never invent figures not supported by the documents."""


async def audit_payslip(doc_id: str):
    doc = await db.documents.find_one({"doc_id": doc_id}, {"_id": 0})
    uid = doc["user_id"]
    await db.documents.update_one({"doc_id": doc_id}, {"$set": {"audit_status": "running"}})
    user = await db.users.find_one({"user_id": uid}, {"_id": 0, "locale": 1, "contract_type": 1, "job_title": 1, "employer": 1})
    lang = LANG_NAMES.get(user.get("locale", "pl"), "Polish")
    contract = await db.documents.find_one({"user_id": uid, "category": "contract", "status": "ready", "deleted": {"$ne": True}},
                                           {"_id": 0, "extracted_text": 1, "key_facts": 1}, sort=[("created_at", -1)])
    prompt = (f"PROFILE: employer {user.get('employer')}, role {user.get('job_title')}, contract type {user.get('contract_type')}\n\n"
              f"CONTRACT:\n{(contract or {}).get('extracted_text') or 'NOT PROVIDED'}\n\n"
              f"PAYSLIP ({doc.get('title')}):\nKey facts: {'; '.join(doc.get('key_facts') or [])}\n{doc.get('extracted_text', '')}")
    try:
        chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"audit_{doc_id}",
                       system_message=PAYSLIP_AUDIT_PROMPT.format(lang=lang)).with_model("gemini", "gemini-3-flash-preview")
        raw = await chat.send_message(UserMessage(text=prompt))
        m = re.search(r"\{.*\}", raw, re.S)
        audit = json.loads(m.group(0))
        audit["issues"] = [i for i in audit.get("issues", []) if isinstance(i, dict)][:6]
        audit["compared_with_contract"] = bool(contract)
        audit["created_at"] = now().isoformat()
        await db.documents.update_one({"doc_id": doc_id}, {"$set": {"audit": audit, "audit_status": "done"}})
    except Exception:
        logger.exception("payslip audit failed")
        await db.documents.update_one({"doc_id": doc_id}, {"$set": {"audit_status": "failed"}})


async def documents_context(user_id: str, question: str) -> str:
    """Retrieval: profile docs are injected in full order of relevance (keyword overlap), within a char budget."""
    docs = await db.documents.find({"user_id": user_id, "deleted": {"$ne": True}, "status": "ready"},
                                   {"_id": 0, "title": 1, "category": 1, "summary": 1, "key_facts": 1, "extracted_text": 1, "audit": 1,
                                    "filename": 1, "created_at": 1}).to_list(50)
    if not docs:
        return "\n\nDOKUMENTY UŻYTKOWNIKA: brak wgranych dokumentów. Jeśli to istotne, zaproponuj wgranie umowy w zakładce Profil → Dokumenty."
    words = {w for w in re.findall(r"\w{4,}", question.lower())}
    docs.sort(key=lambda d: (d["category"] != "contract",
                             -len(words & set(re.findall(r"\w{4,}", (d.get("extracted_text") or "").lower())))))
    out, budget = ["\n\nDOKUMENTY UŻYTKOWNIKA (cytuj konkretne punkty, np. 'Zgodnie z punktem 4 Twojej umowy…'):"], 40000
    for d in docs:
        block = (f"\n### [{d['category']}] {d.get('title') or d['filename']}\nPodsumowanie: {d.get('summary', '')}\n"
                 f"Kluczowe fakty: {'; '.join(d.get('key_facts') or [])}\nTreść:\n{d.get('extracted_text', '')}")
        if d.get("audit"):
            a = d["audit"]
            block += (f"\nAUDYT PAYSLIPU: werdykt {a.get('verdict')}, nieopłacone godziny {a.get('unpaid_hours')}, "
                      f"szacowana zaległość £{a.get('estimated_owed_gbp')}; problemy: "
                      + "; ".join(f"{i.get('title')}: {i.get('detail')}" for i in a.get("issues", [])))
        if budget - len(block) < 0:
            block = block[:max(budget, 0)]
        out.append(block)
        budget -= len(block)
        if budget <= 0:
            break
    return "".join(out)


def doc_public(d: dict) -> dict:
    d = {k: v for k, v in d.items() if k not in ("extracted_text", "storage_path", "thumb_path", "_id")}
    return d


async def user_from_token_or_header(request: Request, token: str) -> dict:
    if token and not request.headers.get("Authorization"):
        return await user_from_token(token)
    return await current_user(request)


@api.post("/documents")
async def upload_document(request: Request, file: UploadFile = File(...), category: str = Form("")):
    user = await current_user(request)
    mime = (file.content_type or "").lower()
    if mime not in DOC_MIME:
        name = (file.filename or "").lower()
        mime = "application/pdf" if name.endswith(".pdf") else "image/png" if name.endswith(".png") else \
            "image/jpeg" if name.endswith((".jpg", ".jpeg")) else mime
    if mime not in DOC_MIME:
        raise HTTPException(415, "Only PDF, PNG or JPG files are allowed")
    data = await file.read()
    if len(data) > DOC_MAX:
        raise HTTPException(413, "File too large (max 20 MB)")
    if len(data) < 100:
        raise HTTPException(400, "File is empty")
    return await store_document(user, data, mime, file.filename or f"document.{DOC_MIME[mime]}", category)


async def store_document(user: dict, data: bytes, mime: str, filename: str, category: str) -> dict:
    doc_id = new_id("doc")
    base = f"{STORAGE_APP}/uploads/{user['user_id']}/{uuid.uuid4().hex}"
    try:
        stored = await run_in_threadpool(put_object, f"{base}.{DOC_MIME[mime]}", data, mime)
        thumb = await run_in_threadpool(make_thumbnail, data, mime)
        thumb_path = (await run_in_threadpool(put_object, f"{base}_thumb.png", thumb, "image/png"))["path"] if thumb else None
    except requests.HTTPError as e:
        if e.response is not None and e.response.status_code == 402:
            raise HTTPException(402, "Storage credits exhausted")
        raise HTTPException(502, "Storage upload failed")
    cat = category if category in DOC_CATEGORIES else ""
    doc = {"doc_id": doc_id, "user_id": user["user_id"], "filename": filename,
           "mime": mime, "size": len(data), "storage_path": stored["path"], "thumb_path": thumb_path,
           "has_thumb": bool(thumb_path), "status": "processing", "category": cat or "other", "category_user": cat,
           "title": filename, "summary": "", "tags": [], "key_facts": [], "deleted": False, "created_at": now()}
    await db.documents.insert_one(doc)
    asyncio.create_task(process_document(doc_id))
    return doc_public(doc)


SCAN_CHECK_PROMPT = """You check phone photos of paper workplace documents (contracts, payslips, letters) before OCR.
Return ONLY valid JSON: {{"readable": true|false, "reason": short tip in {lang} how to retake (empty if readable)}}.
readable=false if text is blurry, cut off, too dark, glare covers text, too far away, or it is not a document."""


@api.post("/documents/scan-check")
async def scan_check(request: Request, file: UploadFile = File(...)):
    user = await current_user(request)
    data = await file.read()
    if len(data) < 100 or len(data) > DOC_MAX:
        raise HTTPException(400, "Invalid image")
    import tempfile
    mime = (file.content_type or "image/jpeg").lower()
    mime = mime if mime in ("image/png", "image/jpeg") else "image/jpeg"
    with tempfile.NamedTemporaryFile(suffix="." + DOC_MIME[mime], delete=False) as f:
        f.write(data)
        tmp = f.name
    lang = LANG_NAMES.get(user.get("locale", "pl"), "Polish")
    try:
        from emergentintegrations.llm.chat import FileContentWithMimeType
        chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"scan_{uuid.uuid4().hex}",
                       system_message=SCAN_CHECK_PROMPT.format(lang=lang)).with_model("gemini", "gemini-3-flash-preview")
        raw = await chat.send_message(UserMessage(text="Check this photo.", file_contents=[FileContentWithMimeType(mime, tmp)]))
        m = re.search(r"\{.*\}", raw, re.S)
        res = json.loads(m.group(0)) if m else {"readable": True, "reason": ""}
        return {"readable": bool(res.get("readable", True)), "reason": str(res.get("reason") or "")[:200]}
    except Exception:
        logger.exception("scan check failed")
        return {"readable": True, "reason": ""}  # never block the user on a checker failure
    finally:
        os.unlink(tmp)


@api.post("/documents/scan")
async def upload_scan(request: Request, files: List[UploadFile] = File(...), category: str = Form("")):
    """Merges several photographed pages into one PDF document."""
    user = await current_user(request)
    if not 1 <= len(files) <= 15:
        raise HTTPException(400, "1-15 pages allowed")
    import pymupdf
    pages = [await f.read() for f in files]
    if sum(len(p) for p in pages) > DOC_MAX:
        raise HTTPException(413, "File too large (max 20 MB)")

    def merge() -> bytes:
        out = pymupdf.open()
        for img in pages:
            src = pymupdf.open(stream=img, filetype="jpg")
            out.insert_pdf(pymupdf.open("pdf", src.convert_to_pdf()))
        return out.tobytes()
    try:
        pdf = await run_in_threadpool(merge)
    except Exception:
        logger.exception("scan merge failed")
        raise HTTPException(400, "Could not read the photos")
    name = f"scan_{now().strftime('%Y-%m-%d_%H%M')}.pdf"
    return await store_document(user, pdf, "application/pdf", name, category)


@api.get("/documents")
async def list_documents(request: Request):
    user = await current_user(request)
    docs = await db.documents.find({"user_id": user["user_id"], "deleted": {"$ne": True}}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [doc_public(d) for d in docs]


@api.get("/documents/{doc_id}")
async def get_document(doc_id: str, request: Request):
    user = await current_user(request)
    d = await db.documents.find_one({"doc_id": doc_id, "user_id": user["user_id"], "deleted": {"$ne": True}}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Document not found")
    return {**doc_public(d), "extracted_text": d.get("extracted_text", "")}


@api.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, request: Request):
    user = await current_user(request)
    res = await db.documents.update_one({"doc_id": doc_id, "user_id": user["user_id"]}, {"$set": {"deleted": True}})
    if not res.matched_count:
        raise HTTPException(404, "Document not found")
    return {"ok": True}


@api.post("/documents/{doc_id}/reprocess")
async def reprocess_document(doc_id: str, request: Request):
    user = await current_user(request)
    res = await db.documents.update_one({"doc_id": doc_id, "user_id": user["user_id"], "deleted": {"$ne": True}},
                                        {"$set": {"status": "processing"}})
    if not res.matched_count:
        raise HTTPException(404, "Document not found")
    asyncio.create_task(process_document(doc_id))
    return {"ok": True}


@api.post("/documents/{doc_id}/audit")
async def run_audit(doc_id: str, request: Request):
    user = await current_user(request)
    d = await db.documents.find_one({"doc_id": doc_id, "user_id": user["user_id"], "deleted": {"$ne": True}}, {"_id": 0})
    if not d or d.get("category") != "payslip" or d.get("status") != "ready":
        raise HTTPException(400, "Only analysed payslips can be audited")
    await db.documents.update_one({"doc_id": doc_id}, {"$set": {"audit_status": "running"}})
    asyncio.create_task(audit_payslip(doc_id))
    return {"ok": True}


@api.get("/documents/{doc_id}/{kind}")
async def document_file(doc_id: str, kind: str, request: Request, token: str = ""):
    user = await user_from_token_or_header(request, token)
    d = await db.documents.find_one({"doc_id": doc_id, "user_id": user["user_id"], "deleted": {"$ne": True}}, {"_id": 0})
    if not d or kind not in ("file", "thumb") or (kind == "thumb" and not d.get("thumb_path")):
        raise HTTPException(404, "Not found")
    data, ctype = await run_in_threadpool(get_object, d["storage_path"] if kind == "file" else d["thumb_path"])
    headers = {"Cache-Control": "private, max-age=86400"}
    if kind == "file":
        headers["Content-Disposition"] = f'inline; filename="{quote(d["filename"])}"'
    return Response(content=data, media_type=d["mime"] if kind == "file" else "image/png", headers=headers)


# ---------------- Forum ----------------
FORUM_CATS = ["wages", "contracts", "agency", "housing", "health", "general"]
FORUM_SEED = [
    ("wages", "Agencja nie zapłaciła za nadgodziny – co zrobiłem", "Po 3 tygodniach wysłałem formalny grievance z wzoru w aplikacji i w 10 dni dostałem £420 zaległości. Najważniejsze: zachowajcie zdjęcia grafików i payslipy!", "Marek (Tilbury)"),
    ("contracts", "Zero-hours: czy mogą mi uciąć wszystkie zmiany?", "Od miesiąca dostaję 8h tygodniowo zamiast 40. Ktoś miał podobną sytuację w magazynie?", "Ana (Dartford)"),
    ("health", "SSP odmówione pracownikowi agencyjnemu", "Pamiętajcie: pracownik agencyjny też ma prawo do SSP jeśli zarabia powyżej Lower Earnings Limit. Mnie pomogło pismo SSP demand.", "Piotr (Leeds)"),
]


class PostIn(BaseModel):
    title: str
    body: str
    category: str = "general"


class CommentIn(BaseModel):
    body: str


def author_name(u: dict) -> str:
    return (u.get("name") or u["email"].split("@")[0]).split("(")[0].strip()


@api.get("/forum/posts")
async def forum_posts(request: Request, category: str = ""):
    user = await current_user(request)
    q = {"category": category} if category in FORUM_CATS else {}
    posts = await db.forum_posts.find(q, {"_id": 0}).sort("created_at", -1).to_list(100)
    for p in posts:
        p["liked"] = user["user_id"] in p.get("likes", [])
        p["like_count"] = len(p.pop("likes", []))
    return posts


@api.post("/forum/posts")
async def forum_create(body: PostIn, request: Request):
    user = await current_user(request)
    if len(body.title.strip()) < 3 or len(body.body.strip()) < 3:
        raise HTTPException(400, "Title and content are required")
    doc = {"post_id": new_id("post"), "user_id": user["user_id"], "author": author_name(user),
           "category": body.category if body.category in FORUM_CATS else "general", "title": body.title.strip()[:150],
           "body": body.body.strip()[:4000], "likes": [], "comment_count": 0, "created_at": now()}
    await db.forum_posts.insert_one(doc)
    doc.pop("_id", None)
    doc["liked"], doc["like_count"] = False, len(doc.pop("likes"))
    return doc


@api.get("/forum/posts/{post_id}")
async def forum_get(post_id: str, request: Request):
    user = await current_user(request)
    p = await db.forum_posts.find_one({"post_id": post_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Post not found")
    p["liked"] = user["user_id"] in p.get("likes", [])
    p["like_count"] = len(p.pop("likes", []))
    p["comments"] = await db.forum_comments.find({"post_id": post_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return p


@api.post("/forum/posts/{post_id}/comments")
async def forum_comment(post_id: str, body: CommentIn, request: Request):
    user = await current_user(request)
    if not body.body.strip():
        raise HTTPException(400, "Empty comment")
    if not await db.forum_posts.find_one({"post_id": post_id}, {"_id": 1}):
        raise HTTPException(404, "Post not found")
    c = {"comment_id": new_id("cmt"), "post_id": post_id, "user_id": user["user_id"], "author": author_name(user),
         "body": body.body.strip()[:2000], "created_at": now()}
    await db.forum_comments.insert_one(c)
    await db.forum_posts.update_one({"post_id": post_id}, {"$inc": {"comment_count": 1}})
    c.pop("_id", None)
    return c


@api.post("/forum/posts/{post_id}/like")
async def forum_like(post_id: str, request: Request):
    user = await current_user(request)
    p = await db.forum_posts.find_one({"post_id": post_id}, {"_id": 0, "likes": 1})
    if not p:
        raise HTTPException(404, "Post not found")
    liked = user["user_id"] in p.get("likes", [])
    await db.forum_posts.update_one({"post_id": post_id}, {"$pull" if liked else "$addToSet": {"likes": user["user_id"]}})
    return {"liked": not liked, "like_count": len(p.get("likes", [])) + (-1 if liked else 1)}


# ---------------- Admin hub, broadcasts, contact ----------------
ADMIN_EMAILS = {"jocobisun@gmail.com"} | {e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()}


async def require_admin(request: Request) -> dict:
    user = await current_user(request)
    if user.get("role") != "admin" and user["email"] not in ADMIN_EMAILS:
        raise HTTPException(403, "Admin only")
    return user


# ---------------- Admin → user messages (inbox) ----------------
class AdminMessageIn(BaseModel):
    title: str
    body: str
    link: Optional[str] = None
    target: str = "all"
    user_id: Optional[str] = None
    email: Optional[str] = None


def _visible_messages_query(user: dict) -> dict:
    created = user.get("created_at") or now()
    if isinstance(created, str):
        created = datetime.fromisoformat(created)
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    return {"$or": [{"target": "all", "created_at": {"$gte": created}}, {"target": "user", "user_id": user["user_id"]}]}


def _msg_out(m: dict, read_ids: set) -> dict:
    return {"id": m["id"], "title": m["title"], "body": m["body"], "link": m.get("link"), "target": m["target"],
            "created_at": m["created_at"].isoformat() if isinstance(m["created_at"], datetime) else m["created_at"],
            "read": m["id"] in read_ids}


@api.get("/messages")
async def list_inbox(request: Request, limit: int = 20, offset: int = 0):
    user = await current_user(request)
    limit = max(1, min(limit, 100))
    msgs = await db.admin_messages.find(_visible_messages_query(user), {"_id": 0}).sort("created_at", -1).skip(max(0, offset)).limit(limit).to_list(limit)
    reads = await db.user_message_reads.find({"user_id": user["user_id"], "message_id": {"$in": [m["id"] for m in msgs]}}, {"_id": 0, "message_id": 1}).to_list(limit)
    rid = {r["message_id"] for r in reads}
    return [_msg_out(m, rid) for m in msgs]


@api.get("/messages/unread-count")
async def inbox_unread(request: Request):
    user = await current_user(request)
    ids = [m["id"] for m in await db.admin_messages.find(_visible_messages_query(user), {"_id": 0, "id": 1}).to_list(1000)]
    read = await db.user_message_reads.count_documents({"user_id": user["user_id"], "message_id": {"$in": ids}}) if ids else 0
    return {"count": len(ids) - read}


async def _mark_read(user_id: str, ids: list):
    for mid in ids:
        await db.user_message_reads.update_one({"user_id": user_id, "message_id": mid},
                                               {"$setOnInsert": {"user_id": user_id, "message_id": mid, "read_at": now()}}, upsert=True)


@api.post("/messages/read-all")
async def inbox_read_all(request: Request):
    user = await current_user(request)
    ids = [m["id"] for m in await db.admin_messages.find(_visible_messages_query(user), {"_id": 0, "id": 1}).to_list(1000)]
    await _mark_read(user["user_id"], ids)
    return {"ok": True, "marked": len(ids)}


@api.post("/messages/{message_id}/read")
async def inbox_read(message_id: str, request: Request):
    user = await current_user(request)
    if not await db.admin_messages.find_one({"id": message_id, **_visible_messages_query(user)}, {"_id": 1}):
        raise HTTPException(404, "Message not found")
    await _mark_read(user["user_id"], [message_id])
    return {"ok": True}


@api.post("/admin/messages")
async def admin_create_message(body: AdminMessageIn, request: Request):
    admin = await require_admin(request)
    title, text = body.title.strip(), body.body.strip()
    if not 1 <= len(title) <= 120:
        raise HTTPException(400, "Title must be 1-120 characters")
    if not 1 <= len(text) <= 2000:
        raise HTTPException(400, "Body must be 1-2000 characters")
    link = (body.link or "").strip() or None
    if link and not re.match(r"^https?://[^\s/$.?#][^\s]*$", link):
        raise HTTPException(400, "Invalid link URL (must start with http:// or https://)")
    if body.target not in ("all", "user"):
        raise HTTPException(400, "target must be 'all' or 'user'")
    uid, recipient = None, None
    if body.target == "user":
        q = {"user_id": body.user_id} if body.user_id else {"email": (body.email or "").strip().lower()}
        recipient = await db.users.find_one(q, {"_id": 0, "user_id": 1, "email": 1})
        if not recipient:
            raise HTTPException(404, "Recipient not found")
        uid = recipient["user_id"]
    doc = {"id": new_id("amsg"), "title": title, "body": text, "link": link, "target": body.target, "user_id": uid,
           "recipient_email": recipient["email"] if recipient else None, "created_at": now(), "created_by": admin["user_id"]}
    await db.admin_messages.insert_one(dict(doc))
    doc.pop("_id", None)
    doc["created_at"] = doc["created_at"].isoformat()
    return doc


@api.get("/admin/messages")
async def admin_list_messages(request: Request):
    await require_admin(request)
    msgs = await db.admin_messages.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    for m in msgs:
        m["created_at"] = m["created_at"].isoformat() if isinstance(m["created_at"], datetime) else m["created_at"]
        m["read_count"] = await db.user_message_reads.count_documents({"message_id": m["id"]})
    return msgs


@api.delete("/admin/messages/{message_id}")
async def admin_delete_message(message_id: str, request: Request):
    await require_admin(request)
    res = await db.admin_messages.delete_one({"id": message_id})
    if not res.deleted_count:
        raise HTTPException(404, "Message not found")
    await db.user_message_reads.delete_many({"message_id": message_id})
    return {"ok": True}


class AdminUserPatch(BaseModel):
    name: Optional[str] = None
    is_member: Optional[bool] = None
    role: Optional[str] = None


class AdminUserIn(BaseModel):
    name: str = ""
    email: EmailStr
    password: str


class BroadcastIn(BaseModel):
    text: str


class ContactIn(BaseModel):
    subject: str
    body: str


class PromoIn(BaseModel):
    code: str
    description: str = ""
    discount_percent: int = 0


@api.get("/admin/stats")
async def admin_stats(request: Request):
    await require_admin(request)
    subs = await db.subscriptions.count_documents({"status": "ACTIVE"})
    return {"users": await db.users.count_documents({}), "members": await db.users.count_documents({"is_member": True}),
            "active_subscriptions": subs, "mrr_gbp": round(subs * float(SUB_PRICE), 2),
            "cases": await db.cases.count_documents({}), "messages": await db.messages.count_documents({}),
            "documents": await db.documents.count_documents({"deleted": {"$ne": True}}),
            "forum_posts": await db.forum_posts.count_documents({}),
            "unread_contact": await db.contact_messages.count_documents({"read": False})}


@api.get("/admin/users")
async def admin_users(request: Request):
    await require_admin(request)
    return await db.users.find({}, USER_PROJ).sort("created_at", -1).to_list(500)


@api.post("/admin/users")
async def admin_create_user(body: AdminUserIn, request: Request):
    await require_admin(request)
    email = norm_email(body.email)
    check_password(body.password)
    if await db.users.find_one({"email": email}, {"_id": 1}):
        raise HTTPException(409, "Email already registered")
    uid = await create_user(email, body.name.strip(), None, password_hash=passwords.hash(body.password))
    return await db.users.find_one({"user_id": uid}, USER_PROJ)


@api.patch("/admin/users/{user_id}")
async def admin_patch_user(user_id: str, body: AdminUserPatch, request: Request):
    await require_admin(request)
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    if "role" in upd and upd["role"] not in ("admin", "user"):
        raise HTTPException(400, "Invalid role")
    if not (await db.users.update_one({"user_id": user_id}, {"$set": upd})).matched_count:
        raise HTTPException(404, "User not found")
    return await db.users.find_one({"user_id": user_id}, USER_PROJ)


@api.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, request: Request):
    admin = await require_admin(request)
    if user_id == admin["user_id"]:
        raise HTTPException(400, "You cannot delete yourself")
    if not (await db.users.delete_one({"user_id": user_id})).deleted_count:
        raise HTTPException(404, "User not found")
    await db.user_sessions.delete_many({"user_id": user_id})
    return {"ok": True}


@api.get("/admin/promos")
async def admin_promos(request: Request):
    await require_admin(request)
    return await db.promos.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)


@api.post("/admin/promos")
async def admin_add_promo(body: PromoIn, request: Request):
    await require_admin(request)
    code = body.code.strip().upper()
    if not code or not 0 <= body.discount_percent <= 100:
        raise HTTPException(400, "Invalid promo")
    if await db.promos.find_one({"code": code}, {"_id": 1}):
        raise HTTPException(409, "Code exists")
    doc = {"code": code, "description": body.description, "discount_percent": body.discount_percent, "active": True, "created_at": now()}
    await db.promos.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.patch("/admin/promos/{code}")
async def admin_toggle_promo(code: str, request: Request):
    await require_admin(request)
    p = await db.promos.find_one({"code": code}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Not found")
    await db.promos.update_one({"code": code}, {"$set": {"active": not p["active"]}})
    return {**p, "active": not p["active"]}


@api.delete("/admin/promos/{code}")
async def admin_delete_promo(code: str, request: Request):
    await require_admin(request)
    await db.promos.delete_one({"code": code})
    return {"ok": True}


@api.post("/admin/broadcast")
async def admin_broadcast(body: BroadcastIn, request: Request):
    admin = await require_admin(request)
    if not body.text.strip():
        raise HTTPException(400, "Empty message")
    b = {"broadcast_id": new_id("bc"), "text": body.text.strip()[:2000], "author": author_name(admin), "created_at": now()}
    await db.broadcasts.insert_one(b)
    b.pop("_id", None)
    return b


@api.get("/admin/broadcasts")
async def admin_broadcasts(request: Request):
    await require_admin(request)
    return await db.broadcasts.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)


@api.get("/broadcasts/pending")
async def pending_broadcasts(request: Request):
    """Broadcasts the user has not yet seen; marks them as seen (shown once in main chat)."""
    user = await current_user(request)
    seen = set(user.get("seen_broadcasts", []))
    items = [b for b in await db.broadcasts.find({}, {"_id": 0}).sort("created_at", 1).to_list(100) if b["broadcast_id"] not in seen]
    if items:
        await db.users.update_one({"user_id": user["user_id"]}, {"$addToSet": {"seen_broadcasts": {"$each": [b["broadcast_id"] for b in items]}}})
    return items


@api.post("/contact")
async def contact_admin(body: ContactIn, request: Request):
    user = await current_user(request)
    if not body.subject.strip() or not body.body.strip():
        raise HTTPException(400, "Subject and message are required")
    m = {"msg_id": new_id("cm"), "user_id": user["user_id"], "email": user["email"], "name": user.get("name", ""),
         "subject": body.subject.strip()[:200], "body": body.body.strip()[:4000], "read": False, "created_at": now()}
    await db.contact_messages.insert_one(m)
    m.pop("_id", None)
    return m


@api.get("/admin/contact-messages")
async def admin_messages(request: Request):
    await require_admin(request)
    return await db.contact_messages.find({}, {"_id": 0}).sort("created_at", -1).to_list(300)


@api.patch("/admin/contact-messages/{msg_id}")
async def admin_read_message(msg_id: str, request: Request):
    await require_admin(request)
    await db.contact_messages.update_one({"msg_id": msg_id}, {"$set": {"read": True}})
    return {"ok": True}


@api.delete("/admin/contact-messages/{msg_id}")
async def admin_delete_message(msg_id: str, request: Request):
    await require_admin(request)
    await db.contact_messages.delete_one({"msg_id": msg_id})
    return {"ok": True}


# ---------------- Sent letters (7-day deadline tracker) ----------------
class LetterIn(BaseModel):
    template_id: str
    title: str
    recipient: str = ""
    amount_gbp: Optional[float] = None


class LetterPatch(BaseModel):
    status: str


LETTER_STATUSES = ("awaiting", "paid", "acas")


@api.post("/letters")
async def create_letter(body: LetterIn, request: Request):
    user = await current_user(request)
    sent = now()
    doc = {"letter_id": new_id("letter"), "user_id": user["user_id"], "template_id": body.template_id,
           "title": body.title.strip()[:200], "recipient": body.recipient.strip()[:200], "amount_gbp": body.amount_gbp,
           "status": "awaiting", "sent_at": sent.isoformat(), "deadline_at": (sent + timedelta(days=7)).isoformat()}
    await db.letters.insert_one(dict(doc))
    return doc


@api.get("/letters")
async def list_letters(request: Request):
    user = await current_user(request)
    return await db.letters.find({"user_id": user["user_id"]}, {"_id": 0}).sort("sent_at", -1).to_list(100)


@api.patch("/letters/{letter_id}")
async def update_letter(letter_id: str, body: LetterPatch, request: Request):
    user = await current_user(request)
    if body.status not in LETTER_STATUSES:
        raise HTTPException(400, "Invalid status")
    res = await db.letters.update_one({"letter_id": letter_id, "user_id": user["user_id"]}, {"$set": {"status": body.status}})
    if not res.matched_count:
        raise HTTPException(404, "Letter not found")
    return await db.letters.find_one({"letter_id": letter_id}, {"_id": 0})


@api.delete("/letters/{letter_id}")
async def delete_letter(letter_id: str, request: Request):
    user = await current_user(request)
    await db.letters.delete_one({"letter_id": letter_id, "user_id": user["user_id"]})
    return {"ok": True}


# ---------------- Legal templates ----------------
@api.get("/templates")
async def list_templates():
    return TEMPLATES


# ---------------- PayPal membership subscription (£9.90 / month) ----------------
SUB_PRICE = "9.99"
SUB_CURRENCY = "GBP"


class SubscribeIn(BaseModel):
    app_redirect: str


def paypal_configured():
    return bool(PAYPAL_CLIENT_ID and PAYPAL_SECRET and "placeholder" not in PAYPAL_CLIENT_ID)


async def paypal_headers(hc: httpx.AsyncClient) -> dict:
    r = await hc.post(f"{PAYPAL_API_BASE}/v1/oauth2/token", data={"grant_type": "client_credentials"},
                      auth=(PAYPAL_CLIENT_ID, PAYPAL_SECRET))
    if r.status_code != 200:
        logger.error("PayPal token error %s", r.text)
        raise HTTPException(502, "PayPal authentication failed")
    return {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}


async def ensure_plan(hc: httpx.AsyncClient, headers: dict) -> str:
    key = f"plan_{PAYPAL_API_BASE}_{SUB_PRICE}_{SUB_CURRENCY}"
    cfg = await db.paypal_config.find_one({"key": key}, {"_id": 0})
    if cfg:
        return cfg["plan_id"]
    pr = await hc.post(f"{PAYPAL_API_BASE}/v1/catalogs/products", headers=headers, json={
        "name": "Ask Elon Membership", "description": "Ask Elon monthly membership",
        "type": "SERVICE", "category": "MEMBERSHIP_CLUBS_AND_ORGANIZATIONS"})
    if pr.status_code not in (200, 201):
        logger.error("PayPal product error %s", pr.text)
        raise HTTPException(502, "PayPal product creation failed")
    pl = await hc.post(f"{PAYPAL_API_BASE}/v1/billing/plans", headers=headers, json={
        "product_id": pr.json()["id"], "name": "Ask Elon Monthly", "status": "ACTIVE",
        "billing_cycles": [{"frequency": {"interval_unit": "MONTH", "interval_count": 1}, "tenure_type": "REGULAR",
                            "sequence": 1, "total_cycles": 0,
                            "pricing_scheme": {"fixed_price": {"value": SUB_PRICE, "currency_code": SUB_CURRENCY}}}],
        "payment_preferences": {"auto_bill_outstanding": True, "payment_failure_threshold": 3}})
    if pl.status_code not in (200, 201):
        logger.error("PayPal plan error %s", pl.text)
        raise HTTPException(502, "PayPal plan creation failed")
    plan_id = pl.json()["id"]
    await db.paypal_config.insert_one({"key": key, "plan_id": plan_id, "created_at": now()})
    return plan_id


def public_base(request: Request) -> str:
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("x-forwarded-host", request.headers.get("host"))
    return f"{proto}://{host}"


async def sync_subscription(subscription_id: str) -> dict:
    sub = await db.subscriptions.find_one({"subscription_id": subscription_id}, {"_id": 0})
    if not sub:
        raise HTTPException(404, "Subscription not found")
    async with httpx.AsyncClient(timeout=30) as hc:
        headers = await paypal_headers(hc)
        r = await hc.get(f"{PAYPAL_API_BASE}/v1/billing/subscriptions/{subscription_id}", headers=headers)
    if r.status_code != 200:
        raise HTTPException(502, "PayPal subscription lookup failed")
    data = r.json()
    status = data.get("status", "UNKNOWN")
    nxt = data.get("billing_info", {}).get("next_billing_time")
    await db.subscriptions.update_one({"subscription_id": subscription_id},
                                      {"$set": {"status": status, "next_billing_time": nxt, "updated_at": now()}})
    await db.users.update_one({"user_id": sub["user_id"]}, {"$set": {"is_member": status == "ACTIVE"}})
    return await db.subscriptions.find_one({"subscription_id": subscription_id}, {"_id": 0})


@api.get("/payments/plans")
async def plans(request: Request):
    user = await current_user(request)
    sub = await db.subscriptions.find_one({"user_id": user["user_id"], "status": {"$in": ["ACTIVE", "SUSPENDED"]}},
                                          {"_id": 0}, sort=[("created_at", -1)])
    return {"configured": paypal_configured(), "price": SUB_PRICE, "currency": SUB_CURRENCY,
            "interval": "month", "subscription": sub}


@api.post("/payments/subscribe")
async def subscribe(body: SubscribeIn, request: Request):
    user = await current_user(request)
    if not paypal_configured():
        raise HTTPException(503, "PayPal is not configured yet")
    ret = f"{public_base(request)}/api/payments/return?redirect={quote(body.app_redirect, safe='')}"
    async with httpx.AsyncClient(timeout=30) as hc:
        headers = await paypal_headers(hc)
        plan_id = await ensure_plan(hc, headers)
        r = await hc.post(f"{PAYPAL_API_BASE}/v1/billing/subscriptions", headers=headers, json={
            "plan_id": plan_id, "custom_id": user["user_id"],
            "application_context": {"brand_name": "Ask Elon", "user_action": "SUBSCRIBE_NOW",
                                    "shipping_preference": "NO_SHIPPING",
                                    "return_url": ret, "cancel_url": ret + "&cancelled=1"}})
    if r.status_code not in (200, 201):
        logger.error("PayPal subscription error %s", r.text)
        raise HTTPException(502, "PayPal subscription creation failed")
    data = r.json()
    approve = next(link["href"] for link in data["links"] if link["rel"] == "approve")
    await db.subscriptions.insert_one({"subscription_id": data["id"], "user_id": user["user_id"], "plan_id": plan_id,
                                       "amount": SUB_PRICE, "currency": SUB_CURRENCY, "status": data.get("status", "APPROVAL_PENDING"),
                                       "created_at": now()})
    return {"subscription_id": data["id"], "approve_url": approve}


@api.post("/payments/subscriptions/{subscription_id}/verify")
async def verify_subscription(subscription_id: str, request: Request):
    user = await current_user(request)
    if not await db.subscriptions.find_one({"subscription_id": subscription_id, "user_id": user["user_id"]}):
        raise HTTPException(404, "Subscription not found")
    return await sync_subscription(subscription_id)


@api.post("/payments/cancel")
async def cancel_subscription(request: Request):
    user = await current_user(request)
    sub = await db.subscriptions.find_one({"user_id": user["user_id"], "status": "ACTIVE"}, {"_id": 0})
    if not sub:
        raise HTTPException(404, "No active subscription")
    async with httpx.AsyncClient(timeout=30) as hc:
        headers = await paypal_headers(hc)
        r = await hc.post(f"{PAYPAL_API_BASE}/v1/billing/subscriptions/{sub['subscription_id']}/cancel",
                          headers=headers, json={"reason": "Cancelled by user in app"})
    if r.status_code not in (200, 204):
        raise HTTPException(502, "PayPal cancellation failed")
    return await sync_subscription(sub["subscription_id"])


@api.get("/payments/return", response_class=HTMLResponse)
async def payment_return(redirect: str, subscription_id: str = "", cancelled: str = ""):
    status = "cancelled"
    if subscription_id and not cancelled:
        try:
            status = (await sync_subscription(subscription_id))["status"].lower()
        except HTTPException:
            status = "failed"
    sep = "&" if "?" in redirect else "?"
    target = f"{redirect}{sep}payment={status}"
    return HTMLResponse(f"""<html><head><meta name="viewport" content="width=device-width"/>
<meta http-equiv="refresh" content="0;url={target}"/></head>
<body style="font-family:sans-serif;text-align:center;padding:40px;background:#FBF8F3;color:#0F1A24">
<h2>Ask Elon</h2><p>Subscription: {status}</p><a href="{target}">Return to app</a></body></html>""")

@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("user_id")
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.messages.create_index([("user_id", 1), ("thread_id", 1), ("created_at", 1)])
    await db.cases.create_index("case_id", unique=True)
    await db.subscriptions.create_index("subscription_id", unique=True)
    await db.paypal_config.create_index("key", unique=True)
    await db.password_resets.create_index("user_id")
    await db.login_attempts.create_index("at", expireAfterSeconds=900)
    if not await db.users.find_one({"email": DEMO_EMAIL}, {"_id": 1}):
        uid = await create_user(DEMO_EMAIL, "Artur Kowalski (Demo)", None, password_hash=passwords.hash(DEMO_PASSWORD), onboarded=True)
        await db.users.update_one({"user_id": uid}, {"$set": {"employer": "Amazon Fulfilment LCY2", "job_title": "Warehouse Operative"}})
    await db.users.update_one({"email": DEMO_EMAIL, "profile_complete": {"$ne": True}}, {"$set": {
        "address": "12 High Street, Dartford DA1 1AA", "phone": "+44 7700 900123", "industry": "Logistics & Warehousing",
        "contract_type": "zero_hours", "start_date": "2024-01-12", "workplace_address": "Amazon LCY2, London Road, Tilbury RM18 7AN",
        "hr_email": "hr-lcy2@example.com", "profile_complete": True}})
    await db.users.update_one({"email": DEMO_EMAIL}, {"$set": {"is_member": True, "member_plan": "demo"}})
    await db.user_message_reads.create_index([("user_id", 1), ("message_id", 1)], unique=True)
    await db.admin_messages.create_index([("created_at", -1)])
    await db.users.update_many({"email": {"$in": list(ADMIN_EMAILS)}}, {"$set": {"role": "admin", "is_member": True}})
    await db.promos.create_index("code", unique=True)
    await db.forum_posts.create_index("post_id", unique=True)
    await db.forum_comments.create_index([("post_id", 1), ("created_at", 1)])
    if not await db.forum_posts.count_documents({}):
        for i, (cat, title, body, author) in enumerate(FORUM_SEED):
            await db.forum_posts.insert_one({"post_id": new_id("post"), "user_id": "seed", "author": author, "category": cat,
                                             "title": title, "body": body, "likes": [], "comment_count": 0,
                                             "created_at": now() - timedelta(hours=5 * (i + 1))})
    await db.documents.create_index([("user_id", 1), ("created_at", -1)])
    await db.documents.create_index("doc_id", unique=True)
    try:
        await run_in_threadpool(init_storage)
    except Exception:
        logger.exception("Object storage init failed")


app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
