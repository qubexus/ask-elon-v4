"""Unit tests for backend/security.py (no database)."""
import hashlib

import security

S = "unit-secret-unit-secret-unit-secret-12"


def test_token_hash_is_sha256_hex():
    assert security.token_hash("abc") == hashlib.sha256(b"abc").hexdigest()


def test_code_hash_depends_on_secret_purpose_email():
    h = security.code_hash(S, "verify", "a@example.com", "123456")
    assert h != hashlib.sha256(b"a@example.com:123456").hexdigest()
    assert h != security.code_hash(S + "x", "verify", "a@example.com", "123456")
    assert h != security.code_hash(S, "reset", "a@example.com", "123456")
    assert h != security.code_hash(S, "verify", "b@example.com", "123456")


def test_links_expire_and_bind_owner_kind_and_id():
    t = 1_000_000.0
    q = dict(p.split("=") for p in security.link_params(S, "doc-file", "doc_1", "user_a", 300, now=t).split("&"))
    exp, sig = int(q["exp"]), q["sig"]
    ok = lambda **k: security.check_link(S, k.get("kind", "doc-file"), k.get("rid", "doc_1"), k.get("owner", "user_a"),
                                         k.get("exp", exp), k.get("sig", sig), 300, now=k.get("now", t))
    assert ok()
    assert not ok(now=t + 301)                     # expired
    assert not ok(owner="user_b")                  # other owner
    assert not ok(kind="doc-thumb")                # other kind
    assert not ok(rid="doc_2")                     # other document
    assert not ok(exp=exp + 1)                     # exp tampered
    assert not ok(sig="0" * 32)
    far = int(t) + 10_000                          # a validly signed but too-long link is refused too
    assert not security.check_link(S, "doc-file", "doc_1", "user_a", far, security.sign_link(S, "doc-file", "doc_1", "user_a", far), 300, now=t)
