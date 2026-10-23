"""Per-user storage quota: uploaded files (`documents`) + PDFs Elon writes in the chat (`chat_documents`).

Usage is always computed from DB metadata (sum of `size` of the user's not-deleted records in both
collections), so there is no separate counter that could drift or double-count: an upload/generation
adds a record, a delete marks it deleted, an edit of a chat PDF replaces its size.
Limit: USER_STORAGE_QUOTA_BYTES (default 5 GiB). Over the limit, new uploads and new chat PDFs are refused
with HTTP 507 (code "storage_full"); existing files are never touched.
"""
from __future__ import annotations

import os
from typing import Optional

from fastapi import Request
from fastapi.responses import JSONResponse

GIB = 1024 ** 3
WARN_PERCENT = 80


def quota_bytes() -> int:
    try:
        v = int((os.environ.get("USER_STORAGE_QUOTA_BYTES") or "").strip() or 5 * GIB)
    except ValueError:
        v = 5 * GIB
    return max(v, 1)


def human(n: float, lang: str = "en") -> str:
    """1.2 GB / 350 MB / 12 KB; decimal comma for pl/ro."""
    n = max(0.0, float(n))
    for unit, size in (("GB", GIB), ("MB", 1024 ** 2), ("KB", 1024)):
        if n >= size or unit == "KB":
            v = n / size
            s = f"{v:.1f}" if v < 10 and unit != "KB" else f"{v:.0f}"
            s = s[:-2] if s.endswith(".0") else s
            return (s.replace(".", ",") if lang in ("pl", "ro") else s) + f" {unit}"
    return "0 KB"


MESSAGES = {
    "pl": "Brak miejsca na pliki: wykorzystano cały limit {limit}. Usuń niepotrzebne dokumenty, żeby dodać nowe. Twoje obecne pliki są bezpieczne.",
    "en": "You're out of storage: your {limit} limit is full. Delete documents you no longer need to add new ones. Your existing files are safe.",
    "ro": "Nu mai ai spațiu de stocare: limita de {limit} este plină. Șterge documentele de care nu mai ai nevoie ca să adaugi altele noi. Fișierele existente sunt în siguranță.",
}
TOO_BIG = {
    "pl": "Za mało miejsca: zostało Ci {left}, a plik ma {size}. Usuń niepotrzebne dokumenty i spróbuj ponownie.",
    "en": "Not enough space: you have {left} left and the file is {size}. Delete documents you no longer need and try again.",
    "ro": "Spațiu insuficient: mai ai {left}, iar fișierul are {size}. Șterge documentele de care nu mai ai nevoie și încearcă din nou.",
}


class StorageFull(Exception):
    def __init__(self, used: int, limit: int, incoming: int, lang: str):
        self.used, self.limit, self.incoming, self.lang = used, limit, incoming, lang if lang in MESSAGES else "en"
        super().__init__("storage_full")

    def message(self) -> str:
        left = self.limit - self.used
        if left > 0 and self.incoming > 0:
            return TOO_BIG[self.lang].format(left=human(left, self.lang), size=human(self.incoming, self.lang))
        return MESSAGES[self.lang].format(limit=human(self.limit, self.lang))


async def storage_full_handler(request: Request, exc: StorageFull):
    return JSONResponse(status_code=507, content={
        "detail": exc.message(), "code": "storage_full", "used": exc.used, "limit": exc.limit})


async def _sum(coll, user_id: str) -> int:
    rows = await coll.aggregate([
        {"$match": {"user_id": user_id, "deleted": {"$ne": True}}},
        {"$group": {"_id": None, "total": {"$sum": {"$ifNull": ["$size", 0]}}}},
    ]).to_list(1)
    return int(rows[0]["total"]) if rows else 0


async def used_bytes(db, user_id: str) -> int:
    return await _sum(db.documents, user_id) + await _sum(db.chat_documents, user_id)


def summary(used: int, limit: int, lang: str = "en") -> dict:
    remaining = max(0, limit - used)
    percent = min(100.0, round(used * 100.0 / limit, 1))
    return {"used": used, "limit": limit, "remaining": remaining, "percent": percent,
            "warn": percent >= WARN_PERCENT, "full": used >= limit,
            "used_text": human(used, lang), "limit_text": human(limit, lang), "remaining_text": human(remaining, lang)}


async def usage(db, user: dict) -> dict:
    return summary(await used_bytes(db, user["user_id"]), quota_bytes(), user.get("locale") or "en")


async def ensure_room(db, user: dict, incoming: int, replacing: int = 0, used: Optional[int] = None):
    """Raises StorageFull unless `incoming` bytes (minus `replacing` bytes freed by the same write) fit."""
    limit = quota_bytes()
    used = await used_bytes(db, user["user_id"]) if used is None else used
    if incoming > 0 and used - replacing + incoming > limit:
        raise StorageFull(used, limit, incoming, user.get("locale") or "en")
