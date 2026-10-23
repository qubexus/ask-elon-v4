"""RevenueCat sandbox check – shows what the server would store for a given app_user_id.

Uses REVENUECAT_SECRET_KEY / REVENUECAT_PROJECT_ID / REVENUECAT_ENTITLEMENT_ID from the environment or backend/.env.
Never prints the key. Sandbox purchases are counted (REVENUECAT_ALLOW_SANDBOX forced to 1 for this check).

  cd backend
  ../venv/bin/python scripts/revenuecat_sandbox_test.py user_123abc   # app_user_id = our user_id
  ../venv/bin/python scripts/revenuecat_sandbox_test.py --webhook https://app.askelon.uk   # webhook auth check

Steps for a full sandbox test: see docs/REVENUECAT-SETUP-PL.md, section "Test w trybie sandbox".
"""
import asyncio
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
except ImportError:
    pass
os.environ["REVENUECAT_ALLOW_SANDBOX"] = "1"

import httpx  # noqa: E402

import billing_revenuecat as billing  # noqa: E402


async def check_user(uid: str) -> int:
    if not billing.configured():
        print("BRAK klucza: ustaw REVENUECAT_SECRET_KEY (backend/.env albo zmienna środowiskowa).")
        return 2
    print(f"RevenueCat REST API {billing.api_version()}, entitlement '{billing.entitlement_id()}', app_user_id {uid}")
    try:
        st = await billing.fetch_status(uid)
    except billing.RevenueCatError as e:
        print(f"BŁĄD: {e} (401/403 = zły klucz lub brak uprawnień; 404 w v1 nie występuje)")
        return 1
    for k in ("active", "product_id", "store", "environment", "expires_at"):
        print(f"  {k:12} {st.get(k)}")
    print("WYNIK:", "PRO aktywne" if st["active"] else "brak aktywnego PRO")
    return 0 if st["active"] else 3


async def check_webhook(base: str) -> int:
    url = base.rstrip("/") + "/api/billing/revenuecat/webhook"
    auth = os.environ.get("REVENUECAT_WEBHOOK_AUTH") or ""
    async with httpx.AsyncClient(timeout=15) as hc:
        bad = await hc.post(url, json={"event": {"type": "TEST"}}, headers={"Authorization": "wrong"})
        print(f"zły nagłówek  -> HTTP {bad.status_code} (oczekiwane 401)")
        if auth:
            ok = await hc.post(url, json={"event": {"id": "manual-test", "type": "TEST", "app_user_id": "nobody"}},
                               headers={"Authorization": auth})
            print(f"dobry nagłówek -> HTTP {ok.status_code} (oczekiwane 200)")
            return 0 if bad.status_code == 401 and ok.status_code == 200 else 1
    print("REVENUECAT_WEBHOOK_AUTH nie ustawiony lokalnie – sprawdzono tylko odrzucanie.")
    return 0 if bad.status_code == 401 else 1


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--webhook":
        sys.exit(asyncio.run(check_webhook(sys.argv[2])))
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(64)
    sys.exit(asyncio.run(check_user(sys.argv[1])))
