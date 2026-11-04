import base64
import hashlib
import hmac
from uuid import UUID

from app.domain.qr_tokens import sign_touchpoint_token, verify_touchpoint_token

SECRET = "dev-only-qr-secret-table-01"
SLUG = "demo-bistro"
TABLE = UUID("c0000000-0000-4000-8000-000000000001")


def test_token_matches_spec() -> None:
    raw = hmac.new(SECRET.encode(), f"{SLUG}:{TABLE}".encode(), hashlib.sha256).digest()
    expected = base64.urlsafe_b64encode(raw).rstrip(b"=").decode()
    assert sign_touchpoint_token(SECRET, SLUG, TABLE) == expected
    assert "=" not in expected


def test_valid_token_verifies() -> None:
    assert verify_touchpoint_token(SECRET, SLUG, TABLE, sign_touchpoint_token(SECRET, SLUG, TABLE))


def test_missing_or_empty_token_is_unverified() -> None:
    assert not verify_touchpoint_token(SECRET, SLUG, TABLE, None)
    assert not verify_touchpoint_token(SECRET, SLUG, TABLE, "")


def test_token_bound_to_slug_and_table() -> None:
    token = sign_touchpoint_token(SECRET, SLUG, TABLE)
    other_table = UUID("c0000000-0000-4000-8000-000000000002")
    assert not verify_touchpoint_token(SECRET, "other-bistro", TABLE, token)
    assert not verify_touchpoint_token(SECRET, SLUG, other_table, token)


def test_rotating_secret_invalidates_old_token() -> None:
    token = sign_touchpoint_token(SECRET, SLUG, TABLE)
    assert not verify_touchpoint_token("rotated-secret-xxxxxxxx", SLUG, TABLE, token)


def test_garbage_and_non_ascii_tokens_rejected() -> None:
    assert not verify_touchpoint_token(SECRET, SLUG, TABLE, "not-a-token")
    assert not verify_touchpoint_token(SECRET, SLUG, TABLE, "ünïcödé")
