"""Application settings, loaded from environment variables (and api/.env in development)."""

from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_base_url: str = "http://localhost:3000"

    # Database (local Supabase default)
    database_url: str = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
    db_pool_min: int = Field(default=1, ge=0)
    db_pool_max: int = Field(default=10, ge=1)

    # Diner session tokens (HMAC key). Must be overridden outside local dev.
    session_secret: SecretStr = SecretStr("dev-only-session-secret-change-me")

    # Default platform fee for newly created venues, in basis points.
    platform_fee_bps: int = Field(default=300, ge=0, le=10_000)

    # Supabase
    supabase_url: str = "http://127.0.0.1:54321"
    supabase_anon_key: SecretStr | None = None
    supabase_service_role_key: SecretStr | None = None
    supabase_jwt_secret: SecretStr | None = None

    # Stripe (required from M3)
    stripe_secret_key: SecretStr | None = None
    stripe_publishable_key: str | None = None
    stripe_webhook_secret: SecretStr | None = None
    stripe_connect_webhook_secret: SecretStr | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
