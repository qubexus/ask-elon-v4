"""Cross-user data isolation, sign-in safety and account deletion (see backend/security.py, account_deletion.py).

User A = "Piotr" (owner of the data), user B = "Kowalski" (attacker with a valid account of his own).
Every ID-based route is tried by B against A's resources: expected 404/403/empty, and A's data unchanged.
"""
import glob
import hashlib
import json
import os
import time
from pathlib import Path

import jwt
import pytest
import requests  # noqa: F401  (only for type hints of responses)

import security

A_EMAIL, B_EMAIL = "piotr-test@example.com", "kowalski-test@example.com"
PW = "IsoTest-12345!"
OUTBOX = os.environ["MAIL_OUTBOX_DIR"]
UPLOADS = Path(os.environ["UPLOAD_DIR"])


def code_for(email, kind="verify"):
    for _ in range(40):
        for f in sorted(glob.glob(os.path.join(OUTBOX, "*.json")), reverse=True):
            try:
                m = json.load(open(f))
            except (ValueError, OSError):
                continue
            if m["to"] == email and m["kind"] == kind:
                return m["code"]
        time.sleep(0.1)
    raise AssertionError(f"no {kind} code for {email}")


def png():
    import struct, zlib
    def ch(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    raw = b"".join(b"\x00" + b"\xcc\x55\x00" * 40 for _ in range(40))
    return b"\x89PNG\r\n\x1a\n" + ch(b"IHDR", struct.pack(">IIBBBBB", 40, 40, 8, 2, 0, 0, 0)) + ch(b"IDAT", zlib.compress(raw)) + ch(b"IEND", b"")


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


def register_verified(c, email, name="Test"):
    r = c.post("/api/auth/register", json={"name": name, "email": email, "password": PW, "locale": "pl"})
    assert r.status_code == 200, r.text
    assert r.json()["verification_required"] and "session_token" not in r.json()
    v = c.post("/api/auth/verify-email", json={"email": email, "code": code_for(email)})
    assert v.status_code == 200, v.text
    return v.json()["session_token"], v.json()["user"]


@pytest.fixture(scope="session")
def world(app_client, mdb, monkeypatch_session):
    import server
    c = app_client

    async def fake_synth(chunks, style):
        return b"ID3fake-audio", "audio/mpeg", "mp3"
    monkeypatch_session.setattr(server.ai, "synthesize", fake_synth)
    monkeypatch_session.setattr(server.ai, "ai_configured", lambda: True)

    async def no_ai(*a, **k):
        raise server.ai.AINotConfigured()
    monkeypatch_session.setattr(server.ai, "generate", no_ai)

    ta, ua = register_verified(c, A_EMAIL, "Piotr Test")
    tb, ub = register_verified(c, B_EMAIL, "Jan Kowalski")
    case = c.post("/api/cases", headers=H(ta), json={"title": "Piotr secret case", "description": "tajne"}).json()
    note = c.post("/api/notes", headers=H(ta), json={"title": "Piotr note", "content": "tajne"}).json()
    letter = c.post("/api/letters", headers=H(ta), json={"template_id": "t1", "title": "Piotr letter"}).json()
    doc = c.post("/api/documents", headers=H(ta), files={"file": ("umowa.png", png(), "image/png")}).json()
    bdoc = c.post("/api/documents", headers=H(tb), files={"file": ("b.png", png(), "image/png")}).json()
    now = server.now()
    for tid in ("main", case["case_id"]):
        mdb.messages.insert_one({"message_id": f"msg_a_{tid[-6:]}", "user_id": ua["user_id"], "thread_id": tid,
                                 "role": "assistant", "text": f"Piotr secret reply in {tid}.", "created_at": now})
    mdb.messages.insert_one({"message_id": "msg_b_main", "user_id": ub["user_id"], "thread_id": "main",
                             "role": "assistant", "text": "Kowalski own reply.", "created_at": now})
    tts = c.post("/api/tts", headers=H(ta), json={"message_id": "msg_a_main"}).json()
    post = c.post("/api/forum/posts", headers=H(ta), json={"title": "Pytanie Piotra", "body": "Treść"}).json()
    c.post(f"/api/forum/posts/{post['post_id']}/comments", headers=H(ta), json={"body": "komentarz Piotra"})
    return dict(c=c, ta=ta, tb=tb, ua=ua, ub=ub, case=case, note=note, letter=letter, doc=doc, bdoc=bdoc, tts=tts, post=post)


@pytest.fixture(scope="session")
def monkeypatch_session():
    mp = pytest.MonkeyPatch()
    yield mp
    mp.undo()


def snapshot(mdb, uid):
    out = {}
    for coll in ("cases", "notes", "letters", "documents", "messages"):
        out[coll] = sorted((json.dumps({k: v for k, v in d.items() if k not in ("_id",)}, default=str, sort_keys=True)
                            for d in mdb[coll].find({"user_id": uid})))
    return out


# ---------------------------------------------------------------- B attacks every ID-based route of A
def attacks(w):
    case, note, letter, doc = w["case"]["case_id"], w["note"]["note_id"], w["letter"]["letter_id"], w["doc"]["doc_id"]
    return [
        # (label, method, path, json, allowed statuses, check on body)
        ("case detail", "GET", f"/api/cases/{case}", None, {404}, None),
        ("case patch", "PATCH", f"/api/cases/{case}", {"status": "resolved"}, {404}, None),
        ("case thread messages", "GET", f"/api/chat/messages?thread_id={case}", None, {200}, lambda j: j == []),
        ("main chat messages", "GET", "/api/chat/messages", None, {200}, lambda j: all("Piotr" not in m["text"] for m in j)),
        ("clear A's case thread", "DELETE", f"/api/chat/messages?thread_id={case}", None, {200}, None),
        ("case from A's thread", "POST", "/api/cases/from-thread", {"thread_id": case}, {400}, None),
        ("tts on A's message", "POST", "/api/tts", {"message_id": "msg_a_main"}, {404}, None),
        ("note update", "PUT", f"/api/notes/{note}", {"title": "hack"}, {404}, None),
        ("note delete", "DELETE", f"/api/notes/{note}", None, {404}, None),
        ("letter patch", "PATCH", f"/api/letters/{letter}", {"status": "paid"}, {404}, None),
        ("letter delete", "DELETE", f"/api/letters/{letter}", None, {404}, None),
        ("document detail", "GET", f"/api/documents/{doc}", None, {404}, None),
        ("document link", "GET", f"/api/documents/{doc}/link?kind=file", None, {404}, None),
        ("document thumb link", "GET", f"/api/documents/{doc}/link?kind=thumb", None, {404}, None),
        ("document file (header)", "GET", f"/api/documents/{doc}/file", None, {404}, None),
        ("document thumb (header)", "GET", f"/api/documents/{doc}/thumb", None, {404}, None),
        ("document reprocess", "POST", f"/api/documents/{doc}/reprocess", None, {404}, None),
        ("document audit", "POST", f"/api/documents/{doc}/audit", None, {400, 404}, None),
        ("document delete", "DELETE", f"/api/documents/{doc}", None, {404}, None),
        ("cases list", "GET", "/api/cases", None, {200}, lambda j: all(x["case_id"] != case for x in j)),
        ("notes list", "GET", "/api/notes", None, {200}, lambda j: j == []),
        ("letters list", "GET", "/api/letters", None, {200}, lambda j: j == []),
        ("documents list", "GET", "/api/documents", None, {200}, lambda j: all(x["doc_id"] != doc for x in j)),
        ("admin users", "GET", "/api/admin/users", None, {403}, None),
        ("admin delete A", "DELETE", f"/api/admin/users/{w['ua']['user_id']}", None, {403}, None),
    ]


def test_b_cannot_read_or_change_a(world, mdb):
    w, c = world, world["c"]
    before = snapshot(mdb, w["ua"]["user_id"])
    failures = []
    for label, method, path, body, ok, check in attacks(w):
        r = c.request(method, path, headers=H(w["tb"]), json=body)
        if r.status_code not in ok or (check and not check(r.json())):
            failures.append(f"{label}: {r.status_code} {r.text[:120]}")
    assert not failures, failures
    assert snapshot(mdb, w["ua"]["user_id"]) == before, "A's data changed after B's attempts"
    # A still has full access to all of it
    assert c.get(f"/api/cases/{w['case']['case_id']}", headers=H(w["ta"])).status_code == 200
    assert c.get(f"/api/documents/{w['doc']['doc_id']}/file", headers=H(w["ta"])).status_code == 200
    assert len(c.get(f"/api/chat/messages?thread_id={w['case']['case_id']}", headers=H(w["ta"])).json()) == 1


def test_signed_document_links(world):
    import server
    w, c = world, world["c"]
    doc = w["doc"]
    lst = c.get("/api/documents", headers=H(w["ta"])).json()
    thumb = next(d for d in lst if d["doc_id"] == doc["doc_id"])["thumb_url"]
    assert thumb and "token=" not in thumb and "sig=" in thumb
    link = c.get(f"/api/documents/{doc['doc_id']}/link?kind=file", headers=H(w["ta"])).json()["url"]
    assert "token" not in link
    assert c.get(f"/api{link}").status_code == 200                       # opens without a header (new tab)
    assert c.get(f"/api{thumb}").status_code == 200
    assert c.get(f"/api{link}", headers=H(w["tb"])).status_code == 404  # B re-using A's link with his session
    assert c.get(f"/api{link.replace('/file?', '/thumb?')}").status_code == 404   # signature is per kind
    blink = c.get(f"/api/documents/{w['bdoc']['doc_id']}/link?kind=file", headers=H(w["tb"])).json()["url"]
    forged = blink.replace(w["bdoc"]["doc_id"], doc["doc_id"])        # B's own valid signature on A's id
    assert c.get(f"/api{forged}").status_code == 404
    old = security.link_params(server.JWT_SECRET, "doc-file", doc["doc_id"], w["ua"]["user_id"], 300, now=time.time() - 600)
    assert c.get(f"/api/documents/{doc['doc_id']}/file?{old}").status_code == 404   # expired
    far = security.link_params("not-the-server-secret", "doc-file", doc["doc_id"], w["ua"]["user_id"], 300)
    assert c.get(f"/api/documents/{doc['doc_id']}/file?{far}").status_code == 404   # wrong key
    assert c.get(f"/api/documents/{doc['doc_id']}/file?token={w['ta']}").status_code == 401  # ?token= is gone


def test_tts_audio_needs_own_signed_link(world, mdb):
    w, c = world, world["c"]
    url = w["tts"]["url"]
    assert "sig=" in url and "m=msg_a_main" in url
    ok = c.get(url)
    assert ok.status_code == 200 and ok.headers["cache-control"].startswith("private")
    assert c.get(url.split("?")[0]).status_code == 404                     # no login-free access by hash
    assert c.get(url, headers=H(w["tb"])).status_code == 404               # B with A's link
    assert c.get(url.replace("m=msg_a_main", "m=msg_b_main")).status_code == 404
    # B asks for audio of his own message with identical text? still only via his own message id
    rb = c.post("/api/tts", headers=H(w["tb"]), json={"message_id": "msg_b_main"}).json()["url"]
    assert c.get(rb).status_code == 200 and "m=msg_b_main" in rb


def test_forum_hides_account_ids(world):
    w, c = world, world["c"]
    posts = c.get("/api/forum/posts", headers=H(w["tb"])).json()
    mine = next(p for p in posts if p["post_id"] == w["post"]["post_id"])
    assert "user_id" not in mine and mine["is_mine"] is False and mine["author"] == "Piotr Test"
    det = c.get(f"/api/forum/posts/{w['post']['post_id']}", headers=H(w["tb"])).json()
    assert "user_id" not in det and all("user_id" not in cm for cm in det["comments"])
    assert all(cm["is_mine"] is False for cm in det["comments"])
    assert c.get(f"/api/forum/posts/{w['post']['post_id']}", headers=H(w["ta"])).json()["is_mine"] is True
    assert "user_id" not in w["post"] and w["post"]["is_mine"] is True


PRIVATE_ROUTES = [
    ("GET", "/api/auth/me"), ("PUT", "/api/profile"), ("GET", "/api/cases"), ("POST", "/api/cases"),
    ("GET", "/api/cases/x"), ("PATCH", "/api/cases/x"), ("POST", "/api/cases/from-thread"),
    ("GET", "/api/chat/messages"), ("DELETE", "/api/chat/messages"), ("GET", "/api/chat/usage"),
    ("POST", "/api/chat/stream"), ("POST", "/api/tts"), ("GET", "/api/notes"), ("POST", "/api/notes"),
    ("PUT", "/api/notes/x"), ("DELETE", "/api/notes/x"), ("GET", "/api/letters"), ("POST", "/api/letters"),
    ("PATCH", "/api/letters/x"), ("DELETE", "/api/letters/x"), ("GET", "/api/documents"),
    ("GET", "/api/documents/x"), ("GET", "/api/documents/x/link"), ("GET", "/api/documents/x/file"),
    ("GET", "/api/documents/x/thumb"), ("DELETE", "/api/documents/x"), ("POST", "/api/documents/x/reprocess"),
    ("POST", "/api/documents/x/audit"), ("GET", "/api/forum/posts"), ("GET", "/api/forum/posts/x"),
    ("GET", "/api/messages"), ("GET", "/api/messages/unread-count"), ("GET", "/api/payments/plans"),
    ("POST", "/api/account/delete"), ("GET", "/api/admin/users"), ("GET", "/api/admin/stats"),
    ("GET", "/api/lookup/config"), ("GET", "/api/broadcasts/pending"),
]


def test_private_routes_need_login(world):
    c = world["c"]
    bad = []
    for method, path in PRIVATE_ROUTES:
        for headers in ({}, {"Authorization": "Bearer not-a-jwt"}):
            r = c.request(method, path, headers=headers, json={})
            # 422 = request body rejected by validation before any code runs (no data involved); reads must be 401
            if r.status_code == 401 or (r.status_code == 422 and method in ("POST", "PUT", "PATCH")
                                        and isinstance(r.json().get("detail"), list)):
                continue
            if True:
                bad.append(f"{method} {path} {headers and 'bad-token' or 'no-token'} -> {r.status_code}")
    assert not bad, bad


def test_profile_ignores_privileged_fields(world):
    w, c = world, world["c"]
    r = c.put("/api/profile", headers=H(w["tb"]), json={"role": "admin", "is_member": True, "user_id": w["ua"]["user_id"],
                                                       "email": A_EMAIL, "email_verified": True, "name": "Jan Kowalski"})
    assert r.status_code == 200
    me = c.get("/api/auth/me", headers=H(w["tb"])).json()
    assert me["role"] == "user" and not me.get("is_member") and me["user_id"] == w["ub"]["user_id"] and me["email"] == B_EMAIL


# ---------------------------------------------------------------- e-mail verification + Google join
def test_unverified_account_cannot_log_in_and_codes_are_limited(app_client, mdb):
    c, email = app_client, "unverified-test@example.com"
    assert c.post("/api/auth/register", json={"name": "U", "email": email, "password": PW}).status_code == 200
    r = c.post("/api/auth/login", json={"email": email, "password": PW})
    assert r.status_code == 403 and r.json()["code"] == "email_unverified"
    assert c.post("/api/auth/login", json={"email": email, "password": "wrong-password"}).status_code == 401  # no hint
    first = code_for(email)
    assert c.post("/api/auth/resend-verification", json={"email": email}).status_code == 200
    time.sleep(0.3)
    second = code_for(email)
    if first != second:
        assert c.post("/api/auth/verify-email", json={"email": email, "code": first}).status_code == 400  # old code dead
    row = mdb.email_verifications.find_one({})
    assert row and row["code_hash"] != hashlib.sha256(f"{email}:{second}".encode()).hexdigest()  # HMAC, not plain hash
    bad = "000000" if second != "000000" else "111111"
    for _ in range(5):
        assert c.post("/api/auth/verify-email", json={"email": email, "code": bad}).json()["code"] == "code_invalid"
    assert c.post("/api/auth/verify-email", json={"email": email, "code": second}).status_code == 400  # burned after 5 tries
    unknown = c.post("/api/auth/resend-verification", json={"email": "nobody-test@example.com"})
    assert unknown.status_code == 200  # same answer for unknown addresses
    assert mdb.users.find_one({"email": email})["email_verified"] is False


def test_google_takes_over_unverified_password_account(app_client, mdb, monkeypatch):
    import server
    c, email = app_client, "victim-test@example.com"
    # the "attacker" registers the victim's address with his own password and never confirms it
    assert c.post("/api/auth/register", json={"name": "Attacker", "email": email, "password": "attacker-pass-1"}).status_code == 200
    monkeypatch.setattr(server, "verify_google_id_token", lambda tok: {
        "iss": "https://accounts.google.com", "email": email, "email_verified": True, "name": "Real Victim", "sub": "g-123"})
    g = c.post("/api/auth/google", json={"id_token": "fake"})
    assert g.status_code == 200, g.text
    u = mdb.users.find_one({"email": email})
    assert u["email_verified"] is True and u["email_verified_via"] == "google" and "password_hash" not in u
    assert u["name"] == "Real Victim"
    assert c.post("/api/auth/login", json={"email": email, "password": "attacker-pass-1"}).status_code == 401
    assert mdb.email_verifications.count_documents({"user_id": u["user_id"]}) == 0
    assert c.get("/api/auth/me", headers=H(g.json()["session_token"])).json()["has_password"] is False


def test_google_on_verified_account_keeps_working(world, mdb, monkeypatch):
    import server
    c = world["c"]
    monkeypatch.setattr(server, "verify_google_id_token", lambda tok: {
        "iss": "accounts.google.com", "email": B_EMAIL, "email_verified": True, "name": "X", "sub": "g-b"})
    g = c.post("/api/auth/google", json={"id_token": "fake"})
    assert g.status_code == 200 and g.json()["user"]["user_id"] == world["ub"]["user_id"]
    assert mdb.users.find_one({"email": B_EMAIL}).get("password_hash")  # password login still possible
    assert c.post("/api/auth/login", json={"email": B_EMAIL, "password": PW}).status_code == 200


def test_reset_proves_address_and_uses_hmac(app_client, mdb):
    c, email = app_client, "squatted-test@example.com"
    c.post("/api/auth/register", json={"name": "Squatter", "email": email, "password": "squatter-pass-1"})
    assert c.post("/api/auth/request-reset", json={"email": email}).status_code == 200
    code = code_for(email, "reset")
    row = mdb.password_resets.find_one({"user_id": mdb.users.find_one({"email": email})["user_id"]})
    assert row["token_hash"] != hashlib.sha256(f"{email}:{code}".encode()).hexdigest()
    r = c.post("/api/auth/reset-password", json={"email": email, "code": code, "new_password": "owner-pass-123"})
    assert r.status_code == 200 and r.json()["user"]["email_verified"] is True
    assert c.post("/api/auth/login", json={"email": email, "password": "squatter-pass-1"}).status_code == 401


# ---------------------------------------------------------------- sessions stored as hashes + migrations
def test_sessions_are_hashed_and_legacy_sessions_migrate(world, mdb):
    import server
    c = world["c"]
    assert mdb.user_sessions.count_documents({"session_token": {"$exists": True}}) == 0
    assert mdb.user_sessions.find_one({"token_hash": security.token_hash(world["ta"])})
    # a session written by the old code (raw token) and a pre-verification account (no email_verified field)
    uid = "user_legacy00001"
    mdb.users.insert_one({"user_id": uid, "email": "legacy-test@example.com", "name": "Legacy", "role": "user",
                          "account_id": "LE261099999T", "created_at": server.now()})
    exp = server.now() + server.timedelta(days=7)
    tok = jwt.encode({"sub": uid, "sid": "legacy", "iss": "union-elon", "aud": "union-elon-app", "iat": server.now(),
                      "exp": exp}, server.JWT_SECRET, algorithm="HS256")
    mdb.user_sessions.insert_one({"session_token": tok, "sid": "legacy", "user_id": uid, "expires_at": exp})
    res = c.portal.call(server.migrate_security, server.db)
    assert res == {"grandfathered": 1, "sessions_hashed": 1}
    assert c.get("/api/auth/me", headers=H(tok)).status_code == 200       # nobody is logged out
    assert mdb.users.find_one({"user_id": uid})["email_verified"] is True  # nobody is locked out
    assert mdb.user_sessions.count_documents({"session_token": {"$exists": True}}) == 0
    assert c.portal.call(server.migrate_security, server.db) == {"grandfathered": 0, "sessions_hashed": 0}  # idempotent
    assert c.post("/api/auth/logout", headers=H(tok)).status_code == 200
    assert c.get("/api/auth/me", headers=H(tok)).status_code == 401


# ---------------------------------------------------------------- account deletion
def _full_account(c, mdb, email, name, other_post):
    import server
    tok, u = register_verified(c, email, name)
    uid = u["user_id"]
    c.post("/api/cases", headers=H(tok), json={"title": "x", "description": "y"})
    c.post("/api/notes", headers=H(tok), json={"title": "n"})
    c.post("/api/letters", headers=H(tok), json={"template_id": "t", "title": "l"})
    c.post("/api/documents", headers=H(tok), files={"file": ("d.png", png(), "image/png")})
    mdb.messages.insert_one({"message_id": f"msg_{uid}", "user_id": uid, "thread_id": "main", "role": "assistant",
                             "text": f"Reply for {name}.", "created_at": server.now()})
    c.post("/api/tts", headers=H(tok), json={"message_id": f"msg_{uid}"})
    p = c.post("/api/forum/posts", headers=H(tok), json={"title": "Post " + name, "body": "body"}).json()
    c.post(f"/api/forum/posts/{other_post}/comments", headers=H(tok), json={"body": "comment"})
    c.post(f"/api/forum/posts/{other_post}/like", headers=H(tok))
    c.post("/api/contact", headers=H(tok), json={"subject": "s", "body": "b"})
    mdb.admin_messages.insert_one({"id": f"amsg_{uid}", "target": "user", "user_id": uid, "title": "t", "body": "b",
                                   "created_at": server.now()})
    mdb.subscriptions.insert_one({"subscription_id": f"I-{uid}", "user_id": uid, "amount": "9.99", "currency": "GBP",
                                  "status": "CANCELLED", "created_at": server.now()})
    chat_pdf = f"union-elon/chat-docs/{uid}/abc.pdf"
    (UPLOADS / chat_pdf).parent.mkdir(parents=True, exist_ok=True)
    (UPLOADS / chat_pdf).write_bytes(b"%PDF-1.4 test")
    mdb.chat_documents.insert_one({"chat_doc_id": f"cd_{uid}", "user_id": uid, "pdf_path": chat_pdf, "thumb_path": None})
    return tok, uid, p["post_id"]


def _assert_gone(mdb, uid, email):
    for coll in ("users", "user_sessions", "cases", "notes", "letters", "documents", "messages", "chat_documents",
                 "contact_messages", "user_message_reads", "password_resets", "email_verifications", "forum_posts",
                 "forum_comments", "subscriptions"):
        assert mdb[coll].count_documents({"user_id": uid}) == 0, coll
    assert mdb.admin_messages.count_documents({"user_id": uid}) == 0
    assert mdb.forum_posts.count_documents({"likes": uid}) == 0
    assert mdb.users.count_documents({"email": email}) == 0
    assert not list(UPLOADS.glob(f"union-elon/*/{uid}/*")) and not (UPLOADS / "union-elon/uploads" / uid).exists()


def test_self_delete_removes_everything(world, mdb):
    import server
    c = world["c"]
    tok, uid, post = _full_account(c, mdb, "delete-me-test@example.com", "Do Usuniecia", world["post"]["post_id"])
    tts_keys = [m["tts_key"] for m in mdb.messages.find({"user_id": uid, "tts_key": {"$exists": True}})]
    assert tts_keys and list(UPLOADS.glob(f"union-elon/uploads/{uid}/*"))
    before_a = snapshot(mdb, world["ua"]["user_id"])
    assert c.post("/api/account/delete", headers=H(tok), json={"confirm": False, "password": PW}).json()["code"] == "confirm_required"
    assert c.post("/api/account/delete", headers=H(tok), json={"confirm": True, "password": "nope"}).json()["code"] == "wrong_password"
    r = c.post("/api/account/delete", headers=H(tok), json={"confirm": True, "password": PW})
    assert r.status_code == 200, r.text
    _assert_gone(mdb, uid, "delete-me-test@example.com")
    assert mdb.tts_cache.count_documents({"key": {"$in": tts_keys}}) == 0
    fp = mdb.forum_posts.find_one({"post_id": post})
    assert fp["author"] == "Usunięty użytkownik" and fp["user_id"] == "deleted" and fp["author_deleted"] is True
    assert mdb.forum_comments.find_one({"author": "Usunięty użytkownik", "post_id": world["post"]["post_id"]})
    sub = mdb.subscriptions.find_one({"subscription_id": f"I-{uid}"})
    assert sub and sub["user_id"] == "deleted" and sub["amount"] == "9.99"   # minimal billing record, unlinked
    assert c.get("/api/auth/me", headers=H(tok)).status_code == 401
    assert snapshot(mdb, world["ua"]["user_id"]) == before_a                   # nobody else touched
    again = c.portal.call(server.delete_account, uid)                          # idempotent
    assert all(v == 0 for v in again.values()), again


def test_admin_delete_removes_everything_and_admin_is_protected(world, mdb):
    c = world["c"]
    tok, uid, _ = _full_account(c, mdb, "admin-deletes-test@example.com", "Admin Target", world["post"]["post_id"])
    ta, _ = register_verified(c, "admin-test@example.com", "Admin")
    r = c.delete(f"/api/admin/users/{uid}", headers=H(ta))
    assert r.status_code == 200 and r.json()["deleted"]["users"] == 1
    _assert_gone(mdb, uid, "admin-deletes-test@example.com")
    assert c.delete(f"/api/admin/users/{uid}", headers=H(ta)).status_code == 404
    r = c.post("/api/account/delete", headers=H(ta), json={"confirm": True, "password": PW})
    assert r.status_code == 400 and r.json()["code"] == "admin_protected"
