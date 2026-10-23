"""Small security helpers shared by the API (no I/O, easy to unit-test).

- token_hash: sessions are stored as SHA-256 of the session token, never the token itself.
  Session tokens are long random signed JWTs (high entropy), so a fast unsalted hash is the right tool:
  it allows an indexed lookup and cannot be brute-forced. Slow salted password hashes (argon2id) are
  for low-entropy passwords; with them every request would cost ~50 ms+ and no index lookup is possible.
- code_hash: 6-digit one-time codes (password reset, e-mail verification) are stored as HMAC-SHA256
  keyed with the server secret, so a database dump alone is not enough to brute-force the 10^6 codes.
- sign_link / check_link: short-lived signed links for files and audio that <img>, <audio> and new
  browser tabs open without an Authorization header (same idea as chat-document links).
"""
from __future__ import annotations

import hashlib
import hmac
import time
from typing import Optional


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def code_hash(secret: str, purpose: str, email: str, code: str) -> str:
    return hmac.new(secret.encode(), f"{purpose}:{email}:{code}".encode(), hashlib.sha256).hexdigest()


def sign_link(secret: str, kind: str, resource_id: str, owner: str, exp: int) -> str:
    return hmac.new(secret.encode(), f"link:{kind}:{resource_id}:{owner}:{exp}".encode(), hashlib.sha256).hexdigest()[:32]


def link_params(secret: str, kind: str, resource_id: str, owner: str, ttl: int, now: Optional[float] = None) -> str:
    exp = int(now if now is not None else time.time()) + ttl
    return f"exp={exp}&sig={sign_link(secret, kind, resource_id, owner, exp)}"


def check_link(secret: str, kind: str, resource_id: str, owner: str, exp: int, sig: str, max_ttl: int,
               now: Optional[float] = None) -> bool:
    t = now if now is not None else time.time()
    if not sig or not exp or exp < t or exp > t + max_ttl + 5:
        return False
    return hmac.compare_digest(sig, sign_link(secret, kind, resource_id, owner, exp))
