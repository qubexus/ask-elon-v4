"""PRO subscription status from RevenueCat (App Store, Google Play, RevenueCat Web Billing).

The app's RevenueCat app_user_id is our own `user_id` (the frontend calls Purchases.logIn(user.user_id)),
so the server can always ask RevenueCat about a user without trusting anything the client says.

Environment (backend/.env, never committed):
  REVENUECAT_SECRET_KEY      secret API key (sk_...). v2 key when REVENUECAT_PROJECT_ID is set, otherwise a v1 key.
  REVENUECAT_PROJECT_ID      project id (proj...). Set = REST API v2, empty = REST API v1 (/v1/subscribers).
  REVENUECAT_ENTITLEMENT_ID  entitlement identifier (lookup key), default "pro".
  REVENUECAT_WEBHOOK_AUTH    exact value RevenueCat sends in the webhook Authorization header.
  REVENUECAT_WEBHOOK_HMAC_SECRET  optional; when set, X-RevenueCat-Webhook-Signature is verified too.
  REVENUECAT_ALLOW_SANDBOX   "1" = sandbox/Test Store purchases count as PRO. Default: on in development, off in production.
  REVENUECAT_CACHE_MINUTES   how long a stored status is trusted before re-checking (default 10).

Stored on the user document:
  pro_status = {active, source: "revenuecat", entitlement, expires_at, product_id, store, environment, checked_at, error?}
`is_member` stays the PayPal / admin-granted flag; is_pro() combines all sources.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Optional
from urllib.parse import quote

import httpx
from fastapi import APIRouter, HTTPException, Request

logger = logging.getLogger("billing_revenuecat")

API_V1 = "https://api.revenuecat.com/v1"
API_V2 = "https://api.revenuecat.com/v2"


def _env(name: str, default: str = "") -> str:
    return (os.environ.get(name) or default).strip()


def secret_key() -> str:
    return _env("REVENUECAT_SECRET_KEY")


def project_id() -> str:
    return _env("REVENUECAT_PROJECT_ID")


def entitlement_id() -> str:
    return _env("REVENUECAT_ENTITLEMENT_ID", "pro")


def cache_ttl() -> timedelta:
    try:
        return timedelta(minutes=max(0, int(_env("REVENUECAT_CACHE_MINUTES", "10"))))
    except ValueError:
        return timedelta(minutes=10)


def allow_sandbox() -> bool:
    v = _env("REVENUECAT_ALLOW_SANDBOX").lower()
    if v:
        return v in ("1", "true", "yes")
    return _env("APP_ENV", "development").lower() != "production"


def configured() -> bool:
    k = secret_key()
    return bool(k) and "placeholder" not in k


def api_version() -> str:
    return "v2" if project_id() else "v1"


class ProRequired(HTTPException):
    """402 with code "pro_required" – the app shows the paywall."""

    def __init__(self, feature: str = ""):
        super().__init__(402, "This is a PRO feature")
        self.feature = feature


class RevenueCatError(Exception):
    pass


def _utc(dt: Any) -> Optional[datetime]:
    if dt is None:
        return None
    if isinstance(dt, (int, float)):
        return datetime.fromtimestamp(dt / 1000, tz=timezone.utc)
    if isinstance(dt, str):
        try:
            dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
        except ValueError:
            return None
    if isinstance(dt, datetime):
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    return None


# ---------------- Parsing RevenueCat responses (pure functions, unit-tested) ----------------
def parse_v1_subscriber(payload: dict, ent: str, now: datetime, sandbox_ok: bool) -> dict:
    """GET /v1/subscribers/{id} -> pro_status (without checked_at)."""
    sub = (payload or {}).get("subscriber") or {}
    e = (sub.get("entitlements") or {}).get(ent)
    if not e:
        return {"active": False, "entitlement": ent, "expires_at": None, "product_id": None, "store": None, "environment": None}
    product = e.get("product_identifier")
    s = (sub.get("subscriptions") or {}).get(product) or {}
    if not s:  # non-subscription purchase (e.g. lifetime)
        s = next(iter((sub.get("non_subscriptions") or {}).get(product) or []), {}) or {}
    expires = _utc(e.get("grace_period_expires_date")) or _utc(e.get("expires_date"))
    sandbox = bool(s.get("is_sandbox"))
    refunded = bool(s.get("refunded_at"))
    active = (expires is None or expires > now) and not refunded and (sandbox_ok or not sandbox)
    return {"active": active, "entitlement": ent, "expires_at": expires, "product_id": product,
            "store": s.get("store"), "environment": "sandbox" if sandbox else "production"}


def parse_v2_subscriptions(payload: dict, ent: str, now: datetime, sandbox_ok: bool) -> dict:
    """GET /v2/projects/{p}/customers/{id}/subscriptions -> pro_status (without checked_at).

    `ent` may be the entitlement lookup key ("pro") or its RevenueCat id ("entl...")."""
    best: Optional[dict] = None
    for s in (payload or {}).get("items") or []:
        ents = ((s.get("entitlements") or {}).get("items")) or []
        if not any(x.get("lookup_key") == ent or x.get("id") == ent for x in ents):
            continue
        env = (s.get("environment") or "").lower() or None
        expires = _utc(s.get("current_period_ends_at")) or _utc(s.get("ends_at"))
        active = bool(s.get("gives_access")) and (sandbox_ok or env != "sandbox")
        product = s.get("product_id")
        for x in ents:
            for p in ((x.get("products") or {}).get("items")) or []:
                if p.get("id") == product and p.get("store_identifier"):
                    product = p["store_identifier"]
        cand = {"active": active, "entitlement": ent, "expires_at": expires, "product_id": product,
                "store": (s.get("store") or "").lower() or None, "environment": env}
        far = datetime.max.replace(tzinfo=timezone.utc)
        if best is None or (cand["active"], cand["expires_at"] or far) > (best["active"], best["expires_at"] or far):
            best = cand
    return best or {"active": False, "entitlement": ent, "expires_at": None, "product_id": None, "store": None, "environment": None}


# ---------------- Talking to RevenueCat ----------------
async def fetch_status(app_user_id: str, *, client: Optional[httpx.AsyncClient] = None,
                       now: Optional[datetime] = None) -> dict:
    """Asks RevenueCat for the user's entitlement. Raises RevenueCatError on network/auth problems.
    The secret key is only ever placed in the Authorization header – never logged or returned."""
    if not configured():
        raise RevenueCatError("RevenueCat is not configured")
    now = now or datetime.now(timezone.utc)
    uid = quote(app_user_id, safe="")
    headers = {"Authorization": f"Bearer {secret_key()}", "Accept": "application/json"}
    own = client is None
    hc = client or httpx.AsyncClient(timeout=15)
    try:
        if api_version() == "v2":
            url = f"{API_V2}/projects/{quote(project_id(), safe='')}/customers/{uid}/subscriptions?limit=50"
            r = await hc.get(url, headers=headers)
            if r.status_code == 404:  # customer never seen by RevenueCat
                return parse_v2_subscriptions({}, entitlement_id(), now, allow_sandbox())
            if r.status_code != 200:
                raise RevenueCatError(f"RevenueCat v2 HTTP {r.status_code}")
            return parse_v2_subscriptions(r.json(), entitlement_id(), now, allow_sandbox())
        r = await hc.get(f"{API_V1}/subscribers/{uid}", headers=headers)
        if r.status_code not in (200, 201):
            raise RevenueCatError(f"RevenueCat v1 HTTP {r.status_code}")
        return parse_v1_subscriber(r.json(), entitlement_id(), now, allow_sandbox())
    except httpx.HTTPError as e:
        raise RevenueCatError(f"RevenueCat request failed: {type(e).__name__}") from None
    finally:
        if own:
            await hc.aclose()


def rc_active(user: dict, now: Optional[datetime] = None) -> bool:
    ps = user.get("pro_status") or {}
    if not ps.get("active"):
        return False
    exp = _utc(ps.get("expires_at"))
    return exp is None or exp > (now or datetime.now(timezone.utc))


def is_pro(user: Optional[dict], admin_emails: frozenset | set = frozenset(), now: Optional[datetime] = None) -> bool:
    """Single server-side PRO check: admin, PayPal/admin-granted is_member, or an active RevenueCat entitlement."""
    if not user:
        return False
    if user.get("role") == "admin" or (user.get("email") or "").lower() in admin_emails:
        return True
    if user.get("is_member"):
        return True
    return rc_active(user, now)


def needs_refresh(user: dict, now: Optional[datetime] = None) -> bool:
    now = now or datetime.now(timezone.utc)
    ps = user.get("pro_status") or {}
    checked = _utc(ps.get("checked_at"))
    if checked is None or now - checked >= cache_ttl():
        return True
    exp = _utc(ps.get("expires_at"))
    return bool(ps.get("active") and exp is not None and exp <= now)  # expired since last check


async def refresh_user(db, user: dict, *, client: Optional[httpx.AsyncClient] = None, force: bool = False) -> dict:
    """Re-checks RevenueCat when configured and the stored status is stale (or force). Returns the updated user.
    A RevenueCat outage never removes PRO that was already stored – it only records the error."""
    if not configured() or (not force and not needs_refresh(user)):
        return user
    t = datetime.now(timezone.utc)
    try:
        st = await fetch_status(user["user_id"], client=client, now=t)
        st.update({"source": "revenuecat", "checked_at": t})
    except RevenueCatError as e:
        logger.warning("RevenueCat check failed for %s: %s", user.get("user_id"), e)
        st = {**(user.get("pro_status") or {"active": False, "source": "revenuecat"}), "checked_at": t, "error": str(e)[:200]}
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"pro_status": st}})
    return {**user, "pro_status": st}


def status_payload(user: dict, admin_emails) -> dict:
    ps = user.get("pro_status") or {}
    if user.get("role") == "admin" or (user.get("email") or "").lower() in admin_emails:
        source = "admin"
    elif rc_active(user):
        source = "revenuecat"
    elif user.get("is_member"):
        source = "paypal_or_admin"
    else:
        source = None
    exp = _utc(ps.get("expires_at"))
    chk = _utc(ps.get("checked_at"))
    return {"is_pro": is_pro(user, admin_emails), "source": source, "revenuecat_configured": configured(),
            "entitlement": entitlement_id(),
            "revenuecat": {"active": rc_active(user), "expires_at": exp.isoformat() if exp else None,
                           "product_id": ps.get("product_id"), "store": ps.get("store"),
                           "environment": ps.get("environment"), "checked_at": chk.isoformat() if chk else None}}


# ---------------- Webhook ----------------
def webhook_authorized(headers, raw_body: bytes, now: Optional[float] = None) -> bool:
    expected = _env("REVENUECAT_WEBHOOK_AUTH")
    if not expected:
        return False  # webhook disabled until a secret header value is configured
    got = headers.get("authorization") or ""
    ok = any(hmac.compare_digest(got.encode(), v.encode()) for v in (expected, f"Bearer {expected}"))
    if not ok:
        return False
    hsec = _env("REVENUECAT_WEBHOOK_HMAC_SECRET")
    if hsec:
        sig = headers.get("x-revenuecat-webhook-signature") or ""
        try:
            parts = dict(p.split("=", 1) for p in sig.split(","))
            ts, v1 = parts["t"], parts["v1"]
            calc = hmac.new(hsec.encode(), f"{ts}.".encode() + raw_body, hashlib.sha256).hexdigest()
            if not hmac.compare_digest(calc, v1) or abs((now or time.time()) - int(ts)) > 300:
                return False
        except (KeyError, ValueError):
            return False
    return True


def status_from_event(ev: dict, ent: str, now: datetime, sandbox_ok: bool) -> Optional[dict]:
    """Used only when no secret key is configured: derives the status from the webhook event itself."""
    ids = ev.get("entitlement_ids") or ([ev["entitlement_id"]] if ev.get("entitlement_id") else [])
    if ent not in ids:
        return None
    typ = (ev.get("type") or "").upper()
    expires = _utc(ev.get("expiration_at_ms"))
    sandbox = (ev.get("environment") or "").upper() == "SANDBOX"
    active = typ != "EXPIRATION" and (expires is None or expires > now) and (sandbox_ok or not sandbox)
    return {"active": active, "entitlement": ent, "expires_at": expires, "product_id": ev.get("product_id"),
            "store": (ev.get("store") or "").lower() or None, "environment": "sandbox" if sandbox else "production",
            "source": "revenuecat", "checked_at": now, "via": "webhook"}


def build_router(db, current_user: Callable[[Request], Awaitable[dict]], rate_limit: Callable,
                 admin_emails) -> APIRouter:
    r = APIRouter(prefix="/api/billing", tags=["billing"])

    @r.get("/status")
    async def billing_status(request: Request):
        user = await current_user(request)
        user = await refresh_user(db, user)
        return status_payload(user, admin_emails)

    @r.post("/revenuecat/sync")
    async def billing_sync(request: Request):
        """Called by the app right after a purchase/restore: forces a fresh check with RevenueCat."""
        user = await current_user(request)
        rate_limit(f"rc-sync:{user['user_id']}", 10, 60)
        if not configured():
            raise HTTPException(503, "RevenueCat is not configured on the server yet")
        user = await refresh_user(db, user, force=True)
        return status_payload(user, admin_emails)

    @r.post("/revenuecat/webhook")
    async def billing_webhook(request: Request):
        raw = await request.body()
        if not webhook_authorized(request.headers, raw):
            raise HTTPException(401, "Unauthorized")
        try:
            import json
            ev = (json.loads(raw or b"{}") or {}).get("event") or {}
        except ValueError:
            raise HTTPException(400, "Invalid JSON")
        ids = {ev.get("app_user_id"), ev.get("original_app_user_id"), *(ev.get("aliases") or [])}
        if ev.get("type") == "TRANSFER":
            ids |= set(ev.get("transferred_from") or []) | set(ev.get("transferred_to") or [])
        ids = [i for i in ids if isinstance(i, str) and i.startswith("user_")]
        updated = 0
        for uid in ids[:10]:
            user = await db.users.find_one({"user_id": uid}, {"_id": 0, "password_hash": 0})
            if not user:
                continue
            if configured():  # RevenueCat recommends re-reading the customer after any webhook
                await refresh_user(db, user, force=True)
            else:
                st = status_from_event(ev, entitlement_id(), datetime.now(timezone.utc), allow_sandbox())
                if st is None:
                    continue
                await db.users.update_one({"user_id": uid}, {"$set": {"pro_status": st}})
            updated += 1
        await db.revenuecat_events.update_one(
            {"event_id": ev.get("id") or f"noid-{time.time_ns()}"},
            {"$setOnInsert": {"type": ev.get("type"), "app_user_id": ev.get("app_user_id"),
                              "environment": ev.get("environment"), "received_at": datetime.now(timezone.utc)}},
            upsert=True)
        return {"ok": True, "updated": updated}

    return r


async def ensure_indexes(db):
    await db.revenuecat_events.create_index("event_id", unique=True)
    await db.revenuecat_events.create_index("received_at", expireAfterSeconds=90 * 86400)
