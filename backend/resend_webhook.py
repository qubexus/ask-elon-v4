"""Resend webhook receiver: POST /api/webhooks/resend (log only, nothing is stored).

Resend signs webhooks with Svix. Headers: svix-id, svix-timestamp, svix-signature
("v1,<base64>" entries separated by spaces). Signed content: f"{id}.{timestamp}.{raw body}",
HMAC-SHA256 with the base64-decoded part of RESEND_WEBHOOK_SECRET after the "whsec_" prefix.
Without RESEND_WEBHOOK_SECRET the endpoint answers 503. Bad/missing/stale signature -> 401.
"""
import base64
import hashlib
import hmac
import json
import logging
import os
import time

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger("resend_webhook")

TOLERANCE_SECONDS = 5 * 60
LOGGED_EVENTS = {"email.sent", "email.delivered", "email.bounced", "email.complained"}


def _secret_bytes(secret: str) -> bytes:
    s = secret.strip()
    if s.startswith("whsec_"):
        s = s[len("whsec_"):]
    return base64.b64decode(s)


def verify_signature(secret: str, msg_id: str, timestamp: str, signature_header: str, body: bytes,
                     now: float | None = None) -> bool:
    if not (secret and msg_id and timestamp and signature_header):
        return False
    try:
        ts = int(timestamp)
    except ValueError:
        return False
    if abs((time.time() if now is None else now) - ts) > TOLERANCE_SECONDS:
        return False
    try:
        key = _secret_bytes(secret)
    except Exception:
        return False
    signed = msg_id.encode() + b"." + timestamp.encode() + b"." + body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()
    ok = False
    for part in signature_header.split():
        version, _, sig = part.partition(",")
        if version == "v1" and hmac.compare_digest(sig, expected):
            ok = True
    return ok


def mask_email(addr) -> str:
    if not isinstance(addr, str) or "@" not in addr:
        return "?"
    local, _, domain = addr.rpartition("@")
    return (local[:1] or "?") + "***@" + domain


def build_router() -> APIRouter:
    router = APIRouter(prefix="/api")

    @router.post("/webhooks/resend")
    async def resend_webhook(request: Request):
        secret = os.environ.get("RESEND_WEBHOOK_SECRET", "")
        if not secret:
            return JSONResponse({"detail": "Webhook not configured"}, status_code=503)
        body = await request.body()
        h = request.headers
        if not verify_signature(secret, h.get("svix-id", ""), h.get("svix-timestamp", ""),
                                h.get("svix-signature", ""), body):
            logger.warning("Resend webhook: rejected request with invalid signature")
            return JSONResponse({"detail": "Invalid signature"}, status_code=401)
        try:
            event = json.loads(body or b"{}")
        except ValueError:
            return JSONResponse({"detail": "Invalid JSON"}, status_code=400)
        etype = str(event.get("type", "?"))
        data = event.get("data") if isinstance(event.get("data"), dict) else {}
        to = data.get("to")
        to_list = to if isinstance(to, list) else [to] if to else []
        masked = ",".join(mask_email(a) for a in to_list) or "?"
        level = logging.INFO if etype in LOGGED_EVENTS else logging.DEBUG
        extra = ""
        if etype == "email.bounced" and isinstance(data.get("bounce"), dict):
            b = data["bounce"]
            extra = f" bounce={b.get('type', '?')}/{b.get('subType', '?')}"
        logger.log(level, "Resend webhook: %s email_id=%s to=%s created_at=%s svix_id=%s%s",
                   etype, data.get("email_id", "?"), masked, event.get("created_at", "?"),
                   h.get("svix-id", "?"), extra)
        return {"ok": True}

    return router
