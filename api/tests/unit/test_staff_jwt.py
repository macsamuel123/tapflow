"""Staff JWT verification (HS256 with SUPABASE_JWT_SECRET)."""

import time
from typing import Any
from uuid import UUID

import jwt
import pytest
from pydantic import SecretStr

from app.auth.supabase_jwt import AuthError, verify_staff_jwt
from app.config import Settings

SECRET = "test-jwt-secret-with-at-least-32-characters!"
USER = UUID("a0000000-0000-4000-8000-000000000001")
SETTINGS = Settings(supabase_jwt_secret=SecretStr(SECRET))


def token(secret: str = SECRET, **overrides: Any) -> str:
    claims: dict[str, Any] = {
        "sub": str(USER),
        "aud": "authenticated",
        "role": "authenticated",
        "exp": int(time.time()) + 600,
    }
    claims.update(overrides)
    return jwt.encode({k: v for k, v in claims.items() if v is not None}, secret, algorithm="HS256")


def test_valid_token_returns_user_id() -> None:
    assert verify_staff_jwt(token(), SETTINGS) == USER


@pytest.mark.parametrize(
    "bad",
    [
        token(exp=int(time.time()) - 10),
        token(aud="anon"),
        token(secret="another-secret-that-is-also-32-chars-long"),
        token(sub=None),
        token(sub="not-a-uuid"),
        token(exp=None),
        "not.a.jwt",
        "",
    ],
    ids=["expired", "wrong_aud", "wrong_secret", "no_sub", "bad_sub", "no_exp", "garbage", "empty"],
)
def test_bad_tokens_are_rejected(bad: str) -> None:
    with pytest.raises(AuthError):
        verify_staff_jwt(bad, SETTINGS)


def test_none_algorithm_is_rejected() -> None:
    unsigned = jwt.encode(
        {"sub": str(USER), "aud": "authenticated", "exp": 9999999999}, "", algorithm="none"
    )
    with pytest.raises(AuthError):
        verify_staff_jwt(unsigned, SETTINGS)


def test_hs256_without_configured_secret_is_rejected() -> None:
    with pytest.raises(AuthError):
        verify_staff_jwt(token(), Settings(supabase_jwt_secret=None))
