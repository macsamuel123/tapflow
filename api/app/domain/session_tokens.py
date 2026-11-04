"""Diner session tokens, sent by the client as `X-Session-Token`.

token = f"{session_id}.{base64url_nopad(HMAC_SHA256(SESSION_SECRET, session_id))}"

The token only proves the client was issued this session id; the DB row decides whether the
session still exists, has expired, and whether it is verified (scanned a valid touchpoint QR).
"""

import base64
import hashlib
import hmac
from uuid import UUID


def _mac(secret: str, session_id: UUID) -> str:
    raw = hmac.new(secret.encode(), str(session_id).encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def issue_session_token(secret: str, session_id: UUID) -> str:
    return f"{session_id}.{_mac(secret, session_id)}"


def parse_session_token(secret: str, token: str | None) -> UUID | None:
    """Return the session id if the token is authentic, else None."""
    if not token or token.count(".") != 1:
        return None
    raw_id, mac = token.split(".")
    try:
        session_id = UUID(raw_id)
    except ValueError:
        return None
    # Canonical form only, so one session has exactly one valid token string.
    if str(session_id) != raw_id:
        return None
    if not hmac.compare_digest(_mac(secret, session_id).encode("ascii"), mac.encode("utf-8")):
        return None
    return session_id
