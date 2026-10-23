"""UNION Elon backend API tests"""
import json, pytest, requests, os
from conftest import BASE_URL, TOKEN

AUTH = {"Authorization": f"Bearer {TOKEN}"}


# ---------------- Auth ----------------
class TestAuth:
    def test_me_without_token(self):
        r = requests.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401

    def test_me_with_token(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=AUTH)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user_id"] == "user_test1"
        assert "email" in data


# ---------------- Profile ----------------
class TestProfile:
    def test_update_profile(self):
        r = requests.put(f"{BASE_URL}/api/profile", headers=AUTH,
                         json={"name": "Jan Test", "employer": "TestCo", "job_title": "Picker", "locale": "en"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == "Jan Test"
        assert d["locale"] == "en"

    def test_invalid_locale(self):
        r = requests.put(f"{BASE_URL}/api/profile", headers=AUTH, json={"locale": "fr"})
        assert r.status_code == 400


# ---------------- Cases ----------------
class TestCases:
    created_id = None

    def test_list_cases(self):
        r = requests.get(f"{BASE_URL}/api/cases", headers=AUTH)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_case(self):
        r = requests.post(f"{BASE_URL}/api/cases", headers=AUTH,
                          json={"title": "TEST_case", "description": "test desc", "sector": "Logistics"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["title"] == "TEST_case"
        assert d["status"] == "open"
        TestCases.created_id = d["case_id"]

    def test_get_case(self):
        assert TestCases.created_id
        r = requests.get(f"{BASE_URL}/api/cases/{TestCases.created_id}", headers=AUTH)
        assert r.status_code == 200
        assert r.json()["case_id"] == TestCases.created_id

    def test_patch_status_resolved(self):
        r = requests.patch(f"{BASE_URL}/api/cases/{TestCases.created_id}",
                           headers=AUTH, json={"status": "resolved"})
        assert r.status_code == 200
        assert r.json()["status"] == "resolved"

    def test_patch_invalid_status(self):
        r = requests.patch(f"{BASE_URL}/api/cases/{TestCases.created_id}",
                           headers=AUTH, json={"status": "nope"})
        assert r.status_code == 400

    def test_case_not_found(self):
        r = requests.get(f"{BASE_URL}/api/cases/case_doesnotexist", headers=AUTH)
        assert r.status_code == 404


# ---------------- Templates ----------------
class TestTemplates:
    def test_templates_12(self):
        r = requests.get(f"{BASE_URL}/api/templates")
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d, list)
        assert len(d) == 12, f"Expected 12 templates, got {len(d)}"
        t = d[0]
        for k in ("id", "fields", "letter"):
            assert k in t
        # placeholder check
        assert "{" in t["letter"] and "}" in t["letter"]


# ---------------- Chat ----------------
class TestChat:
    def test_clear_chat(self):
        r = requests.delete(f"{BASE_URL}/api/chat/messages?thread_id=main", headers=AUTH)
        assert r.status_code == 200

    def test_messages_empty(self):
        r = requests.get(f"{BASE_URL}/api/chat/messages?thread_id=main", headers=AUTH)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_chat_stream(self):
        # SSE streaming
        with requests.post(f"{BASE_URL}/api/chat/stream",
                           headers={**AUTH, "Content-Type": "application/json"},
                           json={"text": "Hello Elon, what is minimum wage?", "thread_id": "main"},
                           stream=True, timeout=60) as r:
            assert r.status_code == 200
            got_delta = False
            got_done = False
            for raw in r.iter_lines(decode_unicode=True):
                if not raw:
                    continue
                if raw.startswith("data: "):
                    payload = json.loads(raw[6:])
                    if "delta" in payload:
                        got_delta = True
                    if payload.get("done"):
                        got_done = True
                        break
                    if "error" in payload:
                        pytest.fail(f"LLM error: {payload['error']}")
            assert got_delta, "No delta events from SSE stream"
            assert got_done, "No done event from SSE stream"

    def test_messages_persisted(self):
        r = requests.get(f"{BASE_URL}/api/chat/messages?thread_id=main", headers=AUTH)
        assert r.status_code == 200
        msgs = r.json()
        assert len(msgs) >= 2
        roles = [m["role"] for m in msgs]
        assert "user" in roles and "assistant" in roles


# ---------------- Payments ----------------
class TestPayments:
    sub_id = None
    approve_url = None

    def test_plans(self):
        r = requests.get(f"{BASE_URL}/api/payments/plans", headers=AUTH)
        assert r.status_code == 200
        d = r.json()
        assert d["configured"] is True
        assert d["price"] == "9.90"
        assert d["currency"] == "GBP"

    def test_subscribe(self):
        r = requests.post(f"{BASE_URL}/api/payments/subscribe", headers=AUTH,
                          json={"app_redirect": "https://start-project-33.preview.emergentagent.com/"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert "approve_url" in d
        assert "sandbox.paypal.com" in d["approve_url"]
        TestPayments.sub_id = d["subscription_id"]
        TestPayments.approve_url = d["approve_url"]

    def test_verify_unapproved(self):
        assert TestPayments.sub_id
        r = requests.post(f"{BASE_URL}/api/payments/subscriptions/{TestPayments.sub_id}/verify", headers=AUTH)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "APPROVAL_PENDING"

    def test_return_html(self):
        r = requests.get(f"{BASE_URL}/api/payments/return",
                        params={"redirect": "https://example.com/app", "cancelled": "1"},
                        allow_redirects=False)
        assert r.status_code == 200
        assert "text/html" in r.headers.get("content-type", "")
        assert "payment=cancelled" in r.text

    def test_cancel_no_active(self):
        r = requests.post(f"{BASE_URL}/api/payments/cancel", headers=AUTH)
        assert r.status_code == 404
