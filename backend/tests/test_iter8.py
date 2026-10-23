"""
Iteration 8 backend tests — camera scan (readability check + multi-page PDF),
send-to-HR letter tracking, 7-day countdown PATCH states and PRO gating.
"""
import io
import os
import time
import pytest
import requests
from PIL import Image

BASE_URL = (os.environ.get("TEST_BASE_URL") or "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"
# PRO test account (the shared demo account was removed). Set TEST_PRO_EMAIL / TEST_PRO_PASSWORD
# to an existing PRO (is_member) account to run the tests that need one; otherwise they are skipped.
PRO_EMAIL = os.environ.get("TEST_PRO_EMAIL", "")
PRO_PASS = os.environ.get("TEST_PRO_PASSWORD", "")
JAN_EMAIL = "jan.test@example.com"
JAN_PASS = "NoweHaslo123"


def _jpg_bytes(w=800, h=1000, color=(240, 240, 240), text=False):
    img = Image.new("RGB", (w, h), color)
    if text:
        # add some content so it's not blank
        from PIL import ImageDraw
        d = ImageDraw.Draw(img)
        for y in range(50, h - 50, 40):
            d.rectangle([50, y, w - 50, y + 20], fill=(50, 50, 50))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


# ---------------- fixtures ----------------
@pytest.fixture(scope="module")
def pro_token():
    if not PRO_EMAIL or not PRO_PASS:
        pytest.skip("TEST_PRO_EMAIL / TEST_PRO_PASSWORD not set")
    r = requests.post(f"{API}/auth/login", json={"email": PRO_EMAIL, "password": PRO_PASS}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def jan_token():
    r = requests.post(f"{API}/auth/login", json={"email": JAN_EMAIL, "password": JAN_PASS}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"jan.test login failed: {r.status_code} {r.text}")
    return r.json()["session_token"]


@pytest.fixture
def pro_h(pro_token):
    return {"Authorization": f"Bearer {pro_token}"}


@pytest.fixture
def jan_h(jan_token):
    return {"Authorization": f"Bearer {jan_token}"}


# ---------------- camera scan readability check ----------------
class TestScanCheck:
    def test_scan_check_pro_ok(self, pro_h):
        files = {"file": ("page.jpg", _jpg_bytes(text=True), "image/jpeg")}
        r = requests.post(f"{API}/documents/scan-check", headers=pro_h, files=files, timeout=60)
        assert r.status_code == 200, r.text
        j = r.json()
        assert set(j.keys()) == {"readable", "reason"}
        assert isinstance(j["readable"], bool)
        assert isinstance(j["reason"], str)

    def test_scan_check_tiny_image_rejected(self, pro_h):
        # <100 bytes triggers 400
        files = {"file": ("tiny.jpg", b"x" * 10, "image/jpeg")}
        r = requests.post(f"{API}/documents/scan-check", headers=pro_h, files=files, timeout=30)
        assert r.status_code == 400

    def test_scan_check_blocks_non_pro(self, jan_h):
        files = {"file": ("page.jpg", _jpg_bytes(text=True), "image/jpeg")}
        r = requests.post(f"{API}/documents/scan-check", headers=jan_h, files=files, timeout=30)
        assert r.status_code == 403


# ---------------- multi-page scan -> PDF ----------------
class TestScanMerge:
    def test_scan_blocks_non_pro(self, jan_h):
        files = [("files", ("p1.jpg", _jpg_bytes(text=True), "image/jpeg"))]
        r = requests.post(f"{API}/documents/scan", headers=jan_h, files=files, data={"category": "payslip"}, timeout=30)
        assert r.status_code == 403

    def test_scan_rejects_zero_pages(self, pro_h):
        # No files -> FastAPI 422
        r = requests.post(f"{API}/documents/scan", headers=pro_h, data={"category": "payslip"}, timeout=15)
        assert r.status_code in (400, 422)

    def test_scan_merges_two_pages_into_pdf_doc(self, pro_h):
        files = [
            ("files", ("p1.jpg", _jpg_bytes(text=True), "image/jpeg")),
            ("files", ("p2.jpg", _jpg_bytes(text=True, color=(230, 230, 230)), "image/jpeg")),
        ]
        r = requests.post(f"{API}/documents/scan", headers=pro_h, files=files, data={"category": "payslip"}, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["mime"] == "application/pdf"
        assert d["filename"].endswith(".pdf")
        assert d["category"] == "payslip"
        doc_id = d["doc_id"]
        # Verify persisted
        g = requests.get(f"{API}/documents/{doc_id}", headers=pro_h, timeout=10)
        assert g.status_code == 200
        assert g.json()["doc_id"] == doc_id
        # Cleanup
        requests.delete(f"{API}/documents/{doc_id}", headers=pro_h, timeout=10)


# ---------------- letters CRUD & 7-day deadline ----------------
class TestLetters:
    def test_create_letter_sets_7day_deadline(self, pro_h):
        payload = {"template_id": "unpaid_wages", "title": "TEST_iter8_letter", "recipient": "hr@example.com", "amount_gbp": 42.5}
        r = requests.post(f"{API}/letters", headers=pro_h, json=payload, timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "awaiting"
        from datetime import datetime
        sent = datetime.fromisoformat(d["sent_at"].replace("Z", "+00:00"))
        deadline = datetime.fromisoformat(d["deadline_at"].replace("Z", "+00:00"))
        delta_days = (deadline - sent).total_seconds() / 86400
        assert 6.99 < delta_days < 7.01, f"deadline must be sent_at + 7d, got {delta_days}"
        # Verify list contains it
        g = requests.get(f"{API}/letters", headers=pro_h, timeout=10).json()
        assert any(x["letter_id"] == d["letter_id"] for x in g)
        # Cleanup
        requests.delete(f"{API}/letters/{d['letter_id']}", headers=pro_h, timeout=10)

    def test_patch_status_paid(self, pro_h):
        r = requests.post(f"{API}/letters", headers=pro_h, json={"template_id": "unpaid_wages", "title": "TEST_paid_flow"}, timeout=10)
        lid = r.json()["letter_id"]
        p = requests.patch(f"{API}/letters/{lid}", headers=pro_h, json={"status": "paid"}, timeout=10)
        assert p.status_code == 200
        assert p.json()["status"] == "paid"
        requests.delete(f"{API}/letters/{lid}", headers=pro_h, timeout=10)

    def test_patch_status_acas(self, pro_h):
        r = requests.post(f"{API}/letters", headers=pro_h, json={"template_id": "unpaid_wages", "title": "TEST_acas_flow"}, timeout=10)
        lid = r.json()["letter_id"]
        p = requests.patch(f"{API}/letters/{lid}", headers=pro_h, json={"status": "acas"}, timeout=10)
        assert p.status_code == 200
        assert p.json()["status"] == "acas"
        requests.delete(f"{API}/letters/{lid}", headers=pro_h, timeout=10)

    def test_patch_invalid_status_rejected(self, pro_h):
        r = requests.post(f"{API}/letters", headers=pro_h, json={"template_id": "unpaid_wages", "title": "TEST_bad_status"}, timeout=10)
        lid = r.json()["letter_id"]
        p = requests.patch(f"{API}/letters/{lid}", headers=pro_h, json={"status": "lol"}, timeout=10)
        assert p.status_code == 400
        requests.delete(f"{API}/letters/{lid}", headers=pro_h, timeout=10)

    def test_delete_letter(self, pro_h):
        r = requests.post(f"{API}/letters", headers=pro_h, json={"template_id": "unpaid_wages", "title": "TEST_delete"}, timeout=10)
        lid = r.json()["letter_id"]
        d = requests.delete(f"{API}/letters/{lid}", headers=pro_h, timeout=10)
        assert d.status_code == 200
        g = requests.get(f"{API}/letters", headers=pro_h, timeout=10).json()
        assert not any(x["letter_id"] == lid for x in g)

    def test_patch_404_for_unknown(self, pro_h):
        p = requests.patch(f"{API}/letters/nope_zzz", headers=pro_h, json={"status": "paid"}, timeout=10)
        assert p.status_code == 404

    def test_letters_require_auth(self):
        r = requests.get(f"{API}/letters", timeout=10)
        assert r.status_code in (401, 403)
