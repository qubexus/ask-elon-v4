"""Backend tests for iteration 4: Profile completeness gating & Documents module."""
import io
import os
import time
import uuid
import pytest
import requests
import devmail  # noqa: E402  (confirms test accounts via the dev e-mail outbox)

BASE = (os.environ.get("TEST_BASE_URL") or "http://localhost:8001").rstrip("/")
API = f"{BASE}/api"

CONTRACT_PDF = "/tmp/contract.pdf"


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


def _register_fresh():
    email = f"test_{uuid.uuid4().hex[:10]}@example.com"
    r = devmail.register(API, json={"name": "T", "email": email, "password": "Passw0rd!"}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["session_token"], email


FULL_PROFILE = {
    "name": "Jan Testowy",
    "address": "1 Main St, London EC1 1AA",
    "phone": "+44 7700 900111",
    "employer": "Testco Ltd",
    "industry": "Logistics & Warehousing",
    "job_title": "Operative",
    "contract_type": "zero_hours",
    "start_date": "2024-02-01",
    "workplace_address": "Unit 2, Tilbury RM18 7AN",
    "hr_email": "hr@testco.co.uk",
}


# ---------------- Profile tests ----------------
class TestProfile:
    def test_profile_complete_true_when_all_fields_set(self):
        tok, _ = _register_fresh()
        r = requests.put(f"{API}/profile", json=FULL_PROFILE, headers=_hdr(tok), timeout=30)
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["profile_complete"] is True
        assert u["employer"] == "Testco Ltd"
        assert u["contract_type"] == "zero_hours"
        # verify via /auth/me
        me = requests.get(f"{API}/auth/me", headers=_hdr(tok), timeout=30).json()
        assert me["profile_complete"] is True

    def test_profile_complete_false_when_missing_one(self):
        tok, _ = _register_fresh()
        partial = {k: v for k, v in FULL_PROFILE.items() if k != "workplace_address"}
        r = requests.put(f"{API}/profile", json=partial, headers=_hdr(tok), timeout=30)
        assert r.status_code == 200, r.text
        assert r.json().get("profile_complete") is False

    def test_profile_invalid_hr_email_returns_400(self):
        tok, _ = _register_fresh()
        bad = {**FULL_PROFILE, "hr_email": "not-an-email"}
        r = requests.put(f"{API}/profile", json=bad, headers=_hdr(tok), timeout=30)
        assert r.status_code == 400, r.text


# ---------------- Chat gating ----------------
class TestChatGate:
    def test_chat_blocked_when_profile_incomplete(self):
        tok, _ = _register_fresh()
        r = requests.post(f"{API}/chat/stream", json={"text": "hello", "thread_id": "main"}, headers=_hdr(tok), timeout=30)
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"

    def test_chat_allowed_after_profile_completed(self):
        tok, _ = _register_fresh()
        requests.put(f"{API}/profile", json=FULL_PROFILE, headers=_hdr(tok), timeout=30)
        r = requests.post(f"{API}/chat/stream", json={"text": "hi", "thread_id": "main"}, headers=_hdr(tok), timeout=30)
        assert r.status_code == 200


# ---------------- Documents ----------------
class TestDocuments:
    @classmethod
    def setup_class(cls):
        cls.tok, cls.email = _register_fresh()
        requests.put(f"{API}/profile", json=FULL_PROFILE, headers=_hdr(cls.tok), timeout=30)
        cls.doc_id = None

    def test_01_upload_pdf_returns_processing(self):
        with open(CONTRACT_PDF, "rb") as f:
            files = {"file": ("contract.pdf", f, "application/pdf")}
            data = {"category": "contract"}
            r = requests.post(f"{API}/documents", files=files, data=data, headers=_hdr(self.tok), timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "processing"
        assert d["has_thumb"] is True
        assert d["category"] in ("contract",)
        TestDocuments.doc_id = d["doc_id"]

    def test_02_reject_txt_file_415(self):
        files = {"file": ("note.txt", io.BytesIO(b"hello world " * 50), "text/plain")}
        r = requests.post(f"{API}/documents", files=files, data={"category": ""}, headers=_hdr(self.tok), timeout=30)
        assert r.status_code == 415, r.text

    def test_03_list_contains_uploaded(self):
        r = requests.get(f"{API}/documents", headers=_hdr(self.tok), timeout=30)
        assert r.status_code == 200
        ids = [d["doc_id"] for d in r.json()]
        assert TestDocuments.doc_id in ids

    def test_04_thumb_signed_link_returns_png(self):
        link = requests.get(f"{API}/documents/{TestDocuments.doc_id}/link?kind=thumb", headers=_hdr(self.tok), timeout=30)
        assert link.status_code == 200, link.text
        r = requests.get(f"{API}{link.json()['url']}", timeout=30)
        assert r.status_code == 200, r.text
        assert r.headers["Content-Type"].startswith("image/png")
        assert len(r.content) > 500

    def test_05_file_signed_link_returns_pdf_and_token_param_is_ignored(self):
        assert requests.get(f"{API}/documents/{TestDocuments.doc_id}/file?token={self.tok}", timeout=30).status_code == 401
        link = requests.get(f"{API}/documents/{TestDocuments.doc_id}/link?kind=file", headers=_hdr(self.tok), timeout=30)
        r = requests.get(f"{API}{link.json()['url']}", timeout=30)
        assert r.status_code == 200
        assert r.headers["Content-Type"] == "application/pdf"

    def test_06_other_users_token_cannot_access(self):
        other_tok, _ = _register_fresh()
        assert requests.get(f"{API}/documents/{TestDocuments.doc_id}/link", headers=_hdr(other_tok), timeout=30).status_code == 404
        url = f"{API}/documents/{TestDocuments.doc_id}/file"
        r = requests.get(url, headers=_hdr(other_tok), timeout=30)
        assert r.status_code == 404, f"expected 404, got {r.status_code}"

    def test_07_processing_becomes_ready(self):
        deadline = time.time() + 60
        status = "processing"
        d = {}
        while time.time() < deadline:
            r = requests.get(f"{API}/documents", headers=_hdr(self.tok), timeout=30)
            lst = r.json()
            d = next((x for x in lst if x["doc_id"] == TestDocuments.doc_id), {})
            status = d.get("status")
            if status == "ready":
                break
            time.sleep(3)
        assert status == "ready", f"document did not become ready: {d}"
        assert d.get("summary"), "summary should be populated"
        assert isinstance(d.get("tags", []), list)
        assert d.get("category") in ("contract", "annex", "policy", "correspondence", "payslip", "other")

    def test_08_reprocess_endpoint(self):
        r = requests.post(f"{API}/documents/{TestDocuments.doc_id}/reprocess",
                          headers=_hdr(self.tok), timeout=30)
        assert r.status_code == 200
        g = requests.get(f"{API}/documents/{TestDocuments.doc_id}", headers=_hdr(self.tok), timeout=30).json()
        assert g["status"] == "processing"

    def test_09_delete_removes_from_list(self):
        r = requests.delete(f"{API}/documents/{TestDocuments.doc_id}", headers=_hdr(self.tok), timeout=30)
        assert r.status_code == 200
        lst = requests.get(f"{API}/documents", headers=_hdr(self.tok), timeout=30).json()
        ids = [d["doc_id"] for d in lst]
        assert TestDocuments.doc_id not in ids
