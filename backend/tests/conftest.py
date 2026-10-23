import os, pytest, requests
BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://start-project-33.preview.emergentagent.com').rstrip('/')
TOKEN = "test_session_token_123"

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
