"""Unit tests: chat documents (block parsing, PDF, owner-only API, signed links) and the storage quota.
In-memory fake collections, files in a temp dir – no real database, no network, no AI.

Run:  cd backend && python -m pytest tests_unit -n 0
"""
import asyncio
import itertools
import os
import tempfile
import time
from datetime import datetime, timedelta, timezone

os.environ["DB_NAME"] = "ask_elon_unit_chat_docs"  # never the live DB
os.environ.setdefault("JWT_SECRET", "unit-test-secret-unit-test-secret-1234")
os.environ["STORAGE_BACKEND"] = "local"
os.environ["UPLOAD_DIR"] = tempfile.mkdtemp(prefix="ae-unit-cdocs-")
os.environ.pop("USER_STORAGE_QUOTA_BYTES", None)

import pymupdf  # noqa: E402
import pytest  # noqa: E402
from fastapi import FastAPI, HTTPException, Request  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import chat_documents as cd  # noqa: E402
import storage  # noqa: E402
import storage_quota as sq  # noqa: E402

storage.init_storage()
SECRET = "unit-secret"


# ---------- tiny fake of the motor API we use ----------
def _ok(v, cond):
    if isinstance(cond, dict):
        for op, x in cond.items():
            if op == "$ne" and v == x:
                return False
            if op == "$in" and v not in x:
                return False
            if op == "$gte" and (v is None or v < x):
                return False
        return True
    return v == cond


def _match(d, q):
    return all(_ok(d.get(k), c) for k, c in q.items())


class Cur:
    def __init__(self, docs):
        self.docs = docs

    def sort(self, key, direction=1):
        self.docs.sort(key=lambda d: d.get(key), reverse=direction < 0)
        return self

    def skip(self, n):
        self.docs = self.docs[n:]
        return self

    def limit(self, n):
        self.docs = self.docs[:n]
        return self

    async def to_list(self, n):
        return self.docs[:n]


class Res:
    def __init__(self, n=0):
        self.matched_count = n


class Coll:
    def __init__(self):
        self.docs = []

    @staticmethod
    def _proj(d, proj):
        proj = proj or {}
        if any(v == 1 for v in proj.values()):
            return {k: v for k, v in d.items() if proj.get(k) == 1}
        return {k: v for k, v in d.items() if proj.get(k, 1) != 0}

    def find(self, q, proj=None):
        return Cur([self._proj(d, proj) for d in self.docs if _match(d, q)])

    async def find_one(self, q, proj=None):
        return next((self._proj(d, proj) for d in self.docs if _match(d, q)), None)

    async def count_documents(self, q):
        return sum(_match(d, q) for d in self.docs)

    async def insert_one(self, doc):
        self.docs.append(dict(doc))

    async def update_one(self, q, upd):
        for d in self.docs:
            if _match(d, q):
                d.update(upd["$set"])
                return Res(1)
        return Res()

    def aggregate(self, pipeline):
        q = pipeline[0]["$match"]
        total = sum(int(d.get("size") or 0) for d in self.docs if _match(d, q))
        return Cur([{"_id": None, "total": total}] if any(_match(d, q) for d in self.docs) else [])

    async def create_index(self, *a, **k):
        pass


class DB:
    def __init__(self):
        self.chat_documents, self.documents, self.cases = Coll(), Coll(), Coll()


ids = itertools.count()
NOW = datetime(2026, 10, 23, 21, 0, tzinfo=timezone.utc)
USERS = {"user_a": {"user_id": "user_a", "name": "Anna Kowalska-Łęcka", "address": "12 Dock Road, Tilbury, RM18 7AA",
                    "email": "anna@example.com", "employer": "Jigsaw Food Ltd", "hr_email": "hr@jigsaw.example", "locale": "pl"},
         "user_b": {"user_id": "user_b", "name": "Bob Test", "locale": "en"}}


async def fake_user(request: Request):
    tok = request.headers.get("Authorization", "")
    if not tok.startswith("Bearer ") or tok[7:] not in USERS:
        raise HTTPException(401, "Not authenticated")
    return USERS[tok[7:]]


BLOCK = """Rozumiem. Przygotowałem pismo – sprawdź liczbę godzin.

[[DOKUMENT]]
typ: hr_letter
tytuł: Pismo do HR – niewypłacone nadgodziny
adresat: HR Department, Jigsaw Food Ltd
temat: Unpaid overtime – request for payment
język: en
---
Dear HR Team,

I worked [12] hours of overtime in September 2026 that are missing from my payslip. Please pay them in my next pay.
<script>alert(1)</script>

Yours sincerely,
Anna Kowalska-Łęcka
---tłumaczenie---
Szanowni Państwo, przepracowałam [12] nadgodzin...
[[/DOKUMENT]]

Chcesz dopisać wyliczenie kwoty?"""


