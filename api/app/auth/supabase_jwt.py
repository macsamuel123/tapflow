"""Staff authentication: verify a Supabase Auth access token and return the user id.

HS256 tokens are checked with SUPABASE_JWT_SECRET. ES256/RS256 tokens (newer Supabase signing
keys) are checked against the project's JWKS. `aud` must be "authenticated"; `exp` and `sub`
are required.
"""

from functools import lru_cache
from uuid import UUID

import jwt

from app.config import Settings

AUDIENCE = "authenticated"
_ASYMMETRIC = frozenset({"ES256", "RS256"})


class AuthError(Exception):
    pass


@lru_cache(maxsize=8)
def _jwks_client(url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(url, cache_keys=True)


def verify_staff_jwt(token: str, settings: Settings) -> UUID:
    try:
        alg = jwt.get_unverified_header(token).get("alg")
        key: object
        if alg == "HS256":
            if settings.supabase_jwt_secret is None:
                raise AuthError("SUPABASE_JWT_SECRET is not configured")
            key = settings.supabase_jwt_secret.get_secret_value()
        elif alg in _ASYMMETRIC:
            jwks = _jwks_client(
                f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
            )
            key = jwks.get_signing_key_from_jwt(token).key
        else:
            raise AuthError(f"unsupported token algorithm: {alg}")
        claims = jwt.decode(
            token,
            key,  # type: ignore[arg-type]
            algorithms=[str(alg)],
            audience=AUDIENCE,
            options={"require": ["exp", "sub", "aud"]},
        )
        return UUID(str(claims["sub"]))
    except AuthError:
        raise
    except (jwt.PyJWTError, ValueError, KeyError) as exc:
        raise AuthError("invalid token") from exc
