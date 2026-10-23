"""Email/password auth + reset + logout tests (iteration 3)."""
import os, re, time, uuid, requests, pytest
from conftest import BASE_URL
import devmail  # noqa: E402  (confirms test accounts via the dev e-mail outbox)

BACKEND_LOG = os.environ.get("TEST_BACKEND_LOG", "/tmp/ae-backend.log")  # server log (APP_ENV=development)


def _headers(tok): return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _new_email():
    return f"test_{uuid.uuid4().hex[:10]}@example.com"


# ------------------ Register ------------------
class TestRegister:
    def test_register_requires_email_confirmation_then_returns_token(self):
        email = _new_email()
        raw = requests.post(f"{BASE_URL}/api/auth/register",
                            json={"name": "Jan Test", "email": email, "password": "StrongPass123"})
        assert raw.status_code == 200, raw.text
        assert raw.json()["verification_required"] is True and "session_token" not in raw.json()
        # inactive until confirmed: the right password is refused with a clear code
        li = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": "StrongPass123"})
        assert li.status_code == 403 and li.json()["code"] == "email_unverified"
        code = devmail.latest_code(email, "verify")
        r = requests.post(f"{BASE_URL}/api/auth/verify-email", json={"email": email, "code": code})
        assert r.status_code == 200, r.text
        d = r.json()
        assert "session_token" in d and len(d["session_token"]) > 20
        u = d["user"]
        assert u["email"] == email
        assert u.get("onboarded") is False
        assert u.get("email_verified") is True
        assert "password_hash" not in u
        # /auth/me with returned token works, no password_hash
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=_headers(d["session_token"]))
        assert me.status_code == 200
        assert "password_hash" not in me.json()

    def test_register_duplicate_409(self):
        email = _new_email()
        r1 = devmail.register(f"{BASE_URL}/api", json={"name": "X", "email": email, "password": "StrongPass123"})
        assert r1.status_code == 200, r1.text
        r2 = devmail.register(f"{BASE_URL}/api", json={"name": "Y", "email": email, "password": "StrongPass123"})
        assert r2.status_code == 409, r2.text

    def test_register_short_password_422(self):
        r = devmail.register(f"{BASE_URL}/api", json={"name": "X", "email": _new_email(), "password": "short"})
        assert r.status_code == 422


# ------------------ Login ------------------
class TestLogin:
    def setup_class(cls):
        cls.email = _new_email()
        cls.pw = "StrongPass123"
        r = devmail.register(f"{BASE_URL}/api", json={"name": "Login User", "email": cls.email, "password": cls.pw})
        assert r.status_code == 200
        cls.register_token = r.json()["session_token"]

    def test_login_success_case_insensitive(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": self.email.upper(), "password": self.pw})
        assert r.status_code == 200, r.text
        d = r.json()
        assert "session_token" in d
        assert d["user"]["email"] == self.email  # normalized to lower on store
        assert "password_hash" not in d["user"]
        # token works on /me
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=_headers(d["session_token"]))
        assert me.status_code == 200
        assert me.json()["user_id"] == d["user"]["user_id"]

    def test_login_wrong_password_401(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": self.email, "password": "WrongPassword9"})
        assert r.status_code == 401


# ------------------ Reset ------------------
class TestReset:
    def setup_class(cls):
        cls.email = _new_email()
        cls.pw = "StrongPass123"
        r = devmail.register(f"{BASE_URL}/api", json={"name": "Reset Jan", "email": cls.email, "password": cls.pw})
        assert r.status_code == 200
        cls.old_token = r.json()["session_token"]

    @staticmethod
    def _read_code(email: str) -> str:
        return devmail.latest_code(email, "reset")

    def test_request_reset_generic_message_known(self):
        r = requests.post(f"{BASE_URL}/api/auth/request-reset", json={"email": self.email})
        assert r.status_code == 200
        assert "reset code" in r.json()["message"].lower()

    def test_request_reset_generic_message_unknown(self):
        r = requests.post(f"{BASE_URL}/api/auth/request-reset",
                          json={"email": f"unknown_{uuid.uuid4().hex[:6]}@example.com"})
        assert r.status_code == 200
        assert "reset code" in r.json()["message"].lower()

    def test_wrong_code_400(self):
        # request a code first
        requests.post(f"{BASE_URL}/api/auth/request-reset", json={"email": self.email})
        time.sleep(0.3)
        r = requests.post(f"{BASE_URL}/api/auth/reset-password",
                          json={"email": self.email, "code": "000000", "new_password": "AnotherPw9"})
        assert r.status_code == 400

    def test_reset_then_old_sessions_revoked(self):
        requests.post(f"{BASE_URL}/api/auth/request-reset", json={"email": self.email})
        time.sleep(0.5)
        code = self._read_code(self.email)
        assert code, "Reset code not found in backend.err.log"
        new_pw = "NoweHaslo123"
        r = requests.post(f"{BASE_URL}/api/auth/reset-password",
                          json={"email": self.email, "code": code, "new_password": new_pw})
        assert r.status_code == 200, r.text
        new_token = r.json()["session_token"]
        # Old token invalid
        me_old = requests.get(f"{BASE_URL}/api/auth/me", headers=_headers(self.old_token))
        assert me_old.status_code == 401
        # New token works
        me_new = requests.get(f"{BASE_URL}/api/auth/me", headers=_headers(new_token))
        assert me_new.status_code == 200
        # Login with new password works
        li = requests.post(f"{BASE_URL}/api/auth/login",
                           json={"email": self.email, "password": new_pw})
        assert li.status_code == 200


# ------------------ Logout + onboarded flag ------------------
class TestLogoutAndOnboarded:
    def test_logout_invalidates_token(self):
        email = _new_email()
        r = devmail.register(f"{BASE_URL}/api", json={"name": "LogoutUser", "email": email, "password": "StrongPass123"})
        tok = r.json()["session_token"]
        assert requests.get(f"{BASE_URL}/api/auth/me", headers=_headers(tok)).status_code == 200
        lo = requests.post(f"{BASE_URL}/api/auth/logout", headers=_headers(tok))
        assert lo.status_code == 200
        assert requests.get(f"{BASE_URL}/api/auth/me", headers=_headers(tok)).status_code == 401

    def test_profile_accepts_onboarded_true(self):
        email = _new_email()
        r = devmail.register(f"{BASE_URL}/api", json={"name": "OnboardUser", "email": email, "password": "StrongPass123"})
        tok = r.json()["session_token"]
        assert r.json()["user"].get("onboarded") is False
        pr = requests.put(f"{BASE_URL}/api/profile", headers=_headers(tok),
                          json={"onboarded": True, "employer": "TestCo", "job_title": "Picker"})
        assert pr.status_code == 200, pr.text
        d = pr.json()
        assert d.get("onboarded") is True
        assert d.get("employer") == "TestCo"
        assert "password_hash" not in d
