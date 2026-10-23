"""Unit tests for employer address lookup – all HTTP is mocked, no network, no real database.

Run:  cd backend && python -m pytest tests_unit -n 0
(DB_NAME is forced to a throw-away name before the server is imported; nothing is written to it.)
"""
import asyncio
import os

os.environ["DB_NAME"] = "ask_elon_unit_lookup"  # never the live DB
os.environ.setdefault("JWT_SECRET", "unit-test-secret-unit-test-secret-1234")

import httpx  # noqa: E402
import pytest  # noqa: E402

import lookup  # noqa: E402

PC_OK = {"status": 200, "result": {"postcode": "PE1 1XX", "latitude": 52.571877, "longitude": -0.238614,
                                   "admin_district": "Peterborough", "region": "East of England", "country": "England"}}
PHOTON = {"features": [
    {"geometry": {"coordinates": [-0.2390, 52.5720]}, "properties": {"osm_type": "N", "osm_id": 1, "name": "Greggs", "osm_key": "amenity",
     "osm_value": "fast_food", "housenumber": "27", "street": "Bridge Street", "city": "Peterborough", "postcode": "pe11hj"}},
    {"geometry": {"coordinates": [-0.2387, 52.5719]}, "properties": {"osm_type": "N", "osm_id": 2, "name": "Car Park", "osm_key": "amenity", "osm_value": "parking"}},
    {"geometry": {"coordinates": [-0.2388, 52.5719]}, "properties": {"osm_type": "W", "osm_id": 3, "name": "Acme Warehouse", "osm_key": "building", "osm_value": "warehouse"}},
    {"geometry": {"coordinates": [-0.30, 52.60]}, "properties": {"osm_type": "N", "osm_id": 4, "name": "Far Away Ltd", "osm_key": "office", "osm_value": "company"}},
]}
CH_OK = {"company_name": "GREENCORE FOOD TO GO LIMITED", "company_number": "01234567", "company_status": "active",
         "registered_office_address": {"premises": "Unit 1", "address_line_1": "Sandy Lane", "locality": "Worksop", "postal_code": "S80 3EY", "country": "England"}}


def run(coro):
    return asyncio.run(coro)


def client_with(handler):
    return lookup.new_client(httpx.MockTransport(handler))


@pytest.fixture(autouse=True)
def _reset():
    lookup.cache.clear()
    lookup._down_until.clear()
    os.environ.pop("COMPANIES_HOUSE_API_KEY", None)
    yield


def test_normalise_postcode():
    assert lookup.normalise_postcode("sw1a1aa") == "SW1A 1AA"
    assert lookup.normalise_postcode(" m1 1ae ") == "M1 1AE"
    assert lookup.normalise_postcode("B9-4AA") == "B9 4AA"
    for bad in ["", "hello", "12345", "SW1A", "AA1 1A"]:
        assert lookup.normalise_postcode(bad) is None


def test_normalise_company_number():
    assert lookup.normalise_company_number("1234567") == "01234567"
    assert lookup.normalise_company_number("sc 123456") == "SC123456"
    assert lookup.normalise_company_number("SC12345") == "SC012345"
    assert lookup.normalise_company_number("OC301234") == "OC301234"
    for bad in ["", "ABC", "123456789", "SC1234567"]:
        assert lookup.normalise_company_number(bad) is None


def test_invalid_postcode_makes_no_http_call():
    calls = []
    async def go():
        async with client_with(lambda r: calls.append(r) or httpx.Response(200)) as c:
            await lookup.nearby_businesses(c, "not a postcode")
    with pytest.raises(lookup.LookupError_) as e:
        run(go())
    assert e.value.code == "invalid_postcode" and e.value.status == 400 and not calls


def test_postcode_not_found():
    async def go():
        async with client_with(lambda r: httpx.Response(404, json={"status": 404, "error": "Postcode not found"})) as c:
            await lookup.nearby_businesses(c, "ZZ99 9ZZ")
    with pytest.raises(lookup.LookupError_) as e:
        run(go())
    assert e.value.code == "postcode_not_found"


def test_nearby_photon_filters_fills_and_caches():
    calls = []
    def h(req):
        calls.append(req)
        if "postcodes" in req.url.path:
            return httpx.Response(200, json=PC_OK)
        assert req.headers["user-agent"].startswith("AskElon")
        assert "osm_tag" in str(req.url)
        return httpx.Response(200, json=PHOTON)
    async def go():
        async with client_with(h) as c:
            a = await lookup.nearby_businesses(c, "pe11xx")
            b = await lookup.nearby_businesses(c, "PE1 1XX")
            return a, b
    a, b = run(go())
    names = [x["name"] for x in a["results"]]
    assert names == ["Acme Warehouse", "Greggs"]  # parking + far-away removed, sorted by distance
    g = a["results"][1]
    assert g["postcode"] == "PE1 1HJ" and g["address"] == "27 Bridge Street, Peterborough, PE1 1HJ"
    w = a["results"][0]
    assert w["postcode"] == "PE1 1XX" and w["postcode_guessed"] and w["town"] == "Peterborough"
    assert a["provider"] == "photon" and b == a and len(calls) == 2  # second call from cache


def test_nearby_no_results():
    def h(req):
        return httpx.Response(200, json=PC_OK) if "postcodes" in req.url.path else httpx.Response(200, json={"features": []})
    async def go():
        async with client_with(h) as c:
            return await lookup.nearby_businesses(c, "PE1 1XX")
    r = run(go())
    assert r["results"] == []