@pytest.fixture
def env(monkeypatch):
    monkeypatch.delenv("USER_STORAGE_QUOTA_BYTES", raising=False)
    db = DB()
    svc = cd.Service(db, SECRET, lambda p: f"{p}_{next(ids)}", lambda: NOW, "unit")
    app = FastAPI()
    app.add_exception_handler(sq.StorageFull, sq.storage_full_handler)
    app.include_router(cd.build_router(svc, fake_user, lambda *a: None))
    return db, svc, TestClient(app)


A = {"Authorization": "Bearer user_a"}
B = {"Authorization": "Bearer user_b"}


def make(svc, user="user_a", thread="main"):
    _, spec = cd.split_document(BLOCK)
    return asyncio.run(svc.create(USERS[user], spec, thread, "msg_1"))


# ---------- parsing ----------
def test_split_extracts_block_and_keeps_message():
    rest, spec = cd.split_document(BLOCK)
    assert "[[DOKUMENT" not in rest and "Dear HR" not in rest
    assert rest.startswith("Rozumiem.") and rest.endswith("kwoty?")
    assert spec["type"] == "hr_letter" and spec["language"] == "en"
    assert spec["title"] == "Pismo do HR – niewypłacone nadgodziny"
    assert spec["subject"].startswith("Unpaid overtime")
    assert spec["body"].startswith("Dear HR Team") and spec["body"].endswith("Łęcka")
    assert spec["translation"].startswith("Szanowni")


def test_no_block_and_too_short_block():
    assert cd.split_document("Zwykła odpowiedź") == ("Zwykła odpowiedź", None)
    rest, spec = cd.split_document("Hej\n[[DOKUMENT]]\ntyp: other\n---\nkrótko\n[[/DOKUMENT]]")
    assert rest == "Hej" and spec is None


def test_unclosed_block_and_unknown_values_and_caps():
    rest, spec = cd.split_document("Tekst\n[[DOKUMENT]]\ntyp: evil_type\njezyk: xx\ntytul: " + "T" * 500 + "\n---\n" + "x" * 20000)
    assert rest == "Tekst"
    assert spec["type"] == "other" and spec["language"] == "en"
    assert len(spec["title"]) == cd.TITLE_MAX and len(spec["body"]) == cd.BODY_MAX


def test_block_without_separator_and_control_chars():
    _, spec = cd.split_document("[[DOKUMENT]]\ntyp: grievance\ntemat: Grievance\nDear Sir,\x00\u202e I raise a formal grievance about my shifts being cut without notice.\n[[/DOKUMENT]]")
    assert spec["type"] == "grievance" and spec["subject"] == "Grievance"
    assert "\x00" not in spec["body"] and "\u202e" not in spec["body"] and spec["body"].startswith("Dear Sir")


def test_nested_markers_cannot_survive_in_body():
    _, spec = cd.split_document("[[DOKUMENT]]\ntyp: other\n---\nDear HR, text text text text text text text [[DOKUMENT]] more text here.\n[[/DOKUMENT]]")
    assert "[[" not in spec["body"]


# ---------- PDF ----------
def test_pdf_valid_contains_name_and_escapes_markup(env):
    _, svc, _ = env
    d = make(svc)
    pdf, _ = storage.get_object(d["pdf_path"])
    assert pdf.startswith(b"%PDF")
    text = pymupdf.open("pdf", pdf)[0].get_text()
    assert "Anna Kowalska-Łęcka" in text and "hr@jigsaw.example" in text
    assert "<script>alert(1)</script>" in text  # rendered as literal text, not markup
    assert "not legal advice" in text and "23 October 2026" in text
    thumb, _ = storage.get_object(d["thumb_path"])
    assert thumb.startswith(b"\x89PNG")
    assert d["size"] == len(pdf) and d["pages"] == 1


def test_long_letter_paginates():
    _, spec = cd.split_document(BLOCK)
    spec["body"] = "\n\n".join(["Paragraph %d " % i + "word " * 60 for i in range(40)])[: cd.BODY_MAX]
    doc = {**spec, "snapshot": cd.build_snapshot(USERS["user_b"], spec, NOW), "created_at": NOW}
    pdf, _, pages = cd.render_pdf(doc)
    assert pages >= 2 and pymupdf.open("pdf", pdf).page_count == pages


