"""Test helper: reads one-time codes the dev server "sent" and registers confirmed test accounts.

The local test server runs with APP_ENV=development and MAIL_BACKEND=outbox, so every e-mail lands as a
JSON file in MAIL_OUTBOX_DIR. Without the outbox, the dev server writes codes to its log (TEST_BACKEND_LOG).
Never used against production (outbox is refused there and codes are never logged).
"""
import glob, json, os, re, time
import requests

OUTBOX = os.environ.get("MAIL_OUTBOX_DIR", "")
LOG = os.environ.get("TEST_BACKEND_LOG", "/tmp/ae-backend.log")


def latest_code(email: str, kind: str = "verify", timeout: float = 6.0, after: float = 0.0) -> str:
    """Newest code of `kind` ("verify" / "reset") e-mailed to `email`; "" if none arrived in time."""
    email = email.strip().lower()
    deadline = time.time() + timeout
    while True:
        if OUTBOX and os.path.isdir(OUTBOX):
            for f in sorted(glob.glob(os.path.join(OUTBOX, "*.json")), reverse=True):
                if after and os.path.getmtime(f) < after:
                    break
                try:
                    m = json.load(open(f))
                except Exception:
                    continue
                if m.get("to", "").lower() == email and m.get("kind") == kind:
                    return m["code"]
        elif os.path.exists(LOG):
            pat = re.compile(rf"{kind.upper()} CODE for {re.escape(email)}: (\d{{6}})")
            for ln in reversed(open(LOG, errors="ignore").readlines()[-2000:]):
                hit = pat.search(ln)
                if hit:
                    return hit.group(1)
        if time.time() > deadline:
            return ""
        time.sleep(0.15)


def register(api: str, json=None, timeout: float = 15, **kw) -> requests.Response:
    """POST /auth/register and confirm the e-mail with the code from the outbox.
    Returns the /auth/verify-email response (200 with session_token + user), or the register error as is."""
    started = time.time() - 1
    r = requests.post(f"{api}/auth/register", json=json, timeout=timeout, **kw)
    if r.status_code != 200 or not r.json().get("verification_required"):
        return r
    code = latest_code(json["email"], "verify", after=started)
    assert code, f"no verification code for {json['email']} in the dev outbox"
    return requests.post(f"{api}/auth/verify-email", json={"email": json["email"], "code": code}, timeout=timeout)
