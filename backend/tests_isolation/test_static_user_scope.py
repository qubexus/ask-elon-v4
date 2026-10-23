"""Safety net: every database call on a private collection in the API code must be scoped by user_id.

Parses server.py / notes.py and flags db.<private>.<find|find_one|update_*|delete_*|count_documents>(filter)
calls whose filter has no "user_id" key. Admin routes (calling require_admin) are allowed to see everything.
Anything else must be listed in ALLOW with the reason – a new unscoped query makes this test fail.
"""
import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILES = ["server.py", "notes.py"]
PRIVATE = {"cases", "messages", "documents", "notes", "letters", "user_sessions", "password_resets",
           "email_verifications", "subscriptions", "contact_messages", "user_message_reads", "chat_documents"}
METHODS = {"find", "find_one", "update_one", "update_many", "delete_one", "delete_many", "count_documents",
           "find_one_and_update", "replace_one", "aggregate"}
# (function, collection, method): reason
ALLOW = {
    ("user_from_token", "user_sessions", "find_one"): "looked up by the session token hash itself",
    ("auth_logout", "user_sessions", "delete_one"): "deletes exactly the presented session (by token hash)",
    ("process_document", "documents", "find_one"): "background job for a doc_id already checked against the owner",
    ("process_document", "documents", "update_one"): "same background job",
    ("audit_payslip", "documents", "find_one"): "background job; the contract lookup below IS user-scoped",
    ("audit_payslip", "documents", "update_one"): "same background job",
    ("run_audit", "documents", "update_one"): "doc_id was checked with user_id on the line above",
    ("document_file", "documents", "find_one"): "signed-link branch: the HMAC binds doc_id to its owner's user_id",
    ("tts_audio", "messages", "find_one"): "signed-link check: reads the owner of the message to verify the HMAC",
    ("sync_subscription", "subscriptions", "find_one"): "subscription_id from PayPal; owner taken from the record",
    ("sync_subscription", "subscriptions", "update_one"): "same",
    ("delete_own_account", "subscriptions", "update_one"): "subscription_id read with user_id just before",
    ("migrate_security", "user_sessions", "find"): "startup migration over all sessions (no user data returned)",
    ("migrate_security", "user_sessions", "update_one"): "startup migration by _id",
}


def _calls():
    for fname in FILES:
        tree = ast.parse((ROOT / fname).read_text())
        for fn in ast.walk(tree):
            if not isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            src = ast.unparse(fn)
            is_admin = "await require_admin(" in src
            for node in ast.walk(fn):
                if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)):
                    continue
                meth, coll_node = node.func.attr, node.func.value
                if meth not in METHODS or not isinstance(coll_node, ast.Attribute):
                    continue
                if not (isinstance(coll_node.value, ast.Name) and coll_node.value.id in ("db", "self.db")):
                    continue
                coll = coll_node.attr
                if coll not in PRIVATE:
                    continue
                yield fname, fn.name, coll, meth, node, is_admin


def _scoped(node) -> bool:
    if not node.args:
        return False
    f = node.args[0]
    text = ast.unparse(f)
    return "'user_id'" in text or '"user_id"' in text


def test_private_queries_are_user_scoped():
    problems = []
    seen = 0
    for fname, func, coll, meth, node, is_admin in _calls():
        seen += 1
        if is_admin or _scoped(node) or (func, coll, meth) in ALLOW:
            continue
        problems.append(f"{fname}:{node.lineno} {func}() db.{coll}.{meth}({ast.unparse(node.args[0]) if node.args else ''})")
    assert seen > 40, "scanner found suspiciously few queries – parser broken?"
    assert not problems, "unscoped queries on private collections:\n" + "\n".join(problems)


def test_allowlist_has_no_stale_entries():
    used = {(f, c, m) for _, f, c, m, _, _ in _calls()}
    stale = [k for k in ALLOW if k not in used]
    assert not stale, f"remove stale ALLOW entries: {stale}"