def test_photon_down_falls_back_to_overpass():
    def h(req):
        if "postcodes" in req.url.path:
            return httpx.Response(200, json=PC_OK)
        if "photon" in req.url.host:
            raise httpx.ConnectTimeout("timeout")
        return httpx.Response(200, json={"elements": [
            {"type": "node", "id": 9, "lat": 52.5720, "lon": -0.2387, "tags": {"name": "Polski Sklep", "shop": "convenience", "addr:street": "Lincoln Road"}}]})
    async def go():
        async with client_with(h) as c:
            return await lookup.nearby_businesses(c, "PE1 1XX")
    r = run(go())
    assert r["provider"] == "overpass" and r["results"][0]["name"] == "Polski Sklep"
    assert r["results"][0]["address"] == "Lincoln Road, Peterborough, PE1 1XX"


def test_all_map_services_down():
    def h(req):
        if "postcodes" in req.url.path:
            return httpx.Response(200, json=PC_OK)
        if "photon" in req.url.host:
            return httpx.Response(500)
        return httpx.Response(504)
    async def go():
        async with client_with(h) as c:
            await lookup.nearby_businesses(c, "PE1 1XX")
    with pytest.raises(lookup.LookupError_) as e:
        run(go())
    assert e.value.code == "unavailable" and e.value.status == 502


def test_photon_rate_limited():
    def h(req):
        if "postcodes" in req.url.path:
            return httpx.Response(200, json=PC_OK)
        return httpx.Response(429)
    async def go():
        async with client_with(h) as c:
            await lookup.nearby_businesses(c, "PE1 1XX")
    with pytest.raises(lookup.LookupError_) as e:
        run(go())
    assert e.value.code == "rate_limited" and e.value.status == 429


def test_postcode_service_timeout():
    def h(req):
        raise httpx.ReadTimeout("slow")
    async def go():
        async with client_with(h) as c:
            await lookup.nearby_businesses(c, "PE1 1XX")
    with pytest.raises(lookup.LookupError_) as e:
        run(go())
    assert e.value.code == "unavailable"


def test_company_not_configured_without_key():
    async def go():
        async with client_with(lambda r: httpx.Response(200, json=CH_OK)) as c:
            await lookup.company_by_number(c, "01234567")
    with pytest.raises(lookup.LookupError_) as e:
        run(go())
    assert e.value.code == "not_configured" and e.value.status == 503


def test_company_invalid_number():
    os.environ["COMPANIES_HOUSE_API_KEY"] = "k"
    async def go():
        async with client_with(lambda r: httpx.Response(200)) as c:
            await lookup.company_by_number(c, "ABC")
    with pytest.raises(lookup.LookupError_) as e:
        run(go())
    assert e.value.code == "invalid_company_number"


def test_company_ok_uses_basic_auth():
    os.environ["COMPANIES_HOUSE_API_KEY"] = "secret-key"
    seen = {}
    def h(req):
        seen["auth"] = req.headers.get("authorization")
        seen["path"] = req.url.path
        return httpx.Response(200, json=CH_OK)
    async def go():
        async with client_with(h) as c:
            return await lookup.company_by_number(c, "1234567")
    r = run(go())
    assert seen["path"] == "/company/01234567" and seen["auth"].startswith("Basic ")
    assert r["name"] == "GREENCORE FOOD TO GO LIMITED" and r["postcode"] == "S80 3EY"
    assert r["address"] == "Unit 1 Sandy Lane, Worksop, S80 3EY" and r["registered_office"]


@pytest.mark.parametrize("status,code", [(404, "company_not_found"), (401, "not_configured"), (429, "rate_limited"), (500, "unavailable")])
def test_company_errors(status, code):
    os.environ["COMPANIES_HOUSE_API_KEY"] = "k"
    async def go():
        async with client_with(lambda r: httpx.Response(status, json={})) as c:
            await lookup.company_by_number(c, "SC123456")
    with pytest.raises(lookup.LookupError_) as e:
        run(go())
    assert e.value.code == code


# ---------------- endpoints (auth + rate limit + error shape), DB not used ----------------
@pytest.fixture()
def api_client(monkeypatch):
    import server
    from fastapi.testclient import TestClient

    async def fake_user(request):
        if request.headers.get("Authorization") != "Bearer ok":
            from fastapi import HTTPException
            raise HTTPException(401, "Not authenticated")
        return {"user_id": "user_unit_lookup"}
    monkeypatch.setattr(server, "current_user", fake_user)
    monkeypatch.setattr(server, "RATE_LIMIT_OFF", False)
    server._hits.clear()
    return TestClient(server.app)


def test_endpoints_require_login(api_client):
    assert api_client.get("/api/lookup/postcode/PE11XX/businesses").status_code == 401
    assert api_client.get("/api/lookup/company/01234567").status_code == 401
    assert api_client.get("/api/lookup/config").status_code == 401


def test_endpoint_config_and_error_shape(api_client):
    h = {"Authorization": "Bearer ok"}
    assert api_client.get("/api/lookup/config", headers=h).json() == {"postcode_businesses": True, "company_number": False}
    r = api_client.get("/api/lookup/company/01234567", headers=h)
    assert r.status_code == 503 and r.json()["code"] == "not_configured"
    r = api_client.get("/api/lookup/postcode/hello/businesses", headers=h)
    assert r.status_code == 400 and r.json()["code"] == "invalid_postcode"


def test_endpoint_rate_limit(api_client):
    h = {"Authorization": "Bearer ok"}
    codes = [api_client.get("/api/lookup/postcode/hello/businesses", headers=h).status_code for _ in range(22)]
    assert codes[:20] == [400] * 20 and codes[-1] == 429
