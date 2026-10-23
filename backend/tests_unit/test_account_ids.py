"""Unit tests for account IDs (format, Damm check digit, nationality letter, counter/backfill with a fake DB).

Run:  cd backend && python -m pytest tests_unit/test_account_ids.py -n 0
"""
import asyncio
import string
from datetime import datetime, timezone

import account_ids as a

OCT = datetime(2026, 10, 23, 20, 0)  # naive UTC, as Mongo returns it


def test_example_first_polish_customer():
    aid = a.build_account_id({"name": "Piotr Kowalski", "created_at": OCT, "locale": "pl"}, 1)
    assert aid == "PK261000011T"
    assert a.validate_account_id(aid)
    assert a.format_account_id(aid) == "PK 2610 0001 1 T"


def test_initials_rules():
    assert a.initials("Anna Maria Testowa") == "AT"
    assert a.initials("Łucja Śliwa") == "LS"
    assert a.initials("Ștefan Ionescu-Țăran") == "SI"
    assert a.initials("Ola") == "OL"
    assert a.initials("", "jan.kowal@example.com") == "JA"
    assert a.initials(None, None) == "XX"
    assert a.initials("  ", "@x") == "XX"


def test_yymm_uses_london_time():
    assert a.yymm(datetime(2026, 10, 1, 0, 30)) == "2610"
    assert a.yymm(datetime(2026, 9, 30, 23, 30)) == "2610"  # 00:30 BST on 1 Oct
    assert a.yymm(datetime(2026, 12, 31, 23, 59, tzinfo=timezone.utc)) == "2612"


def test_sequence_padding_and_growth():
    assert a.build_account_id({"name": "A B", "created_at": OCT}, 42)[6:10] == "0042"
    big = a.build_account_id({"name": "A B", "created_at": OCT, "locale": "en"}, 12345)
    assert big[6:11] == "12345" and a.validate_account_id(big)


def test_nationality_letter():
    assert a.nationality_letter({"locale": "pl"}) == "T"
    assert a.nationality_letter({"locale": "ro"}) == "R"
    assert a.nationality_letter({"locale": "en"}) == "E"
    assert a.nationality_letter({}) == "E"
    assert a.nationality_letter({"nationality": "RO", "locale": "pl"}) == "R"
    assert a.nationality_letter({"country": "PL", "locale": "en"}) == "T"
    assert a.nationality_letter({"country": "GB", "locale": "pl"}) == "E"


def _ids():
    out = []
    for i, (name, loc) in enumerate([("Piotr Kowalski", "pl"), ("Ioana Pop", "ro"), ("John Smith", "en"), ("Zofia Żak", "pl")]):
        for seq in (1, 9, 10, 99, 1234, 9999, 10000, 54321):
            out.append(a.build_account_id({"name": name, "created_at": datetime(2025 + i % 2, 1 + i * 3, 5), "locale": loc}, seq))
    return out


def test_all_single_digit_substitutions_detected():
    for aid in _ids():
        assert a.validate_account_id(aid)
        for i, ch in enumerate(aid[:-1]):
            if not ch.isdigit():
                continue
            for d in string.digits:
                if d != ch:
                    assert not a.validate_account_id(aid[:i] + d + aid[i + 1:]), (aid, i, d)


def test_all_adjacent_transpositions_detected():
    for aid in _ids():
        body = aid[:-1]
        for i in range(len(body) - 1):
            x, y = body[i], body[i + 1]
            if x == y:
                continue
            swapped = body[:i] + y + x + body[i + 2:] + aid[-1]
            assert not a.validate_account_id(swapped), (aid, i)


def test_letter_errors_mostly_detected_and_rate_documented():
    # One decimal digit cannot catch all 26 letter alternatives; measure the rate.
    total = caught = 0
    for aid in _ids():
        for i in (0, 1):
            for L in string.ascii_uppercase:
                if L != aid[i]:
                    total += 1
                    caught += not a.validate_account_id(aid[:i] + L + aid[i + 1:])
    assert caught / total > 0.85, caught / total


def test_invalid_shapes_and_nationality():
    good = a.build_account_id({"name": "Piotr Kowalski", "created_at": OCT, "locale": "pl"}, 1)
    assert not a.validate_account_id(good[:-1] + "X")
    assert not a.validate_account_id(good[:-1])
    assert not a.validate_account_id(good.lower())
    assert not a.validate_account_id("PK 2610 0001 1 T")
    assert not a.validate_account_id(None)  # type: ignore[arg-type]


# ---- fake async Mongo for counter + backfill ----------------------------------------------------
class FakeCounters:
    def __init__(self):
        self.docs = {}

    async def find_one_and_update(self, q, upd, upsert=False, return_document=None):
        d = self.docs.setdefault(q["_id"], {"_id": q["_id"], "seq": 0})
        d["seq"] += upd["$inc"]["seq"]
        return dict(d)


class Res:
    def __init__(self, n):
        self.modified_count = n


class FakeCursor:
    def __init__(self, docs):
        self.docs = docs

    def sort(self, keys):
        for k, direction in reversed(keys):
            self.docs.sort(key=lambda d: d.get(k), reverse=direction < 0)
        return self

    def __aiter__(self):
        self._it = iter(self.docs)
        return self

    async def __anext__(self):
        try:
            return dict(next(self._it))
        except StopIteration:
            raise StopAsyncIteration


class FakeUsers:
    def __init__(self, docs):
        self.docs = docs

    def find(self, q, proj=None):
        return FakeCursor([d for d in self.docs if "account_id" not in d])

    async def update_one(self, q, upd):
        for d in self.docs:
            if d["_id"] == q["_id"] and "account_id" not in d:
                d.update(upd["$set"])
                return Res(1)
        return Res(0)


class FakeDB:
    def __init__(self, users):
        self.users = FakeUsers(users)
        self.counters = FakeCounters()


def test_backfill_order_idempotent_and_counter_continues():
    users = [
        {"_id": 3, "name": "Cezary Nowak", "created_at": datetime(2026, 10, 2), "locale": "pl"},
        {"_id": 1, "name": "Piotr Piasecki", "created_at": datetime(2026, 9, 1), "locale": "pl"},
        {"_id": 2, "name": "Keep Me", "created_at": datetime(2026, 9, 5), "account_id": "KM260900009E"},
    ]
    db = FakeDB(users)
    assert asyncio.run(a.backfill(db)) == 2
    by = {u["_id"]: u["account_id"] for u in users}
    assert by[1].startswith("PP26090001") and by[1].endswith("T")
    assert by[3].startswith("CN26100002")
    assert by[2] == "KM260900009E"  # never changed
    assert asyncio.run(a.backfill(db)) == 0  # idempotent
    nxt = asyncio.run(a.new_account_id(db, {"name": "New User", "created_at": datetime(2026, 10, 23), "locale": "ro"}))
    assert nxt[6:10] == "0003" and nxt.endswith("R") and a.validate_account_id(nxt)
