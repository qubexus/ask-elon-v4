"""Customer account IDs (shown on the profile card and in its QR code).

Format (stored without spaces):  II YYMM SSSS C N   e.g. "PK261000011T" -> "PK" "2610" "0001" "1" "T"
  II    two initials, ASCII A-Z: first letter of the first word + first letter of the last word of `name`
        (one word -> its first two letters; no name -> first two letters of the e-mail local part; else "XX").
        Polish/Romanian diacritics are transliterated (Ł->L, Ś->S, Ș->S, Ă->A ...).
  YYMM  join month (created_at in Europe/London), e.g. 2610 = October 2026.
  SSSS  registration order from an atomic Mongo counter (counters._id = "account_seq"), zero-padded to
        4 digits, grows to 5+ digits after 9999. Gaps are allowed (a lost race just skips a number).
  C     check digit, Damm algorithm (see below) over the part before it.
  N     nationality letter: T = Polish, E = English, R = Romanian.

Check digit (Damm, order-10 weakly totally anti-symmetric quasigroup):
  the payload is turned into decimal digits: each initial -> its 2-digit alphabet value (A=10 ... Z=35),
  then the YYMM and sequence digits as they are. interim = 0; for each digit d: interim = TABLE[interim][d];
  the check digit is the final interim. Validation runs the same over payload digits + check digit and
  expects 0.
  Guarantees: every single-digit error and every adjacent transposition of digits (YYMM, sequence and the
  check digit itself) is detected. One decimal check digit cannot catch every substitution of a letter
  (26 letters, 10 check values), so letter typos are caught only most of the time (rate measured in
  tests_unit/test_account_ids.py). Letters are additionally constrained by the format regex, and the
  nationality letter must be one of T/E/R.

The ID is assigned once (at account creation or by the startup backfill) and never changed.
"""
from __future__ import annotations

import re
import unicodedata
from datetime import datetime, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from pymongo import ReturnDocument

LONDON = ZoneInfo("Europe/London")
COUNTER_ID = "account_seq"
ACCOUNT_ID_RE = re.compile(r"^([A-Z]{2})(\d{4})(\d{4,})(\d)([TER])$")

DAMM = (
    (0, 3, 1, 7, 5, 9, 8, 6, 4, 2),
    (7, 0, 9, 2, 1, 5, 4, 8, 6, 3),
    (4, 2, 0, 6, 8, 7, 1, 3, 5, 9),
    (1, 7, 5, 0, 9, 8, 3, 4, 2, 6),
    (6, 1, 2, 3, 0, 4, 5, 9, 7, 8),
    (3, 6, 7, 4, 2, 0, 9, 5, 8, 1),
    (5, 8, 6, 9, 7, 2, 0, 1, 3, 4),
    (8, 9, 4, 5, 3, 6, 2, 0, 1, 7),
    (9, 4, 3, 8, 6, 1, 7, 2, 0, 5),
    (2, 5, 8, 1, 4, 3, 6, 7, 9, 0),
)

# Letters NFKD does not decompose.
_TRANSLIT = str.maketrans({"Ł": "L", "ł": "l", "Đ": "D", "đ": "d", "Ø": "O", "ø": "o", "ß": "s", "Æ": "A", "æ": "a", "Œ": "O", "œ": "o"})


def ascii_letters(s: str) -> str:
    """'Łucja Ștefănescu' -> 'LUCJASTEFANESCU' (letters only, uppercase ASCII)."""
    s = unicodedata.normalize("NFKD", (s or "").translate(_TRANSLIT))
    return "".join(ch for ch in s if "A" <= ch.upper() <= "Z" and ch.isascii()).upper()


def initials(name: Optional[str], email: Optional[str] = None) -> str:
    words = [w for w in (ascii_letters(p) for p in (name or "").split()) if w]
    if len(words) >= 2:
        return words[0][0] + words[-1][0]
    if words and len(words[0]) >= 2:
        return words[0][:2]
    local = ascii_letters((email or "").split("@")[0])
    if len(local) >= 2:
        return local[:2]
    one = (words[0] if words else "") or local
    return (one + "XX")[:2] if one else "XX"


def yymm(created_at: Optional[datetime]) -> str:
    dt = created_at or datetime.now(timezone.utc)
    if dt.tzinfo is None:  # Mongo returns naive UTC datetimes
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(LONDON).strftime("%y%m")


def _digits(payload: str) -> list[int]:
    out: list[int] = []
    for ch in payload:
        if "A" <= ch <= "Z":
            out.extend(divmod(ord(ch) - 55, 10))  # A=10 ... Z=35
        elif ch.isdigit():
            out.append(int(ch))
        else:
            raise ValueError(f"invalid character {ch!r}")
    return out


def damm(digits: list[int]) -> int:
    interim = 0
    for d in digits:
        interim = DAMM[interim][d]
    return interim


def check_digit(payload: str) -> str:
    return str(damm(_digits(payload)))


def nationality_letter(user: dict) -> str:
    """T = Polish, E = English, R = Romanian. Nationality/country field first, else locale; default E."""
    for key in ("nationality", "country"):
        v = str(user.get(key) or "").strip().lower()
        if v:
            if v in ("pl", "pol", "poland", "polska", "polish", "polski", "polka"):
                return "T"
            if v in ("ro", "rou", "romania", "românia", "romanian", "română", "roman", "român"):
                return "R"
            return "E"
    loc = str(user.get("locale") or "").strip().lower()[:2]
    return {"pl": "T", "ro": "R", "en": "E"}.get(loc, "E")


def build_account_id(user: dict, seq: int) -> str:
    payload = f"{initials(user.get('name'), user.get('email'))}{yymm(user.get('created_at'))}{seq:04d}"
    return payload + check_digit(payload) + nationality_letter(user)


def validate_account_id(value: str) -> bool:
    if not isinstance(value, str):
        return False
    m = ACCOUNT_ID_RE.match(value)
    if not m:
        return False
    payload = m.group(1) + m.group(2) + m.group(3)
    return damm(_digits(payload) + [int(m.group(4))]) == 0


def format_account_id(value: str) -> str:
    """'PK261000011T' -> 'PK 2610 0001 1 T' (display only)."""
    m = ACCOUNT_ID_RE.match(value or "")
    return " ".join(m.groups()) if m else (value or "")


async def next_seq(db) -> int:
    doc = await db.counters.find_one_and_update({"_id": COUNTER_ID}, {"$inc": {"seq": 1}}, upsert=True,
                                                return_document=ReturnDocument.AFTER)
    return int(doc["seq"])


async def new_account_id(db, user: dict) -> str:
    return build_account_id(user, await next_seq(db))


async def ensure_indexes(db) -> None:
    await db.users.create_index("account_id", unique=True, name="account_id_unique",
                                partialFilterExpression={"account_id": {"$type": "string"}})


async def backfill(db, logger=None) -> int:
    """Give every user without an account_id one, oldest first (created_at, then _id). Idempotent; never
    overwrites an existing account_id. Returns how many users were updated."""
    n = 0
    cursor = db.users.find({"account_id": {"$exists": False}},
                           {"_id": 1, "user_id": 1, "name": 1, "email": 1, "created_at": 1, "locale": 1,
                            "nationality": 1, "country": 1}).sort([("created_at", 1), ("_id", 1)])
    async for u in cursor:
        aid = await new_account_id(db, u)
        res = await db.users.update_one({"_id": u["_id"], "account_id": {"$exists": False}}, {"$set": {"account_id": aid}})
        n += res.modified_count
    if n and logger:
        logger.info("Account IDs backfilled for %d user(s)", n)
    return n
