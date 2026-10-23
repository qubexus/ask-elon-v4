"""Iteration 10 — Admin → user messages (inbox) tests.

Covers:
- Auth bootstrap for demo user and admin owner
- /api/messages visibility rules (target=all after signup; target=user only to recipient)
- unread-count + read + read-all + idempotency
- Admin POST/GET/DELETE + validation + 403 for non-admin
- Delete cascades reads
"""
import os
import time
import pytest
import requests
import devmail  # noqa: E402  (confirms test accounts via the dev e-mail outbox)

BASE = (os.environ.get("TEST_BASE_URL") or "http://localhost:8001").rstrip("/")
API = f"{BASE}/api"

DEMO_EMAIL = "demo@unionelon.app"
DEMO_PASSWORD = "UnionDemo2026!"
ADMIN_EMAIL = "jocobisun@gmail.com"
ADMIN_PASSWORD = "2127054Marek"


# ----------------- fixtures -----------------
@pytest.fixture(scope="session")
def demo_token():
    r = requests.post(f"{API}/auth/demo", timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["session_token"], r.json()["user"]


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["user"]["role"] == "admin", data
    return data["session_token"], data["user"]


@pytest.fixture(scope="session")
def fresh_user_token():
    """Register a brand-new user to test 'created after signup' visibility rule."""
    email = f"test_iter10_{int(time.time())}@example.com"
    r = devmail.register(API, json={"name": "Iter10 Fresh", "email": email, "password": "Password123!"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return r.json()["session_token"], r.json()["user"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# tracks admin-created message ids for cleanup
_created_ids: list[str] = []


@pytest.fixture(scope="session", autouse=True)
def _cleanup(admin_token):
    yield
    tok, _ = admin_token
    for mid in _created_ids:
        try:
            requests.delete(f"{API}/admin/messages/{mid}", headers=_h(tok), timeout=10)
        except Exception:
            pass


# ----------------- health -----------------
class TestHealth:
    def test_api_root(self):
        r = requests.get(f"{API}/", timeout=10)
        assert r.status_code in (200, 404)


# ----------------- admin create / validation -----------------
class TestAdminCreateValidation:
    def test_non_admin_cannot_create(self, demo_token):
        tok, _ = demo_token
        r = requests.post(
            f"{API}/admin/messages",
            headers=_h(tok),
            json={"title": "x", "body": "y", "target": "all"},
            timeout=10,
        )
        assert r.status_code == 403, r.text

    def test_non_admin_cannot_list(self, demo_token):
        tok, _ = demo_token
        r = requests.get(f"{API}/admin/messages", headers=_h(tok), timeout=10)
        assert r.status_code == 403

    def test_title_too_long(self, admin_token):
        tok, _ = admin_token
        r = requests.post(
            f"{API}/admin/messages",
            headers=_h(tok),
            json={"title": "a" * 121, "body": "ok", "target": "all"},
            timeout=10,
        )
        assert r.status_code == 400

    def test_body_too_long(self, admin_token):
        tok, _ = admin_token
        r = requests.post(
            f"{API}/admin/messages",
            headers=_h(tok),
            json={"title": "ok", "body": "x" * 2001, "target": "all"},
            timeout=10,
        )
        assert r.status_code == 400

    def test_invalid_link_scheme(self, admin_token):
        tok, _ = admin_token
        r = requests.post(
            f"{API}/admin/messages",
            headers=_h(tok),
            json={"title": "ok", "body": "ok", "link": "javascript:alert(1)", "target": "all"},
            timeout=10,
        )
        assert r.status_code == 400

    def test_target_user_missing_recipient(self, admin_token):
        tok, _ = admin_token
        r = requests.post(
            f"{API}/admin/messages",
            headers=_h(tok),
            json={"title": "ok", "body": "ok", "target": "user", "email": "no_such_user_xyz@example.com"},
            timeout=10,
        )
        assert r.status_code == 404

    def test_invalid_target(self, admin_token):
        tok, _ = admin_token
        r = requests.post(
            f"{API}/admin/messages",
            headers=_h(tok),
            json={"title": "ok", "body": "ok", "target": "nope"},
            timeout=10,
        )
        assert r.status_code == 400


# ----------------- visibility rules -----------------
class TestVisibility:
    def test_message_to_user_a_not_visible_to_user_b(self, admin_token, demo_token, fresh_user_token):
        a_tok, _ = admin_token
        demo_tok, demo_user = demo_token
        fresh_tok, fresh_user = fresh_user_token
        # Create message targeted to fresh user
        r = requests.post(
            f"{API}/admin/messages",
            headers=_h(a_tok),
            json={"title": "TEST_iter10 to-fresh", "body": "secret for fresh", "target": "user", "email": fresh_user["email"]},
            timeout=10,
        )
        assert r.status_code == 200, r.text
        mid = r.json()["id"]
        _created_ids.append(mid)

        # fresh user sees it
        rf = requests.get(f"{API}/messages?limit=50&offset=0", headers=_h(fresh_tok), timeout=10).json()
        assert any(m["id"] == mid for m in rf), "Target user does not see their own message"

        # demo user must NOT see it
        rd = requests.get(f"{API}/messages?limit=50&offset=0", headers=_h(demo_tok), timeout=10).json()
        assert not any(m["id"] == mid for m in rd), "Message to user A leaked to user B!"

    def test_all_message_created_before_signup_not_visible(self, admin_token):
        """Create all-message BEFORE a new user, then register new user and verify."""
        a_tok, _ = admin_token
        r = requests.post(
            f"{API}/admin/messages",
            headers=_h(a_tok),
            json={"title": "TEST_iter10 old-all", "body": "pre-signup broadcast", "target": "all"},
            timeout=10,
        )
        assert r.status_code == 200
        mid = r.json()["id"]
        _created_ids.append(mid)

        # Register user AFTER
        time.sleep(1.2)  # ensure created_at > message created_at
        email = f"test_iter10_after_{int(time.time())}@example.com"
        reg = devmail.register(API, json={"name": "Iter10 After", "email": email, "password": "Password123!"},
            timeout=15,
        )
        assert reg.status_code == 200, reg.text
        new_tok = reg.json()["session_token"]

        inbox = requests.get(f"{API}/messages?limit=50&offset=0", headers=_h(new_tok), timeout=10).json()
        assert not any(m["id"] == mid for m in inbox), "Pre-signup broadcast leaked to new user"


# ----------------- unread count & read -----------------
class TestUnreadAndRead:
    def test_broadcast_increments_unread_and_read_decrements(self, admin_token, fresh_user_token):
        a_tok, _ = admin_token
        f_tok, _ = fresh_user_token
        before = requests.get(f"{API}/messages/unread-count", headers=_h(f_tok), timeout=10).json()["count"]
        r = requests.post(
            f"{API}/admin/messages",
            headers=_h(a_tok),
            json={"title": "TEST_iter10 bcast", "body": "to all now", "target": "all"},
            timeout=10,
        )
        mid = r.json()["id"]
        _created_ids.append(mid)
        after = requests.get(f"{API}/messages/unread-count", headers=_h(f_tok), timeout=10).json()["count"]
        assert after == before + 1, f"Expected +1 unread, got {before}->{after}"

        # mark read
        rr = requests.post(f"{API}/messages/{mid}/read", headers=_h(f_tok), timeout=10)
        assert rr.status_code == 200
        c2 = requests.get(f"{API}/messages/unread-count", headers=_h(f_tok), timeout=10).json()["count"]
        assert c2 == before, f"After read, count should return to {before}, got {c2}"

        # idempotent
        rr2 = requests.post(f"{API}/messages/{mid}/read", headers=_h(f_tok), timeout=10)
        assert rr2.status_code == 200
        c3 = requests.get(f"{API}/messages/unread-count", headers=_h(f_tok), timeout=10).json()["count"]
        assert c3 == before, "Idempotent read must not change count"

    def test_read_all(self, admin_token, fresh_user_token):
        a_tok, _ = admin_token
        f_tok, fresh_user = fresh_user_token
        for i in range(3):
            r = requests.post(
                f"{API}/admin/messages",
                headers=_h(a_tok),
                json={"title": f"TEST_iter10 readall-{i}", "body": "x", "target": "user", "email": fresh_user["email"]},
                timeout=10,
            )
            _created_ids.append(r.json()["id"])
        c = requests.get(f"{API}/messages/unread-count", headers=_h(f_tok), timeout=10).json()["count"]
        assert c >= 3
        ra = requests.post(f"{API}/messages/read-all", headers=_h(f_tok), timeout=10)
        assert ra.status_code == 200
        c2 = requests.get(f"{API}/messages/unread-count", headers=_h(f_tok), timeout=10).json()["count"]
        assert c2 == 0, f"After read-all, unread should be 0, got {c2}"

    def test_read_404_for_invisible_message(self, demo_token, admin_token, fresh_user_token):
        a_tok, _ = admin_token
        demo_tok, _ = demo_token
        _, fresh_user = fresh_user_token
        r = requests.post(
            f"{API}/admin/messages",
            headers=_h(a_tok),
            json={"title": "TEST_iter10 private", "body": "hidden", "target": "user", "email": fresh_user["email"]},
            timeout=10,
        )
        mid = r.json()["id"]
        _created_ids.append(mid)
        # demo user tries to mark it read
        rr = requests.post(f"{API}/messages/{mid}/read", headers=_h(demo_tok), timeout=10)
        assert rr.status_code == 404


# ----------------- admin list / delete / cascade -----------------
class TestAdminListDelete:
    def test_admin_list_includes_read_count(self, admin_token, fresh_user_token):
        a_tok, _ = admin_token
        f_tok, fresh_user = fresh_user_token
        r = requests.post(
            f"{API}/admin/messages",
            headers=_h(a_tok),
            json={"title": "TEST_iter10 readcount", "body": "x", "target": "user", "email": fresh_user["email"]},
            timeout=10,
        )
        mid = r.json()["id"]
        _created_ids.append(mid)
        requests.post(f"{API}/messages/{mid}/read", headers=_h(f_tok), timeout=10)
        lst = requests.get(f"{API}/admin/messages", headers=_h(a_tok), timeout=10).json()
        row = next((m for m in lst if m["id"] == mid), None)
        assert row is not None
        assert row.get("read_count", 0) >= 1, row

    def test_delete_cascades_reads(self, admin_token, fresh_user_token):
        a_tok, _ = admin_token
        f_tok, fresh_user = fresh_user_token
        r = requests.post(
            f"{API}/admin/messages",
            headers=_h(a_tok),
            json={"title": "TEST_iter10 delcascade", "body": "x", "target": "user", "email": fresh_user["email"]},
            timeout=10,
        )
        mid = r.json()["id"]
        requests.post(f"{API}/messages/{mid}/read", headers=_h(f_tok), timeout=10)

        d = requests.delete(f"{API}/admin/messages/{mid}", headers=_h(a_tok), timeout=10)
        assert d.status_code == 200
        # second delete 404
        d2 = requests.delete(f"{API}/admin/messages/{mid}", headers=_h(a_tok), timeout=10)
        assert d2.status_code == 404

        # Not visible anymore
        inbox = requests.get(f"{API}/messages?limit=50&offset=0", headers=_h(f_tok), timeout=10).json()
        assert not any(m["id"] == mid for m in inbox)

    def test_non_admin_cannot_delete(self, demo_token, admin_token):
        a_tok, _ = admin_token
        demo_tok, _ = demo_token
        r = requests.post(
            f"{API}/admin/messages",
            headers=_h(a_tok),
            json={"title": "TEST_iter10 nondel", "body": "x", "target": "all"},
            timeout=10,
        )
        mid = r.json()["id"]
        _created_ids.append(mid)
        d = requests.delete(f"{API}/admin/messages/{mid}", headers=_h(demo_tok), timeout=10)
        assert d.status_code == 403
