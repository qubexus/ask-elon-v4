"""
Iteration 9 backend tests — RevenueCat/PRO gating, FREE plan rules,
27 tri-lingual legal templates, chat usage endpoint, owner admin login,
chat/stream LLM reply (Emergent key refreshed).
"""
import io
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://start-project-33.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

OWNER_EMAIL = "jocobisun@gmail.com"
OWNER_PASS = "2127054Marek"
DEMO_EMAIL = "demo@unionelon.app"
DEMO_PASS = "UnionDemo2026!"

EXPECTED_27 = [
    "formal_grievance", "unpaid_wages", "ssp_demand", "right_to_accompaniment",
    "awr_equal_treatment", "hours_cut_notice", "sar_clocking_records",
    "landlord_repairs", "deposit_refund", "standard_employment_contract",
    "ast_tenancy_agreement", "subcontractor_services_agreement",
    # 15 new ones:
    "holiday_pay", "resignation_notice", "disciplinary_appeal",
    "bullying_grievance", "flexible_working", "maternity_paternity",
    "redundancy_challenge", "p45_p60_request", "night_work", "whistleblowing",
    "acas_early_conciliation", "unlawful_deductions", "written_statement_request",
    "return_to_work_adjustments", "agency_fees_notice",
]


# ---------------- fixtures ----------------
@pytest.fixture(scope="module")
def owner_token():
    r = requests.post(f"{API}/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASS}, timeout=15)
    assert r.status_code == 200, f"owner login failed: {r.status_code} {r.text}"
    return r.json()["session_token"]


@pytest.fixture
def owner_h(owner_token):
    return {"Authorization": f"Bearer {owner_token}"}


@pytest.fixture(scope="module")
def demo_token():
    r = requests.post(f"{API}/auth/demo", timeout=15)
    assert r.status_code == 200
    return r.json()["session_token"]


@pytest.fixture
def demo_h(demo_token):
    return {"Authorization": f"Bearer {demo_token}"}


@pytest.fixture
def fresh_free_user():
    """Register a brand-new free (non-PRO) user and return (token, email)."""
    email = f"TEST_iter9_{int(time.time()*1000)}@example.com"
    r = requests.post(f"{API}/auth/register",
                      json={"name": "TEST Iter9", "email": email, "password": "FreeUser123!"},
                      timeout=15)
    assert r.status_code == 200, r.text
    token = r.json()["session_token"]
    return token, email


# ---------------- Templates ----------------
class TestTemplates:
    def test_27_templates_with_trilingual_titles(self):
        r = requests.get(f"{API}/templates", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 27, f"expected 27 templates, got {len(data)}"
        ids = {t["id"] for t in data}
        for tid in EXPECTED_27:
            assert tid in ids, f"missing template {tid}"
        # tri-lingual titles (titlePl/titleEn/titleRo) on every template
        for t in data:
            for key in ("titlePl", "titleEn", "titleRo"):
                assert t.get(key), f"template {t.get('id')} missing {key}"


# ---------------- Chat usage ----------------
class TestChatUsage:
    def test_chat_usage_shape(self, demo_h):
        r = requests.get(f"{API}/chat/usage", headers=demo_h, timeout=10)
        assert r.status_code == 200, r.text
        j = r.json()
        assert set(j.keys()) >= {"today", "days_since_signup", "free_daily", "trial_days"}
        assert j["free_daily"] == 3
        assert j["trial_days"] == 7
        assert isinstance(j["today"], int)
        assert isinstance(j["days_since_signup"], int)

    def test_chat_usage_fresh_user(self, fresh_free_user):
        token, _ = fresh_free_user
        r = requests.get(f"{API}/chat/usage", headers={"Authorization": f"Bearer {token}"}, timeout=10)
        assert r.status_code == 200
        j = r.json()
        assert j["today"] == 0
        assert j["days_since_signup"] == 0
        assert j["free_daily"] == 3
        assert j["trial_days"] == 7

    def test_chat_usage_requires_auth(self):
        r = requests.get(f"{API}/chat/usage", timeout=10)
        assert r.status_code in (401, 403)


# ---------------- Owner admin login ----------------
class TestOwnerAdmin:
    def test_owner_login_ok(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": OWNER_EMAIL, "password": OWNER_PASS}, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "session_token" in j
        assert j.get("user", {}).get("email") == OWNER_EMAIL

    def test_owner_me_is_admin_and_pro(self, owner_h):
        r = requests.get(f"{API}/auth/me", headers=owner_h, timeout=10)
        assert r.status_code == 200
        u = r.json()
        assert u["email"] == OWNER_EMAIL
        assert u.get("role") == "admin", f"expected role=admin, got {u.get('role')}"
        assert u.get("is_member") is True, "owner must be PRO"

    def test_owner_can_access_admin(self, owner_h):
        r = requests.get(f"{API}/admin/stats", headers=owner_h, timeout=10)
        assert r.status_code == 200, f"owner should access /admin/stats: {r.status_code} {r.text}"


# ---------------- Chat stream (LLM) ----------------
class TestChatStream:
    def test_chat_stream_responds(self, demo_h):
        """Verify LLM key still works post-fork. demo is profile_complete."""
        r = requests.post(f"{API}/chat/stream", headers=demo_h,
                          json={"text": "Say the word READY and stop.", "thread_id": "main"},
                          stream=True, timeout=60)
        assert r.status_code == 200, r.text
        full = ""
        got_delta = False
        for chunk in r.iter_lines():
            if not chunk:
                continue
            s = chunk.decode()
            if s.startswith("data: "):
                import json as _j
                try:
                    ev = _j.loads(s[6:])
                except Exception:
                    continue
                if "delta" in ev:
                    full += ev["delta"]
                    got_delta = True
                if "error" in ev:
                    pytest.fail(f"LLM stream error: {ev['error']}")
                if ev.get("done"):
                    break
        assert got_delta, "no delta events received"
        assert len(full) > 0, "no text streamed"

    def test_chat_stream_requires_profile_complete(self, fresh_free_user):
        """A newly registered user with incomplete profile gets 403."""
        token, _ = fresh_free_user
        r = requests.post(f"{API}/chat/stream",
                          headers={"Authorization": f"Bearer {token}"},
                          json={"text": "hi", "thread_id": "main"},
                          timeout=15)
        assert r.status_code == 403


# ---------------- PRO gating removed (playbook) ----------------
class TestClientSideProGating:
    """RevenueCat playbook: PRO gating is intentionally client-side only.
    Backend endpoints for letters/documents must NOT 403 for a non-PRO
    completed-profile user. (Previously 403 for jan.test was for incomplete
    profile; here we test that letters POST is reachable for non-PRO).
    """
    def test_letters_post_not_pro_gated(self, fresh_free_user):
        token, _ = fresh_free_user
        # The user is non-PRO AND has incomplete profile. letters POST
        # should still succeed because no PRO or profile requirement is
        # imposed server-side.
        r = requests.post(f"{API}/letters",
                          headers={"Authorization": f"Bearer {token}"},
                          json={"template_id": "unpaid_wages", "title": "TEST_iter9_free_letter"},
                          timeout=10)
        # Accept 200 (no gating) — this documents current server behavior.
        assert r.status_code == 200, f"expected letters POST to be client-gated; got {r.status_code}: {r.text}"
        lid = r.json().get("letter_id")
        if lid:
            requests.delete(f"{API}/letters/{lid}",
                            headers={"Authorization": f"Bearer {token}"}, timeout=10)
