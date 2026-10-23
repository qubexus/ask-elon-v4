"""Employer address lookup: UK postcode -> nearby businesses, company number -> registered office.

External services (all called only from the backend, never from the app directly):
  * postcodes.io            – validate/normalise a UK postcode, get lat/lon + district (free, no key, open data)
                              https://postcodes.io/docs
  * Photon (komoot)         – OpenStreetMap places around a point (/reverse with osm_tag filters; free, fair use)
                              https://github.com/komoot/photon/blob/master/docs/api-v1.md
  * Overpass API (OSM)      – fallback when Photon is down (free, < 10 000 queries/day, needs a User-Agent)
                              https://wiki.openstreetmap.org/wiki/Overpass_API
  * Companies House API     – GET /company/{number} -> registered office address (free key, HTTP Basic auth,
                              600 requests / 5 min) https://developer-specs.company-information.service.gov.uk/
Results are cached in memory (TTL), every call has a short timeout and failures map to clear error codes.
"""
from __future__ import annotations

import asyncio
import math
import os
import re
import time
from typing import Any, Optional

import httpx

USER_AGENT = os.environ.get("LOOKUP_USER_AGENT") or "AskElon/1.0 (+https://askelon.uk; contact@askelon.uk)"
POSTCODES_IO_URL = (os.environ.get("POSTCODES_IO_URL") or "https://api.postcodes.io").rstrip("/")
PHOTON_URL = (os.environ.get("PHOTON_URL") or "https://photon.komoot.io").rstrip("/")
OVERPASS_URLS = [u.strip() for u in (os.environ.get("OVERPASS_URLS") or
                 "https://overpass-api.de/api/interpreter,https://maps.mail.ru/osm/tools/overpass/api/interpreter").split(",") if u.strip()]
CH_API_URL = (os.environ.get("COMPANIES_HOUSE_API_URL") or "https://api.company-information.service.gov.uk").rstrip("/")
NEARBY_RADIUS_M = int(os.environ.get("LOOKUP_RADIUS_M") or 600)
MAX_RESULTS = 40
TIMEOUT = httpx.Timeout(8.0, connect=4.0)


def ch_api_key() -> str:
    return (os.environ.get("COMPANIES_HOUSE_API_KEY") or "").strip()


class LookupError_(Exception):
    """code: invalid_postcode | postcode_not_found | invalid_company_number | company_not_found |
    not_configured | rate_limited | unavailable"""

    STATUS = {"invalid_postcode": 400, "invalid_company_number": 400, "postcode_not_found": 404,
              "company_not_found": 404, "not_configured": 503, "rate_limited": 429, "unavailable": 502}

    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code
        self.message = message or code
        self.status = self.STATUS.get(code, 502)


# ---------------- tiny TTL cache (per process) ----------------
class TTLCache:
    def __init__(self, max_items: int = 2000):
        self.max_items = max_items
        self._d: dict[str, tuple[float, Any]] = {}

    def get(self, key: str):
        v = self._d.get(key)
        if not v:
            return None
        if v[0] < time.monotonic():
            self._d.pop(key, None)
            return None
        return v[1]

    def set(self, key: str, value: Any, ttl_s: float):
        if len(self._d) >= self.max_items:
            now = time.monotonic()
            for k in [k for k, (exp, _) in self._d.items() if exp < now] or list(self._d)[: self.max_items // 10]:
                self._d.pop(k, None)
        self._d[key] = (time.monotonic() + ttl_s, value)

    def clear(self):
        self._d.clear()


cache = TTLCache()
_down_until: dict[str, float] = {}  # simple circuit breaker per provider URL


def _is_down(url: str) -> bool:
    return _down_until.get(url, 0) > time.monotonic()


def _mark_down(url: str, seconds: int = 300):
    _down_until[url] = time.monotonic() + seconds


def new_client(transport: httpx.AsyncBaseTransport | None = None) -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=TIMEOUT, transport=transport, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})


# ---------------- postcode ----------------
_PC_RE = re.compile(r"^(GIR0AA|[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2})$")


