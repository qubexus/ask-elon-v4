"""Local checks for the self-hosted version: auth, admin via ADMIN_EMAILS, password reset, CORS,
uploads with local storage, Demo removed, clear errors without an AI key, rate limiting.

Run against a backend started with APP_ENV=development (reset codes are read from its log):
    TEST_ADMIN_EMAIL=<one of ADMIN_EMAILS>  TEST_BACKEND_LOG=<server log file>  pytest -n 0 tests/test_local_security.py
"""
import io, os, re, time, uuid
import pytest, requests
from conftest import BASE_URL

API = f"{BASE_URL}/api"
LOG = os.environ.get("TEST_BACKEND_LOG", "/tmp/ae-backend.log")
ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "")
PW = "StrongPass123!"


def new_user(email=None, name="Jan Test"):
    email = email or f"local_{uuid.uuid4().hex[:10]}@example.com"
    r = requests.post(f"{API}/auth/register", json={"name": name, "email": email, "password": PW}, timeout=15)
    assert r.status_code in (200, 409), r.text
    if r.status_code == 409:
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": PW}, timeout=15)
    return email, {"Authorization": f"Bearer {r.json()['session_token']}"}


def complete_profile(h):
    r = requests.put(f"{API}/profile", headers=h, timeout=15, json={
        "name": "Jan Test", "address": "1 Test St", "phone": "+44 7700 900000", "employer": "Test Ltd",
        "industry": "Logistics", "job_title": "Operative", "contract_type": "zero_hours",
        "start_date": "2024-01-01", "workplace_address": "2 Test Rd"})
    assert r.status_code == 200 and r.json()["profile_complete"] is True


def test_register_login_me():
    email, h = new_user()
    me = requests.get(f"{API}/auth/me", headers=h, timeout=15).json()
    assert me["email"] == email and "password_hash" not in me
    r = requests.post(f"{API}/auth/login", json={"email": email.upper(), "password": PW}, timeout=15)
    assert r.status_code == 200
    assert requests.post(f"{API}/auth/login", json={"email": email, "password": "wrong-pass"}, timeout=15).status_code == 401
    assert requests.get(f"{API}/auth/me", headers={"Authorization": "Bearer not-a-jwt"}, timeout=15).status_code == 401


def test_logout_revokes_session():
    _, h = new_user()
    assert requests.post(f"{API}/auth/logout", headers=h, timeout=15).status_code == 200
    assert requests.get(f"{API}/auth/me", headers=h, timeout=15).status_code == 401


def test_cases_templates_forum():
    _, h = new_user()
    c = requests.post(f"{API}/cases", headers=h, json={"title": "Test case", "description": "x"}, timeout=15)
    assert c.status_code == 200
    assert any(x["case_id"] == c.json()["case_id"] for x in requests.get(f"{API}/cases", headers=h, timeout=15).json())
    t = requests.get(f"{API}/templates", timeout=15)
    assert t.status_code == 200 and len(t.json()) >= 10
    p = requests.post(f"{API}/forum/posts", headers=h, json={"title": "Pytanie testowe", "body": "Treść testowa"}, timeout=15)
    assert p.status_code == 200
    assert requests.post(f"{API}/forum/posts/{p.json()['post_id']}/comments", headers=h, json={"body": "ok"}, timeout=15).status_code == 200
    assert requests.get(f"{API}/forum/posts", headers=h, timeout=15).status_code == 200


def test_demo_login_removed():
    assert requests.post(f"{API}/auth/demo", timeout=15).status_code in (404, 405)
    r = requests.post(f"{API}/auth/login", json={"email": "demo@unionelon.app", "password": "UnionDemo2026!"}, timeout=15)
    assert r.status_code == 401


def test_old_hosted_google_endpoint_gone_and_google_config():
    assert requests.post(f"{API}/auth/session", json={"session_id": "x"}, timeout=15).status_code in (404, 405)
    cfg = requests.get(f"{API}/auth/config", timeout=15).json()
    r = requests.post(f"{API}/auth/google", json={"id_token": "fake"}, timeout=15)
    assert r.status_code == (401 if cfg["google"] else 503)


def test_admin_only_via_admin_emails():
    _, h = new_user()
    assert requests.get(f"{API}/admin/stats", headers=h, timeout=15).status_code == 403
    if not ADMIN_EMAIL:
        pytest.skip("TEST_ADMIN_EMAIL not set")
    _, ha = new_user(ADMIN_EMAIL, "Admin Test")
    r = requests.get(f"{API}/admin/stats", headers=ha, timeout=15)
    assert r.status_code == 200 and "users" in r.json()


def _read_code(email):
    pat = re.compile(rf"PASSWORD RESET CODE for {re.escape(email)}: (\d{{6}})")
    for _ in range(20):
        with open(LOG, errors="ignore") as f:
            for ln in reversed(f.readlines()[-2000:]):
                m = pat.search(ln)
                if m:
                    return m.group(1)
        time.sleep(0.25)
    return ""