def test_filename_is_ascii():
    assert cd.filename_for({"title": "Pismo do HR – niewypłacone nadgodziny", "created_at": NOW}) == \
        "ask-elon-pismo-do-hr-niewyplacone-nadgodziny-2026-10-23.pdf"


# ---------- API: owner only ----------
def test_requires_auth(env):
    _, _, c = env
    assert c.get("/api/chat-documents").status_code == 401
    assert c.get("/api/chat-documents/x/pdf").status_code == 401


def test_owner_access_and_other_user_404(env):
    _, svc, c = env
    d = make(svc)
    did = d["chat_doc_id"]
    r = c.get("/api/chat-documents", headers=A).json()
    assert r["total"] == 1 and r["items"][0]["chat_doc_id"] == did and "body" not in r["items"][0]
    assert "user_id" not in r["items"][0] and "pdf_path" not in r["items"][0]
    full = c.get(f"/api/chat-documents/{did}", headers=A).json()
    assert full["body"].startswith("Dear HR") and full["snapshot"]["hr_email"] == "hr@jigsaw.example"
    pdf = c.get(f"/api/chat-documents/{did}/pdf", headers=A)
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF") and pdf.headers["content-type"] == "application/pdf"
    assert c.get(f"/api/chat-documents/{did}/pdf?dl=1", headers=A).headers["content-disposition"].startswith("attachment")
    # another user sees nothing
    assert c.get("/api/chat-documents", headers=B).json()["total"] == 0
    for path in (f"/api/chat-documents/{did}", f"/api/chat-documents/{did}/pdf", f"/api/chat-documents/{did}/thumb"):
        assert c.get(path, headers=B).status_code == 404
    assert c.put(f"/api/chat-documents/{did}", json={"subject": "x"}, headers=B).status_code == 404
    assert c.delete(f"/api/chat-documents/{did}", headers=B).status_code == 404


def test_signed_links(env):
    _, svc, c = env
    d = make(svc)
    url = cd.public(d, SECRET)["pdf_url"]
    assert c.get("/api" + url).status_code == 200  # no auth header needed for a valid signed link
    assert c.get("/api" + url.replace("sig=", "sig=0")).status_code == 404
    assert c.get("/api" + url.replace("/pdf?", "/thumb?")).status_code == 404  # signature bound to kind
    exp = int(time.time()) - 5
    old = f"/api/chat-documents/{d['chat_doc_id']}/pdf?exp={exp}&sig={cd.sign(SECRET, d['chat_doc_id'], 'pdf', 'user_a', exp)}"
    assert c.get(old).status_code == 404  # expired


def test_edit_and_delete(env):
    _, svc, c = env
    d = make(svc)
    did = d["chat_doc_id"]
    r = c.put(f"/api/chat-documents/{did}", json={"body": "Dear HR,\n\nI worked 14 hours of overtime that are still unpaid. Yours, Anna"}, headers=A)
    assert r.status_code == 200
    pdf = c.get(f"/api/chat-documents/{did}/pdf", headers=A).content
    assert "14 hours" in pymupdf.open("pdf", pdf)[0].get_text()
    assert c.put(f"/api/chat-documents/{did}", json={"body": "short"}, headers=A).status_code == 400
    assert c.delete(f"/api/chat-documents/{did}", headers=A).json() == {"ok": True}
    assert c.get(f"/api/chat-documents/{did}", headers=A).status_code == 404
    assert c.get("/api/chat-documents", headers=A).json()["total"] == 0


def test_pagination_newest_first_and_case_title(env):
    db, svc, c = env
    db.cases.docs.append({"case_id": "case_1", "user_id": "user_a", "title": "Nadgodziny wrzesień"})
    docs = []
    for i in range(5):
        svc.now = lambda i=i: NOW + timedelta(minutes=i)
        docs.append(make(svc, thread="case_1" if i == 4 else "main"))
    p1 = c.get("/api/chat-documents?limit=2", headers=A).json()
    assert p1["total"] == 5 and p1["has_more"] and [x["chat_doc_id"] for x in p1["items"]] == [docs[4]["chat_doc_id"], docs[3]["chat_doc_id"]]
    assert p1["items"][0]["case_id"] == "case_1" and p1["items"][0]["case_title"] == "Nadgodziny wrzesień"
    p3 = c.get("/api/chat-documents?limit=2&offset=4", headers=A).json()
    assert not p3["has_more"] and len(p3["items"]) == 1