def normalise_postcode(raw: str) -> Optional[str]:
    """'sw1a1aa' -> 'SW1A 1AA'; returns None when it cannot be a UK postcode."""
    s = re.sub(r"[^A-Za-z0-9]", "", raw or "").upper()
    if not _PC_RE.match(s):
        return None
    return f"{s[:-3]} {s[-3:]}"


async def get_postcode(client: httpx.AsyncClient, raw: str) -> dict:
    pc = normalise_postcode(raw)
    if not pc:
        raise LookupError_("invalid_postcode", "This is not a valid UK postcode.")
    key = f"pc:{pc}"
    hit = cache.get(key)
    if hit:
        return hit
    try:
        r = await client.get(f"{POSTCODES_IO_URL}/postcodes/{pc.replace(' ', '')}")
    except httpx.HTTPError:
        raise LookupError_("unavailable", "The postcode service is not responding. Please try again later.")
    if r.status_code == 404:
        raise LookupError_("postcode_not_found", "We could not find this postcode.")
    if r.status_code == 429:
        raise LookupError_("rate_limited", "Too many postcode lookups. Please try again in a minute.")
    if r.status_code != 200:
        raise LookupError_("unavailable", "The postcode service is not responding. Please try again later.")
    res = (r.json() or {}).get("result") or {}
    if res.get("latitude") is None or res.get("longitude") is None:
        raise LookupError_("postcode_not_found", "This postcode has no location data.")
    out = {"postcode": res.get("postcode") or pc, "lat": res["latitude"], "lon": res["longitude"],
           "district": res.get("admin_district") or "", "ward": res.get("admin_ward") or "",
           "region": res.get("region") or "", "country": res.get("country") or ""}
    cache.set(key, out, 7 * 86400)
    return out


# ---------------- nearby businesses ----------------
# Photon osm_tag filters (OR-ed) – places where people work.
PHOTON_TAGS = ["shop", "office", "craft", "industrial", "amenity", "tourism:hotel", "healthcare", "man_made:works",
               "landuse:industrial", "building:warehouse", "building:industrial", "building:commercial"]
# Things that are not an employer address worth suggesting.
SKIP_VALUES = {"parking", "parking_space", "parking_entrance", "bicycle_parking", "motorcycle_parking", "bench",
               "waste_basket", "recycling", "vending_machine", "atm", "telephone", "post_box", "toilets",
               "drinking_water", "shelter", "bicycle_rental", "charging_station", "taxi", "grit_bin", "clock",
               "fountain", "waste_disposal", "vacant", "place_of_worship", "grave_yard", "bus_station", "letter_box",
               "hunting_stand", "loading_dock", "car_sharing", "photo_booth", "kick-scooter_rental"}


def _dist_m(lat1, lon1, lat2, lon2) -> int:
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return int(2 * r * math.asin(math.sqrt(a)))


def _address_line(b: dict) -> str:
    street = " ".join(x for x in [b.get("housenumber") or "", b.get("street") or ""] if x).strip()
    parts = [street, b.get("town") or "", b.get("postcode") or ""]
    out = []
    for p in parts:
        if p and p not in out:
            out.append(p)
    return ", ".join(out)


def _finish(items: list[dict], pc: dict) -> list[dict]:
    """Fill missing parts from the postcode, dedupe, sort by distance, build the one-line address."""
    seen, out = set(), []
    for b in items:
        if not b.get("name"):
            continue
        b["town"] = b.get("town") or pc.get("district") or ""
        if not b.get("postcode"):
            b["postcode"] = pc["postcode"]
            b["postcode_guessed"] = True
        else:
            b["postcode"] = normalise_postcode(b["postcode"]) or b["postcode"]
        key = (b["name"].lower(), (b.get("street") or "").lower())
        if key in seen:
            continue
        seen.add(key)
        b["address"] = _address_line(b)
        out.append(b)
    out.sort(key=lambda x: x.get("distance_m", 10**9))
    return out[:MAX_RESULTS]