def test_reset_flow_single_use_and_attempts():
    if not os.path.exists(LOG):
        pytest.skip("server log not available")
    email, old = new_user()
    r = requests.post(f"{API}/auth/request-reset", json={"email": email}, timeout=15)
    assert r.status_code == 200 and "code" not in r.json()
    code = _read_code(email)
    assert code
    bad = "000000" if code != "000000" else "111111"
    assert requests.post(f"{API}/auth/reset-password", json={"email": email, "code": bad, "new_password": "NewPass12345"}, timeout=15).status_code == 400
    r = requests.post(f"{API}/auth/reset-password", json={"email": email, "code": code, "new_password": "NewPass12345"}, timeout=15)
    assert r.status_code == 200
    assert requests.get(f"{API}/auth/me", headers=old, timeout=15).status_code == 401  # old sessions revoked
    # single use
    assert requests.post(f"{API}/auth/reset-password", json={"email": email, "code": code, "new_password": "Other12345"}, timeout=15).status_code == 400
    # code burned after 5 wrong attempts
    requests.post(f"{API}/auth/request-reset", json={"email": email}, timeout=15)
    time.sleep(0.5)
    code2 = _read_code(email)
    for _ in range(5):
        requests.post(f"{API}/auth/reset-password", json={"email": email, "code": bad, "new_password": "Other12345"}, timeout=15)
    assert requests.post(f"{API}/auth/reset-password", json={"email": email, "code": code2, "new_password": "Other12345"}, timeout=15).status_code == 400


def test_cors_allowlist():
    ok = requests.options(f"{API}/auth/login", timeout=15, headers={
        "Origin": "http://localhost:8081", "Access-Control-Request-Method": "POST"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:8081"
    assert ok.headers.get("access-control-allow-credentials") is None
    bad = requests.options(f"{API}/auth/login", timeout=15, headers={
        "Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
    assert bad.headers.get("access-control-allow-origin") is None


def test_security_headers_and_no_stack_traces():
    r = requests.get(f"{API}/templates", timeout=15)
    assert r.headers.get("x-content-type-options") == "nosniff"
    r = requests.get(f"{API}/documents/doc_x/file?token=garbage", timeout=15)
    assert r.status_code == 401 and "Traceback" not in r.text


def _tiny_png():
    import zlib, struct
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    raw = b"".join(b"\x00" + b"\xff\x00\x00" * 64 for _ in range(64))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 64, 64, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


def test_upload_local_storage_and_download():
    _, h = new_user()
    png = _tiny_png()
    r = requests.post(f"{API}/documents", headers=h, files={"file": ("payslip.png", png, "image/png")},
                      data={"category": "payslip"}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "storage_path" not in d
    f = requests.get(f"{API}/documents/{d['doc_id']}/file", headers=h, timeout=15)
    assert f.status_code == 200 and f.content == png
    assert requests.get(f"{API}/documents/{d['doc_id']}/thumb", headers=h, timeout=15).status_code == 200
    # another user cannot read it
    _, h2 = new_user()
    assert requests.get(f"{API}/documents/{d['doc_id']}/file", headers=h2, timeout=15).status_code == 404
    # fake file type rejected, too large rejected
    bad = requests.post(f"{API}/documents", headers=h, files={"file": ("x.pdf", b"MZ" + b"0" * 500, "application/pdf")}, timeout=15)
    assert bad.status_code == 415
    big = requests.post(f"{API}/documents", headers=h, files={"file": ("big.pdf", b"%PDF" + b"0" * (26 * 1024 * 1024), "application/pdf")}, timeout=60)
    assert big.status_code == 413


@pytest.mark.skipif(os.environ.get("TEST_EXPECT_NO_AI") != "1", reason="only when the server runs without GEMINI_API_KEY")
def test_ai_endpoints_clear_error_without_key():
    _, h = new_user()
    complete_profile(h)
    r = requests.post(f"{API}/chat/stream", headers=h, json={"text": "Hej"}, timeout=15)
    assert r.status_code == 503 and "not configured" in r.json()["detail"]
    r = requests.post(f"{API}/transcribe", headers=h, files={"audio": ("a.webm", b"0" * 5000, "audio/webm")}, timeout=15)
    assert r.status_code == 503
    assert "gemini" not in r.text.lower()


@pytest.mark.skipif(os.environ.get("TEST_RATE_LIMIT") != "1", reason="needs a server with rate limiting ON")
def test_rate_limit_login():
    codes = [requests.post(f"{API}/auth/login", json={"email": "nobody@example.com", "password": "x"}, timeout=15).status_code
             for _ in range(35)]
    assert 429 in codes
