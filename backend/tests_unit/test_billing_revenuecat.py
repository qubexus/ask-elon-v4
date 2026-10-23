"""Unit tests for RevenueCat PRO status – mocked RevenueCat (httpx.MockTransport), fake DB, no network, no keys.

Run:  cd backend && python -m pytest tests_unit -n 0
"""
import asyncio
import hashlib
import hmac
import json
import os
import time
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from fastapi import FastAPI, HTTPException, Request
from fastapi.testclient import TestClient

import billing_revenuecat as billing

NOW = datetime.now(timezone.utc)
FUTURE = NOW + timedelta(days=20)
PAST = NOW - timedelta(days=2)
iso = lambda d: d.strftime("%Y-%m-%dT%H:%M:%SZ")  # noqa: E731
ms = lambda d: int(d.timestamp() * 1000)  # noqa: E731
FAKE_KEY = "sk_unit_test_not_a_real_key"


@pytest.fixture(autouse=True)
def rc_env(monkeypatch):
    for k in ("REVENUECAT_SECRET_KEY", "REVENUECAT_PROJECT_ID", "REVENUECAT_ENTITLEMENT_ID", "REVENUECAT_WEBHOOK_AUTH",
              "REVENUECAT_WEBHOOK_HMAC_SECRET", "REVENUECAT_ALLOW_SANDBOX", "REVENUECAT_CACHE_MINUTES"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("APP_ENV", "production")
    yield monkeypatch


def v1(entitlements=None, subscriptions=None):
    return {"subscriber": {"entitlements": entitlements or {}, "subscriptions": subscriptions or {}, "non_subscriptions": {}}}


def v1_pro(expires, sandbox=False, refunded=None):
    return v1({"pro": {"expires_date": iso(expires) if expires else None, "grace_period_expires_date": None,
                       "product_identifier": "askelon_pro_monthly", "purchase_date": iso(PAST)}},
              {"askelon_pro_monthly": {"expires_date": iso(expires) if expires else None, "is_sandbox": sandbox,
                                       "store": "play_store", "refunded_at": refunded}})


def v2_sub(gives_access=True, env="production", ends=FUTURE, lookup="pro"):
    return {"object": "list", "items": [{
        "object": "subscription", "product_id": "prod123", "current_period_ends_at": ms(ends), "gives_access": gives_access,
        "status": "active" if gives_access else "expired", "environment": env, "store": "app_store",
        "entitlements": {"items": [{"id": "entl1", "lookup_key": lookup,
                                    "products": {"items": [{"id": "prod123", "store_identifier": "askelon_pro_monthly"}]}}]}}]}


# ---------------- parsing ----------------
def test_v1_active():
    st = billing.parse_v1_subscriber(v1_pro(FUTURE), "pro", NOW, sandbox_ok=False)
    assert st["active"] and st["product_id"] == "askelon_pro_monthly" and st["store"] == "play_store"
    assert st["environment"] == "production" and st["expires_at"] > NOW


def test_v1_expired():
    assert not billing.parse_v1_subscriber(v1_pro(PAST), "pro", NOW, sandbox_ok=True)["active"]


def test_v1_no_entitlement():
    st = billing.parse_v1_subscriber(v1(), "pro", NOW, sandbox_ok=True)
    assert st["active"] is False and st["product_id"] is None


def test_v1_other_entitlement_only():
    p = v1({"gold": {"expires_date": iso(FUTURE), "product_identifier": "x"}})
    assert not billing.parse_v1_subscriber(p, "pro", NOW, sandbox_ok=True)["active"]


def test_v1_sandbox_only_counts_when_allowed():
    assert not billing.parse_v1_subscriber(v1_pro(FUTURE, sandbox=True), "pro", NOW, sandbox_ok=False)["active"]
    st = billing.parse_v1_subscriber(v1_pro(FUTURE, sandbox=True), "pro", NOW, sandbox_ok=True)
    assert st["active"] and st["environment"] == "sandbox"


def test_v1_refunded_and_lifetime():
    assert not billing.parse_v1_subscriber(v1_pro(FUTURE, refunded=iso(NOW)), "pro", NOW, True)["active"]
    assert billing.parse_v1_subscriber(v1_pro(None), "pro", NOW, True)["active"]  # no expiry = lifetime


def test_v2_active_expired_sandbox_other():
    assert billing.parse_v2_subscriptions(v2_sub(), "pro", NOW, False)["active"]
    assert billing.parse_v2_subscriptions(v2_sub(), "pro", NOW, False)["product_id"] == "askelon_pro_monthly"
    assert billing.parse_v2_subscriptions(v2_sub(), "entl1", NOW, False)["active"]  # by RevenueCat id too
    assert not billing.parse_v2_subscriptions(v2_sub(gives_access=False, ends=PAST), "pro", NOW, True)["active"]
    assert not billing.parse_v2_subscriptions(v2_sub(env="sandbox"), "pro", NOW, False)["active"]
    assert billing.parse_v2_subscriptions(v2_sub(env="sandbox"), "pro", NOW, True)["active"]
    assert not billing.parse_v2_subscriptions(v2_sub(lookup="gold"), "pro", NOW, True)["active"]
    assert not billing.parse_v2_subscriptions({}, "pro", NOW, True)["active"]


# ---------------- is_pro ----------------
def test_is_pro_sources():
    assert not billing.is_pro(None)
    assert not billing.is_pro({"email": "a@example.com"})
    assert billing.is_pro({"email": "boss@example.com"}, {"boss@example.com"})
    assert billing.is_pro({"role": "admin"})
    assert billing.is_pro({"is_member": True})  # PayPal / granted by admin
    assert billing.is_pro({"pro_status": {"active": True, "expires_at": FUTURE}})
    assert not billing.is_pro({"pro_status": {"active": True, "expires_at": PAST}})  # stored but expired
    assert not billing.is_pro({"pro_status": {"active": False}})


# ---------------- fetch + refresh with mocked HTTP ----------------
class FakeUsers:
    def __init__(self, docs):
        self.docs = {d["user_id"]: dict(d) for d in docs}

    async def update_one(self, q, upd):
        self.docs[q["user_id"]].update(upd["$set"])

    async def find_one(self, q, proj=None):
        d = self.docs.get(q["user_id"])
        return dict(d) if d else None


class FakeEvents:
    def __init__(self):
        self.ids = []

    async def update_one(self, q, upd, upsert=False):
        if q["event_id"] not in self.ids:
            self.ids.append(q["event_id"])


class FakeDB:
    def __init__(self, users):
        self.users = FakeUsers(users)
        self.revenuecat_events = FakeEvents()


def mock_client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def test_fetch_v1_uses_bearer_and_url(rc_env):
    rc_env.setenv("REVENUECAT_SECRET_KEY", FAKE_KEY)
    seen = {}

    def h(req):
        seen["url"], seen["auth"] = str(req.url), req.headers["authorization"]
        return httpx.Response(200, json=v1_pro(FUTURE))

    st = asyncio.run(billing.fetch_status("user_abc", client=mock_client(h)))
    assert st["active"] and seen["url"] == "https://api.revenuecat.com/v1/subscribers/user_abc"
    assert seen["auth"] == f"Bearer {FAKE_KEY}"


def test_fetch_v2_and_404(rc_env):
    rc_env.setenv("REVENUECAT_SECRET_KEY", FAKE_KEY)
    rc_env.setenv("REVENUECAT_PROJECT_ID", "projX")
    urls = []

    def h(req):
        urls.append(str(req.url))
        return httpx.Response(200, json=v2_sub()) if "user_a" in str(req.url) else httpx.Response(404, json={})

    assert asyncio.run(billing.fetch_status("user_a", client=mock_client(h)))["active"]
    assert not asyncio.run(billing.fetch_status("user_new", client=mock_client(h)))["active"]
    assert urls[0].startswith("https://api.revenuecat.com/v2/projects/projX/customers/user_a/subscriptions")


def test_errors_never_leak_key(rc_env):
    rc_env.setenv("REVENUECAT_SECRET_KEY", FAKE_KEY)
    with pytest.raises(billing.RevenueCatError) as e:
        asyncio.run(billing.fetch_status("u", client=mock_client(lambda r: httpx.Response(401, json={"x": FAKE_KEY}))))
    assert FAKE_KEY not in str(e.value)


def test_refresh_stores_status_and_caches(rc_env):
    rc_env.setenv("REVENUECAT_SECRET_KEY", FAKE_KEY)
    calls = []

    def h(req):
        calls.append(1)
        return httpx.Response(200, json=v1_pro(FUTURE))

    db = FakeDB([{"user_id": "user_a"}])
    u = asyncio.run(billing.refresh_user(db, {"user_id": "user_a"}, client=mock_client(h)))
    assert u["pro_status"]["active"] and db.users.docs["user_a"]["pro_status"]["source"] == "revenuecat"
    asyncio.run(billing.refresh_user(db, u, client=mock_client(h)))  # fresh -> no second call
    assert len(calls) == 1
    asyncio.run(billing.refresh_user(db, u, client=mock_client(h), force=True))
    assert len(calls) == 2


def test_refresh_outage_keeps_previous_status(rc_env):
    rc_env.setenv("REVENUECAT_SECRET_KEY", FAKE_KEY)
    old = {"active": True, "expires_at": FUTURE, "checked_at": PAST}
    db = FakeDB([{"user_id": "user_a", "pro_status": old}])
    u = asyncio.run(billing.refresh_user(db, {"user_id": "user_a", "pro_status": old},
                                         client=mock_client(lambda r: httpx.Response(500))))
    assert u["pro_status"]["active"] and "error" in u["pro_status"]


def test_refresh_noop_without_key():
    db = FakeDB([{"user_id": "user_a"}])
    assert asyncio.run(billing.refresh_user(db, {"user_id": "user_a"}, force=True)) == {"user_id": "user_a"}


# ---------------- webhook ----------------
async def fake_user(request: Request):
    raise HTTPException(401, "no")


def webhook_app(db):
    app = FastAPI()
    app.include_router(billing.build_router(db, fake_user, lambda *a: None, set()))
    return TestClient(app)


EVENT = {"api_version": "1.0", "event": {"id": "evt1", "type": "INITIAL_PURCHASE", "app_user_id": "user_a",
                                         "original_app_user_id": "user_a", "aliases": ["$RCAnonymousID:x"],
                                         "entitlement_ids": ["pro"], "product_id": "askelon_pro_monthly",
                                         "expiration_at_ms": ms(FUTURE), "environment": "SANDBOX", "store": "APP_STORE"}}


def test_webhook_disabled_without_secret():
    c = webhook_app(FakeDB([{"user_id": "user_a"}]))
    assert c.post("/api/billing/revenuecat/webhook", json=EVENT, headers={"Authorization": "anything"}).status_code == 401


def test_webhook_rejects_wrong_or_missing_auth(rc_env):
    rc_env.setenv("REVENUECAT_WEBHOOK_AUTH", "hook-secret-123")
    c = webhook_app(FakeDB([{"user_id": "user_a"}]))
    assert c.post("/api/billing/revenuecat/webhook", json=EVENT).status_code == 401
    assert c.post("/api/billing/revenuecat/webhook", json=EVENT, headers={"Authorization": "wrong"}).status_code == 401


def test_webhook_event_updates_user_without_key(rc_env):
    rc_env.setenv("REVENUECAT_WEBHOOK_AUTH", "hook-secret-123")
    rc_env.setenv("REVENUECAT_ALLOW_SANDBOX", "1")
    db = FakeDB([{"user_id": "user_a"}])
    r = webhook_app(db).post("/api/billing/revenuecat/webhook", json=EVENT, headers={"Authorization": "hook-secret-123"})
    assert r.status_code == 200 and r.json()["updated"] == 1
    assert billing.is_pro(db.users.docs["user_a"]) and db.revenuecat_events.ids == ["evt1"]
    exp = {**EVENT, "event": {**EVENT["event"], "id": "evt2", "type": "EXPIRATION", "expiration_at_ms": ms(PAST)}}
    webhook_app(db).post("/api/billing/revenuecat/webhook", json=exp, headers={"Authorization": "Bearer hook-secret-123"})
    assert not billing.is_pro(db.users.docs["user_a"])


def test_webhook_sandbox_ignored_in_production(rc_env):
    rc_env.setenv("REVENUECAT_WEBHOOK_AUTH", "hook-secret-123")
    db = FakeDB([{"user_id": "user_a"}])
    webhook_app(db).post("/api/billing/revenuecat/webhook", json=EVENT, headers={"Authorization": "hook-secret-123"})
    assert not billing.is_pro(db.users.docs["user_a"])


def test_webhook_hmac(rc_env):
    rc_env.setenv("REVENUECAT_WEBHOOK_AUTH", "hook-secret-123")
    rc_env.setenv("REVENUECAT_WEBHOOK_HMAC_SECRET", "hmac-secret")
    body = json.dumps(EVENT).encode()
    ts = str(int(time.time()))
    sig = hmac.new(b"hmac-secret", f"{ts}.".encode() + body, hashlib.sha256).hexdigest()
    ok = {"authorization": "hook-secret-123", "x-revenuecat-webhook-signature": f"t={ts},v1={sig}"}
    assert billing.webhook_authorized(ok, body)
    assert not billing.webhook_authorized({**ok, "x-revenuecat-webhook-signature": f"t={ts},v1=deadbeef"}, body)
    assert not billing.webhook_authorized({"authorization": "hook-secret-123"}, body)
    assert not billing.webhook_authorized(ok, body, now=time.time() + 3600)  # replay window


def test_webhook_unknown_user_is_ok(rc_env):
    rc_env.setenv("REVENUECAT_WEBHOOK_AUTH", "hook-secret-123")
    ev = {"event": {**EVENT["event"], "app_user_id": "$RCAnonymousID:abc", "original_app_user_id": "x", "aliases": []}}
    r = webhook_app(FakeDB([])).post("/api/billing/revenuecat/webhook", json=ev, headers={"Authorization": "hook-secret-123"})
    assert r.status_code == 200 and r.json()["updated"] == 0


def test_status_payload_has_no_secret(rc_env):
    rc_env.setenv("REVENUECAT_SECRET_KEY", FAKE_KEY)
    p = billing.status_payload({"user_id": "u", "pro_status": {"active": True, "expires_at": FUTURE, "checked_at": NOW}}, set())
    assert p["is_pro"] and p["source"] == "revenuecat" and FAKE_KEY not in json.dumps(p)