def _from_photon(features: list, pc: dict, radius_m: int) -> list[dict]:
    items = []
    for f in features or []:
        p = f.get("properties") or {}
        if p.get("osm_value") in SKIP_VALUES or not p.get("name"):
            continue
        coords = (f.get("geometry") or {}).get("coordinates") or [None, None]
        d = _dist_m(pc["lat"], pc["lon"], coords[1], coords[0]) if coords[0] is not None else None
        if d is not None and d > radius_m * 1.6:
            continue
        items.append({"id": f"osm:{p.get('osm_type', '')}{p.get('osm_id', '')}", "name": p.get("name"),
                      "kind": p.get("osm_value") or p.get("osm_key") or "", "housenumber": p.get("housenumber") or "",
                      "street": p.get("street") or "", "town": p.get("city") or p.get("town") or p.get("district") or "",
                      "postcode": p.get("postcode") or "", "distance_m": d, "source": "osm"})
    return items


async def _photon(client: httpx.AsyncClient, pc: dict, q: str) -> list[dict]:
    radius_km = NEARBY_RADIUS_M / 1000
    params: list[tuple[str, Any]] = [("lat", pc["lat"]), ("lon", pc["lon"]), ("limit", 50), ("lang", "en")]
    if q:
        url = f"{PHOTON_URL}/api"
        params += [("q", q), ("location_bias_scale", 0.1), ("zoom", 16)]
    else:
        url = f"{PHOTON_URL}/reverse"
        params += [("radius", radius_km)] + [("osm_tag", t) for t in PHOTON_TAGS]
    r = await client.get(url, params=params)
    if r.status_code == 429:
        raise LookupError_("rate_limited", "The map service is busy. Please try again in a minute.")
    r.raise_for_status()
    return _from_photon(r.json().get("features"), pc, NEARBY_RADIUS_M * (4 if q else 1))


def _overpass_query(lat, lon, radius_m, q: str) -> str:
    name = f'[name~"{re.escape(q)}",i]' if q else "[name]"
    return (f'[out:json][timeout:10];nwr(around:{radius_m},{lat},{lon}){name}'
            f'[~"^(shop|office|craft|industrial|amenity|healthcare)$"~"."];out center tags 80;')


async def _overpass(client: httpx.AsyncClient, pc: dict, q: str) -> list[dict]:
    last: Exception | None = None
    for url in OVERPASS_URLS:
        if _is_down(url):
            continue
        try:
            r = await client.post(url, data={"data": _overpass_query(pc["lat"], pc["lon"], NEARBY_RADIUS_M, q)})
            if r.status_code in (429, 504):
                _mark_down(url, 120)
                last = LookupError_("rate_limited" if r.status_code == 429 else "unavailable")
                continue
            r.raise_for_status()
            items = []
            for e in r.json().get("elements") or []:
                t = e.get("tags") or {}
                if not t.get("name") or (t.get("amenity") or t.get("shop")) in SKIP_VALUES:
                    continue
                la, lo = e.get("lat") or (e.get("center") or {}).get("lat"), e.get("lon") or (e.get("center") or {}).get("lon")
                kind = next((t[k] for k in ("shop", "office", "craft", "industrial", "amenity", "healthcare") if t.get(k)), "")
                items.append({"id": f"osm:{e.get('type', '')[:1].upper()}{e.get('id')}", "name": t["name"], "kind": kind,
                              "housenumber": t.get("addr:housenumber", ""), "street": t.get("addr:street", ""),
                              "town": t.get("addr:city") or t.get("addr:town") or "", "postcode": t.get("addr:postcode", ""),
                              "distance_m": _dist_m(pc["lat"], pc["lon"], la, lo) if la is not None else None, "source": "osm"})
            return items
        except (httpx.HTTPError, ValueError) as e:
            _mark_down(url, 300)
            last = e
    if isinstance(last, LookupError_):
        raise last
    raise LookupError_("unavailable", "The map service is not responding. Please try again later or type the address.")


