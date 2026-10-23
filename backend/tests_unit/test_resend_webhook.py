"""Unit tests for the Resend (Svix) webhook signature check and endpoint.

Run:  cd backend && python -m pytest tests_unit/test_resend_webhook.py -n 0
"""
import base64
import hashlib
import hmac
import json
import time

from fastapi import FastAPI
from fastapi.testclient import TestClient

import resend_webhook as rw

KEY = b"0123456789abcdef0123456789abcdef"
SECRET = "whsec_" + base64.b64encode(KEY).decode()


def sign(msg_id, ts, body, key=KEY):
    d = hmac.new(key, f"{msg_id}.{ts}.".encode() + body, hashlib.sha256).digest()
    return "v1," + base64.b64encode(d).decode()


def client(monkeypatch, secret=SECRET):
    if secret is None:
        monkeypatch.delenv("RESEND_WEBHOOK_SECRET", raising=False)
    else:
        monkeypatch.setenv("RESEND_WEBHOOK_SECRET", secret)
    app = FastAPI()
    app.include_router(rw.build_router())
    return TestClient(app)


def test_verify_ok_and_multiple_signatures():
    ts = str(int(time.time()))
    body = b'{"type":"email.sent"}'
    good = sign("msg_1", ts, body)
    assert rw.verify_signature(SECRET, "msg_1", ts, good, body)
    assert rw.verify_signature(SECRET, "msg_1", ts, "v1,AAAA " + good, body)


def test_verify_rejects_tamper_stale_wrongkey():
    ts = str(int(time.time()))
    body = b'{"type":"email.sent"}'
    assert not rw.verify_signature(SECRET, "msg_1", ts, sign("msg_1", ts, body), b'{"type":"x"}')
    assert not rw.verify_signature(SECRET, "msg_2", ts, sign("msg_1", ts, body), body)
    old = str(int(time.time()) - 600)
    assert not rw.verify_signature(SECRET, "msg_1", old, sign("msg_1", old, body), body)
    assert not rw.verify_signature(SECRET, "msg_1", ts, sign("msg_1", ts, body, key=b"other"), body)
    assert not rw.verify_signature(SECRET, "", ts, "", body)


def test_mask_email():
    assert rw.mask_email("delivered@resend.dev") == "d***@resend.dev"
    assert rw.mask_email(None) == "?"


def test_endpoint(monkeypatch):
    c = client(monkeypatch)
    body = json.dumps({"type": "email.delivered", "created_at": "2026-10-24T00:00:00Z",
                       "data": {"email_id": "e1", "to": ["a@example.com"]}}).encode()
    ts = str(int(time.time()))
    r = c.post("/api/webhooks/resend", content=body,
               headers={"svix-id": "m1", "svix-timestamp": ts, "svix-signature": sign("m1", ts, body)})
    assert r.status_code == 200
    assert c.post("/api/webhooks/resend", content=body).status_code == 401


def test_endpoint_not_configured(monkeypatch):
    assert client(monkeypatch, None).post("/api/webhooks/resend", content=b"{}").status_code == 503
