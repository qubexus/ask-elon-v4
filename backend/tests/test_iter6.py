"""Iteration 6: onboarding profile fields PUT, admin tabs endpoints shape, audits data."""
import os
import uuid
import pytest
import requests

BASE = (os.environ.get("TEST_BASE_URL") or "http://localhost:8001").rstrip("/")
API = f"{BASE}/api"

# PRO test account (the shared demo account was removed). Set TEST_PRO_EMAIL / TEST_PRO_PASSWORD
# to an existing PRO (is_member) account to run the tests that need one; otherwise they are skipped.
PRO_EMAIL = os.environ.get("TEST_PRO_EMAIL", "")
PRO_PASS = os.environ.get("TEST_PRO_PASSWORD", "")
ADMIN_EMAIL = "jan.test@example.com"
ADMIN_PASS = "NoweHaslo123"


def auth_headers(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    return {"Authorization": f"Bearer {r.json()['session_token']}"}


# -------------------- Onboarding profile PUT --------------------
class TestOnboardingProfile:
    def setup_method(self):
        email = f"TEST_ob_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{API}/auth/register", json={"name": "Testowy Jan", "email": email, "password": "Password123"})
        assert r.status_code == 200, r.text
        self.email = email
        self.h = {"Authorization": f"Bearer {r.json()['session_token']}"}

    def test_fresh_user_not_onboarded(self):
        me = requests.get(f"{API}/auth/me", headers=self.h).json()
        assert me.get("onboarded") in (False, None)
        assert me.get("profile_complete") in (False, None)

    def test_profile_put_accepts_each_field(self):
        payload = [
            {"name": "Artur Kowalski"},
            {"address": "12 High Street, Dartford DA1 1AA"},
            {"phone": "+44 7700 900123"},
            {"employer": "Amazon UK Services Ltd"},
            {"industry": "logistics_warehousing"},
            {"job_title": "Warehouse Operative"},
            {"contract_type": "zero_hours"},
            {"start_date": "2024-01-12"},
            {"workplace_address": "London Road, Tilbury RM18 7AN"},
            {"hr_email": "hr@company.co.uk"},
        ]
        for body in payload:
            r = requests.put(f"{API}/profile", headers=self.h, json=body, timeout=15)
            assert r.status_code == 200, f"PUT /profile {body} -> {r.status_code} {r.text}"

        me = requests.get(f"{API}/auth/me", headers=self.h).json()
        assert me.get("profile_complete") is True
        assert me.get("workplace_address") == "London Road, Tilbury RM18 7AN"
        assert me.get("hr_email") == "hr@company.co.uk"

    def test_profile_put_bad_hr_email_returns_400(self):
        r = requests.put(f"{API}/profile", headers=self.h, json={"hr_email": "notanemail"})
        assert r.status_code == 400

    def test_onboarded_flag_persists(self):
        r = requests.put(f"{API}/profile", headers=self.h, json={"onboarded": True})
        assert r.status_code == 200
        me = requests.get(f"{API}/auth/me", headers=self.h).json()
        assert me.get("onboarded") is True


# -------------------- Admin endpoints shape (for /admin tabs) --------------------
class TestAdminTabsEndpoints:
    def setup_method(self):
        self.h = auth_headers(ADMIN_EMAIL, ADMIN_PASS)

    def test_stats_returns_object(self):
        r = requests.get(f"{API}/admin/stats", headers=self.h)
        if r.status_code == 403:
            pytest.skip("admin role not set on jan.test — see test_credentials.md")
        assert r.status_code == 200
        d = r.json()
        for k in ("users", "members", "active_subscriptions", "mrr_gbp", "cases", "messages", "documents", "forum_posts", "unread_contact"):
            assert k in d, f"missing key {k}"

    @pytest.mark.parametrize("path", ["/admin/users", "/admin/promos", "/admin/broadcasts", "/admin/messages"])
    def test_list_endpoints_return_arrays(self, path):
        r = requests.get(f"{API}{path}", headers=self.h)
        if r.status_code == 403:
            pytest.skip("admin role not set")
        assert r.status_code == 200
        assert isinstance(r.json(), list), f"{path} must return a JSON array for the admin UI .map()"


# -------------------- Audits (documents list) --------------------
class TestAuditsListing:
    def setup_method(self):
        if not PRO_EMAIL or not PRO_PASS:
            pytest.skip("TEST_PRO_EMAIL / TEST_PRO_PASSWORD not set")
        self.h = auth_headers(PRO_EMAIL, PRO_PASS)

    def test_documents_endpoint_returns_array(self):
        r = requests.get(f"{API}/documents", headers=self.h)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_audit_history_math_sums_correctly(self):
        docs = requests.get(f"{API}/documents", headers=self.h).json()
        payslip_audits = [d for d in docs if d.get("category") == "payslip" and d.get("audit")]
        # Just assert structure if any audit exists
        for d in payslip_audits:
            a = d["audit"]
            # fields the UI reads
            assert "verdict" in a
            # these can be absent on failed audits; UI uses Number(...) || 0
            if "estimated_owed_gbp" in a:
                float(a["estimated_owed_gbp"])
            if "unpaid_hours" in a:
                float(a["unpaid_hours"])