async def nearby_businesses(client: httpx.AsyncClient, raw_postcode: str, q: str = "") -> dict:
    q = re.sub(r"\s+", " ", (q or "")).strip()[:60]
    pc = await get_postcode(client, raw_postcode)
    key = f"nb:{pc['postcode']}:{q.lower()}"
    hit = cache.get(key)
    if hit is not None:
        return hit
    items: list[dict] | None = None
    provider = ""
    err: Exception | None = None
    if not _is_down(PHOTON_URL):
        try:
            items = await _photon(client, pc, q)
            provider = "photon"
        except LookupError_ as e:
            err = e
        except (httpx.HTTPError, ValueError) as e:
            _mark_down(PHOTON_URL, 300)
            err = e
    if items is None:
        try:
            items = await _overpass(client, pc, q)
            provider = "overpass"
        except LookupError_ as e:
            if isinstance(err, LookupError_) and err.code == "rate_limited":
                raise err
            raise e
    out = {"postcode": pc, "results": _finish(items, pc), "provider": provider, "radius_m": NEARBY_RADIUS_M,
           "attribution": "© OpenStreetMap contributors"}
    cache.set(key, out, 86400 if out["results"] else 3600)
    return out


# ---------------- Companies House ----------------
_CN_RE = re.compile(r"^([A-Z]{2}\d{6}|\d{8}|[A-Z]{2}\d{5}[A-Z]|R\d{7})$")


def normalise_company_number(raw: str) -> Optional[str]:
    s = re.sub(r"[^A-Za-z0-9]", "", raw or "").upper()
    if s.isdigit() and 1 <= len(s) < 8:
        s = s.zfill(8)
    elif len(s) < 8 and re.match(r"^[A-Z]{2}\d+$", s):
        s = s[:2] + s[2:].zfill(6)
    return s if _CN_RE.match(s) else None


async def company_by_number(client: httpx.AsyncClient, raw: str) -> dict:
    num = normalise_company_number(raw)
    if not num:
        raise LookupError_("invalid_company_number", "A company number has 8 characters, e.g. 01234567 or SC123456.")
    key = ch_api_key()
    if not key:
        raise LookupError_("not_configured", "Company number lookup is not configured on this server.")
    ck = f"ch:{num}"
    hit = cache.get(ck)
    if hit:
        return hit
    try:
        r = await client.get(f"{CH_API_URL}/company/{num}", auth=(key, ""))
    except httpx.HTTPError:
        raise LookupError_("unavailable", "Companies House is not responding. Please try again later.")
    if r.status_code == 404:
        raise LookupError_("company_not_found", "No company with this number.")
    if r.status_code in (401, 403):
        raise LookupError_("not_configured", "Company number lookup is not configured correctly on this server.")
    if r.status_code == 429:
        raise LookupError_("rate_limited", "Too many company lookups. Please try again in a few minutes.")
    if r.status_code != 200:
        raise LookupError_("unavailable", "Companies House is not responding. Please try again later.")
    d = r.json() or {}
    a = d.get("registered_office_address") or {}
    street = " ".join(x for x in [a.get("premises") or "", a.get("address_line_1") or ""] if x).strip()
    lines = [x for x in [street, a.get("address_line_2"), a.get("locality"), a.get("region"), a.get("postal_code")] if x]
    name = d.get("company_name") or ""
    out = {"company_number": d.get("company_number") or num, "name": name, "status": d.get("company_status") or "",
           "street": street, "address_line_2": a.get("address_line_2") or "", "town": a.get("locality") or "",
           "region": a.get("region") or "", "postcode": a.get("postal_code") or "", "country": a.get("country") or "",
           "address": ", ".join(lines), "source": "companies_house",
           "registered_office": True}
    cache.set(ck, out, 7 * 86400)
    return out


async def with_client(fn, *args):
    async with new_client() as c:
        try:
            return await asyncio.wait_for(fn(c, *args), timeout=20)
        except asyncio.TimeoutError:
            raise LookupError_("unavailable", "The lookup took too long. Please try again or type the address.")
