"""Signed table QR tokens.

token = base64url_nopad(HMAC_SHA256(table.qr_secret, f"{rest_slug}:{table_id}"))

Rotating a table's qr_secret invalidates every previously printed QR code.
"""

import base64
import hashlib
import hmac
from uuid import UUID


def _message(rest_slug: str, table_id: UUID) -> bytes:
    return f"{rest_slug}:{table_id}".encode()


def sign_table_token(qr_secret: str, rest_slug: str, table_id: UUID) -> str:
    mac = hmac.new(qr_secret.encode(), _message(rest_slug, table_id), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(mac).rstrip(b"=").decode("ascii")


def verify_table_token(qr_secret: str, rest_slug: str, table_id: UUID, token: str | None) -> bool:
    if not token:
        return False
    expected = sign_table_token(qr_secret, rest_slug, table_id)
    # Compare as bytes so non-ASCII input can't raise; constant-time.
    return hmac.compare_digest(expected.encode("ascii"), token.encode("utf-8"))
