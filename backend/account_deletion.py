"""Deleting a user account and everything that belongs to it (GDPR "right to erasure").

Used by the admin hub (DELETE /api/admin/users/{id}) and by the user (POST /api/account/delete).
Idempotent: running it again for the same user_id finishes whatever is left and reports zeros.
Logs only counts and the internal user_id, never names, e-mails or content.

What happens to each kind of data:
- removed: sessions, reset/verification codes, cases, chat messages (main chat + case threads), sent letters,
  notes, uploaded documents + their files and thumbnails, chat documents (PDFs written by Elon) + files,
  read-aloud audio cached for this user's messages, inbox messages addressed only to this user and read marks,
  messages sent to the admin via "Contact", the user's folders in file storage, the user record itself;
- anonymised: forum posts and comments stay readable for the community, but the author becomes
  "Usunięty użytkownik" and the link to the account is removed; likes are removed;
- kept, without any link to the person: PayPal subscription records (subscription id, amount, currency, status,
  dates) – minimal billing records an accountant may need; user_id is replaced with "deleted".
"""
from __future__ import annotations

import logging
from typing import Callable, Dict, List

logger = logging.getLogger(__name__)
DELETED_AUTHOR = "Usunięty użytkownik"


async def delete_user_data(db, user_id: str, storage, storage_app: str, run_sync: Callable) -> Dict[str, int]:
    """Removes/anonymises all data of `user_id`. `run_sync` runs blocking storage calls in a thread."""
    if not user_id or not isinstance(user_id, str):
        raise ValueError("user_id required")
    counts: Dict[str, int] = {}
    q = {"user_id": user_id}
    user = await db.users.find_one(q, {"_id": 0, "email": 1})

    # 1) access first: no session can keep working while the rest is removed
    for coll in ("user_sessions", "password_resets", "email_verifications"):
        counts[coll] = (await db[coll].delete_many(q)).deleted_count
    if user and user.get("email"):
        counts["login_attempts"] = (await db.login_attempts.delete_many({"email": user["email"]})).deleted_count

    # 2) files (uploaded documents and Elon's chat PDFs), then their records
    paths: List[str] = []
    async for d in db.documents.find(q, {"_id": 0, "storage_path": 1, "thumb_path": 1}):
        paths += [p for p in (d.get("storage_path"), d.get("thumb_path")) if p]
    async for d in db.chat_documents.find(q, {"_id": 0, "pdf_path": 1, "thumb_path": 1}):
        paths += [p for p in (d.get("pdf_path"), d.get("thumb_path")) if p]
    removed = 0
    for p in paths:
        try:
            removed += 1 if await run_sync(storage.delete_object, p) else 0
        except Exception:
            logger.warning("account deletion: could not remove a stored file of %s", user_id, exc_info=True)
    for prefix in (f"{storage_app}/uploads/{user_id}/", f"{storage_app}/chat-docs/{user_id}/"):
        try:
            removed += await run_sync(storage.delete_prefix, prefix)
        except Exception:
            logger.warning("account deletion: could not clean storage prefix of %s", user_id, exc_info=True)
    counts["files"] = removed

    # 3) read-aloud audio generated for this user's messages (the cache is keyed by text hash)
    keys = [m["tts_key"] async for m in db.messages.find({**q, "tts_key": {"$exists": True}}, {"_id": 0, "tts_key": 1})]
    counts["tts_cache"] = (await db.tts_cache.delete_many({"key": {"$in": keys}})).deleted_count if keys else 0

    # 4) the user's own records
    for coll in ("documents", "chat_documents", "cases", "messages", "letters", "notes", "user_message_reads",
                 "contact_messages"):
        counts[coll] = (await db[coll].delete_many(q)).deleted_count
    counts["admin_messages"] = (await db.admin_messages.delete_many({"target": "user", "user_id": user_id})).deleted_count

    # 5) community content: keep the text, drop the person
    anon = {"$set": {"user_id": "deleted", "author": DELETED_AUTHOR, "author_deleted": True}}
    counts["forum_posts_anonymised"] = (await db.forum_posts.update_many(q, anon)).modified_count
    counts["forum_comments_anonymised"] = (await db.forum_comments.update_many(q, anon)).modified_count
    counts["forum_likes_removed"] = (await db.forum_posts.update_many({"likes": user_id}, {"$pull": {"likes": user_id}})).modified_count

    # 6) billing: keep the minimal record, without the link to the person
    counts["subscriptions_pseudonymised"] = (await db.subscriptions.update_many(
        q, {"$set": {"user_id": "deleted"}})).modified_count

    # 7) finally the account itself
    counts["users"] = (await db.users.delete_one(q)).deleted_count
    logger.info("account deletion %s: %s", user_id, ", ".join(f"{k}={v}" for k, v in counts.items() if v))
    return counts
