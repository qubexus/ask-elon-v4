import os, uuid, pytest, requests
import devmail  # noqa: E402  (confirms test accounts via the dev e-mail outbox)

# Tests run against a locally started backend (see README: "Testy").
BASE_URL = (os.environ.get('TEST_BASE_URL') or 'http://localhost:8001').rstrip('/')


def _bootstrap_token() -> str:
    """Registers a fresh test user with a complete profile and returns its session token."""
    try:
        r = devmail.register(f"{BASE_URL}/api", timeout=10, json={
            "name": "Test User", "email": f"pytest_{uuid.uuid4().hex[:8]}@example.com", "password": "TestPass123!"})
        r.raise_for_status()
        tok = r.json()["session_token"]
        requests.put(f"{BASE_URL}/api/profile", timeout=10, headers={"Authorization": f"Bearer {tok}"}, json={
            "name": "Test User", "address": "1 Test St, London", "phone": "+44 7700 900000", "employer": "Test Ltd",
            "industry": "Logistics", "job_title": "Operative", "contract_type": "zero_hours", "start_date": "2024-01-01",
            "workplace_address": "2 Test Rd, London", "onboarded": True})
        return tok
    except Exception:
        return "server_not_running"


TOKEN = _bootstrap_token()


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL

@pytest.fixture(scope="session")
def auth_headers():
    return {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s
