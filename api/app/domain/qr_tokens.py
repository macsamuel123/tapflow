"""Signed touchpoint QR tokens.

token = base64url_nopad(HMAC_SHA256(touchpoint.qr_secret, f"{venue_slug}:{touchpoint_id}"))

Rotating a touchpoint's qr_secret invalidates every previously printed QR code.
"""

import base64
import hashlib
import hmac
from uuid import UUID


def _message(venue_slug: str, touchpoint_id: UUID) -> bytes:
    return f"{venue_slug}:{touchpoint_id}".encode()


def sign_touchpoint_token(qr_secret: str, venue_slug: str, touchpoint_id: UUID) -> str:
    mac = hmac.new(qr_secret.encode(), _message(venue_slug, touchpoint_id), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(mac).rstrip(b"=").decode("ascii")


def verify_touchpoint_token(
    qr_secret: str, venue_slug: str, touchpoint_id: UUID, token: str | None
) -> bool:
    if not token:
        return False
    expected = sign_touchpoint_token(qr_secret, venue_slug, touchpoint_id)
    # Compare as bytes so non-ASCII input can't raise; constant-time.
    return hmac.compare_digest(expected.encode("ascii"), token.encode("utf-8"))
