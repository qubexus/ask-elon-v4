"""In-process isolation suite: the real FastAPI app + a THROWAWAY local MongoDB database.

- DB name must end in "_test" (default ask_elon_izolacja_test); it is dropped before and after the run.
- Never points at ask_elon_live or a remote server: MONGO_URL must be localhost.
- E-mails go to a temporary dev outbox (MAIL_BACKEND=outbox, only allowed with APP_ENV=development).
Run:  cd backend && python -m pytest -n 0 tests_isolation
"""
import os
import sys
import tempfile
from pathlib import Path

DB = os.environ.get("ISOLATION_DB_NAME", "ask_elon_izolacja_test")
MONGO = os.environ.get("ISOLATION_MONGO_URL", "mongodb://127.0.0.1:27017")
assert DB.endswith("_test") and "live" not in DB, "isolation tests only run on a throwaway *_test database"
assert "127.0.0.1" in MONGO or "localhost" in MONGO, "isolation tests only run against a local MongoDB"
TMP = Path(tempfile.mkdtemp(prefix="ae-isolation-"))
os.environ.update({
    "APP_ENV": "development", "DB_NAME": DB, "MONGO_URL": MONGO, "DISABLE_RATE_LIMIT": "1",
    "JWT_SECRET": "isolation-test-secret-" + os.urandom(16).hex(), "STORAGE_BACKEND": "local",
    "UPLOAD_DIR": str(TMP / "uploads"), "MAIL_BACKEND": "outbox", "MAIL_OUTBOX_DIR": str(TMP / "outbox"),
    "ADMIN_EMAILS": "admin-test@example.com", "GEMINI_API_KEY": "", "OPENAI_API_KEY": "", "SMTP_HOST": "",
    "GOOGLE_CLIENT_IDS": "isolation-test-client",
})
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pymongo  # noqa: E402
import pytest  # noqa: E402

try:
    pymongo.MongoClient(MONGO, serverSelectionTimeoutMS=1500).admin.command("ping")
    MONGO_OK = True
except Exception:
    MONGO_OK = False


def pytest_collection_modifyitems(config, items):
    if not MONGO_OK:
        skip = pytest.mark.skip(reason="local MongoDB not reachable")
        for it in items:
            if "static" not in it.nodeid:
                it.add_marker(skip)


@pytest.fixture(scope="session")
def mdb():
    c = pymongo.MongoClient(MONGO)
    c.drop_database(DB)
    yield c[DB]
    c.drop_database(DB)
    c.close()


@pytest.fixture(scope="session")
def app_client(mdb):
    from fastapi.testclient import TestClient
    import server
    with TestClient(server.app) as c:
        yield c