def test_enrich_messages_marks_deleted(env):
    db, svc, _ = env
    d = make(svc)
    msgs = [{"message_id": "m", "documents": [cd.card(d)]}, {"message_id": "n", "documents": [{"chat_doc_id": "gone"}]}]
    out = asyncio.run(svc.enrich_messages("user_a", msgs))
    assert out[0]["documents"][0]["thumb_url"].startswith(f"/chat-documents/{d['chat_doc_id']}/thumb?")
    assert out[1]["documents"][0]["deleted"] is True
    assert asyncio.run(svc.enrich_messages("user_b", [{"message_id": "m", "documents": [cd.card(d)]}]))[0]["documents"][0]["deleted"]


# ---------- storage quota ----------
def test_quota_default_and_env(monkeypatch):
    monkeypatch.delenv("USER_STORAGE_QUOTA_BYTES", raising=False)
    assert sq.quota_bytes() == 5 * 1024 ** 3
    monkeypatch.setenv("USER_STORAGE_QUOTA_BYTES", "1000")
    assert sq.quota_bytes() == 1000
    monkeypatch.setenv("USER_STORAGE_QUOTA_BYTES", "nonsense")
    assert sq.quota_bytes() == 5 * 1024 ** 3


def test_quota_summary_thresholds():
    assert sq.summary(0, 1000)["percent"] == 0 and not sq.summary(0, 1000)["warn"]
    assert not sq.summary(799, 1000)["warn"]
    s = sq.summary(800, 1000)
    assert s["warn"] and not s["full"] and s["remaining"] == 200
    assert sq.summary(1000, 1000)["full"] and sq.summary(1500, 1000)["percent"] == 100.0
    g = sq.summary(4 * sq.GIB, 5 * sq.GIB, "pl")
    assert g["warn"] and g["remaining_text"] == "1 GB" and g["limit_text"] == "5 GB"
    assert sq.human(1.5 * sq.GIB, "pl") == "1,5 GB" and sq.human(1.5 * sq.GIB, "en") == "1.5 GB"


def test_quota_counts_both_collections_and_ignores_deleted():
    db = DB()
    db.documents.docs += [{"user_id": "u", "size": 100}, {"user_id": "u", "size": 50, "deleted": True}, {"user_id": "x", "size": 999}]
    db.chat_documents.docs += [{"user_id": "u", "size": 30}]
    assert asyncio.run(sq.used_bytes(db, "u")) == 130


def test_ensure_room_under_at_over(monkeypatch):
    monkeypatch.setenv("USER_STORAGE_QUOTA_BYTES", "1000")
    db, u = DB(), {"user_id": "u", "locale": "pl"}
    db.documents.docs.append({"user_id": "u", "size": 600})
    asyncio.run(sq.ensure_room(db, u, 399))  # under
    asyncio.run(sq.ensure_room(db, u, 400))  # exactly at the limit is allowed
    with pytest.raises(sq.StorageFull) as e:
        asyncio.run(sq.ensure_room(db, u, 401))  # over
    assert "zostało Ci" in e.value.message()
    db.documents.docs.append({"user_id": "u", "size": 400})
    with pytest.raises(sq.StorageFull) as e:
        asyncio.run(sq.ensure_room(db, u, 1))  # full
    assert "limit" in e.value.message() and "bezpieczne" in e.value.message()
    asyncio.run(sq.ensure_room(db, u, 300, replacing=400))  # an edit that shrinks a file is fine even when full
    db.documents.docs[-1]["deleted"] = True  # deleting frees space
    asyncio.run(sq.ensure_room(db, u, 400))


def test_full_storage_blocks_pdf_generation_and_keeps_files(env, monkeypatch):
    db, svc, c = env
    d = make(svc)
    monkeypatch.setenv("USER_STORAGE_QUOTA_BYTES", str(d["size"] + 10))
    with pytest.raises(sq.StorageFull):
        make(svc)
    assert len(db.chat_documents.docs) == 1  # nothing new stored, old one untouched
    assert c.get(f"/api/chat-documents/{d['chat_doc_id']}/pdf", headers=A).status_code == 200
    r = c.put(f"/api/chat-documents/{d['chat_doc_id']}", json={"body": "Dear HR, " + "much longer text " * 200}, headers=A)
    assert r.status_code == 507 and r.json()["code"] == "storage_full"
    assert c.get(f"/api/chat-documents/{d['chat_doc_id']}", headers=A).json()["body"].startswith("Dear HR Team")
