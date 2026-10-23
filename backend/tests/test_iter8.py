"""
Iteration 8 backend tests — camera scan (readability check + multi-page PDF),
send-to-HR letter tracking, 7-day countdown PATCH states, PRO gating,
and verification of the seeded overdue letter owned by demo@unionelon.app.
"""
import io
import os
import time
import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://start-project-33.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
DEMO_EMAIL = "demo@unionelon.app"
DEMO_PASS = "UnionDemo2026!"
JAN_EMAIL = "jan.test@example.com"
JAN_PASS = "NoweHaslo123"
SEEDED_LETTER = "letter_test_overdue"


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
def demo_token():
    r = requests.post(f"{API}/auth/demo", timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def jan_token():
    r = requests.post(f"{API}/auth/login", json={"email": JAN_EMAIL, "password": JAN_PASS}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"jan.test login failed: {r.status_code} {r.text}")
    return r.json()["session_token"]


@pytest.fixture
def demo_h(demo_token):
    return {"Authorization": f"Bearer {demo_token}"}


@pytest.fixture
def jan_h(jan_token):
    return {"Authorization": f"Bearer {jan_token}"}


# ---------------- auth / profile sanity ----------------
class TestProfile:
    def test_demo_is_pro_with_hr_email(self, demo_h):
        r = requests.get(f"{API}/auth/me", headers=demo_h, timeout=10)
        assert r.status_code == 200
        u = r.json()
        assert u["email"] == DEMO_EMAIL
        assert u.get("is_member") is True, "demo must be PRO"
        assert u.get("hr_email") == "hr-lcy2@example.com"


# ---------------- camera scan readability check ----------------
class TestScanCheck:
    def test_scan_check_pro_ok(self, demo_h):
        files = {"file": ("page.jpg", _jpg_bytes(text=True), "image/jpeg")}
        r = requests.post(f"{API}/documents/scan-check", headers=demo_h, files=files, timeout=60)
        assert r.status_code == 200, r.text
        j = r.json()
        assert set(j.keys()) == {"readable", "reason"}
        assert isinstance(j["readable"], bool)
        assert isinstance(j["reason"], str)

    def test_scan_check_tiny_image_rejected(self, demo_h):
        # <100 bytes triggers 400
        files = {"file": ("tiny.jpg", b"x" * 10, "image/jpeg")}
        r = requests.post(f"{API}/documents/scan-check", headers=demo_h, files=files, timeout=30)
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

    def test_scan_rejects_zero_pages(self, demo_h):
        # No files -> FastAPI 422
        r = requests.post(f"{API}/documents/scan", headers=demo_h, data={"category": "payslip"}, timeout=15)
        assert r.status_code in (400, 422)

    def test_scan_merges_two_pages_into_pdf_doc(self, demo_h):
        files = [
            ("files", ("p1.jpg", _jpg_bytes(text=True), "image/jpeg")),
            ("files", ("p2.jpg", _jpg_bytes(text=True, color=(230, 230, 230)), "image/jpeg")),
        ]
        r = requests.post(f"{API}/documents/scan", headers=demo_h, files=files, data={"category": "payslip"}, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["mime"] == "application/pdf"
        assert d["filename"].endswith(".pdf")
        assert d["category"] == "payslip"
        doc_id = d["doc_id"]
        # Verify persisted
        g = requests.get(f"{API}/documents/{doc_id}", headers=demo_h, timeout=10)
        assert g.status_code == 200
        assert g.json()["doc_id"] == doc_id
        # Cleanup
        requests.delete(f"{API}/documents/{doc_id}", headers=demo_h, timeout=10)


# ---------------- letters CRUD & 7-day deadline ----------------
class TestLetters:
    def test_seeded_overdue_present(self, demo_h):
        r = requests.get(f"{API}/letters", headers=demo_h, timeout=10)
        assert r.status_code == 200
        letters = r.json()
        found = [x for x in letters if x["letter_id"] == SEEDED_LETTER]
        assert found, "letter_test_overdue should be seeded for demo user"
        letter = found[0]
        from datetime import datetime, timezone
        deadline = datetime.fromisoformat(letter["deadline_at"].replace("Z", "+00:00"))
        assert deadline < datetime.now(timezone.utc), "seeded letter must be overdue"
        assert letter["status"] == "awaiting"

    def test_create_letter_sets_7day_deadline(self, demo_h):
        payload = {"template_id": "unpaid_wages", "title": "TEST_iter8_letter", "recipient": "hr@example.com", "amount_gbp": 42.5}
        r = requests.post(f"{API}/letters", headers=demo_h, json=payload, timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "awaiting"
        from datetime import datetime
        sent = datetime.fromisoformat(d["sent_at"].replace("Z", "+00:00"))
        deadline = datetime.fromisoformat(d["deadline_at"].replace("Z", "+00:00"))
        delta_days = (deadline - sent).total_seconds() / 86400
        assert 6.99 < delta_days < 7.01, f"deadline must be sent_at + 7d, got {delta_days}"
        # Verify list contains it
        g = requests.get(f"{API}/letters", headers=demo_h, timeout=10).json()
        assert any(x["letter_id"] == d["letter_id"] for x in g)
        # Cleanup
        requests.delete(f"{API}/letters/{d['letter_id']}", headers=demo_h, timeout=10)

    def test_patch_status_paid(self, demo_h):
        r = requests.post(f"{API}/letters", headers=demo_h, json={"template_id": "unpaid_wages", "title": "TEST_paid_flow"}, timeout=10)
        lid = r.json()["letter_id"]
        p = requests.patch(f"{API}/letters/{lid}", headers=demo_h, json={"status": "paid"}, timeout=10)
        assert p.status_code == 200
        assert p.json()["status"] == "paid"
        requests.delete(f"{API}/letters/{lid}", headers=demo_h, timeout=10)

    def test_patch_status_acas(self, demo_h):
        r = requests.post(f"{API}/letters", headers=demo_h, json={"template_id": "unpaid_wages", "title": "TEST_acas_flow"}, timeout=10)
        lid = r.json()["letter_id"]
        p = requests.patch(f"{API}/letters/{lid}", headers=demo_h, json={"status": "acas"}, timeout=10)
        assert p.status_code == 200
        assert p.json()["status"] == "acas"
        requests.delete(f"{API}/letters/{lid}", headers=demo_h, timeout=10)

    def test_patch_invalid_status_rejected(self, demo_h):
        r = requests.post(f"{API}/letters", headers=demo_h, json={"template_id": "unpaid_wages", "title": "TEST_bad_status"}, timeout=10)
        lid = r.json()["letter_id"]
        p = requests.patch(f"{API}/letters/{lid}", headers=demo_h, json={"status": "lol"}, timeout=10)
        assert p.status_code == 400
        requests.delete(f"{API}/letters/{lid}", headers=demo_h, timeout=10)

    def test_delete_letter(self, demo_h):
        r = requests.post(f"{API}/letters", headers=demo_h, json={"template_id": "unpaid_wages", "title": "TEST_delete"}, timeout=10)
        lid = r.json()["letter_id"]
        d = requests.delete(f"{API}/letters/{lid}", headers=demo_h, timeout=10)
        assert d.status_code == 200
        g = requests.get(f"{API}/letters", headers=demo_h, timeout=10).json()
        assert not any(x["letter_id"] == lid for x in g)

    def test_patch_404_for_unknown(self, demo_h):
        p = requests.patch(f"{API}/letters/nope_zzz", headers=demo_h, json={"status": "paid"}, timeout=10)
        assert p.status_code == 404

    def test_letters_require_auth(self):
        r = requests.get(f"{API}/letters", timeout=10)
        assert r.status_code in (401, 403)
