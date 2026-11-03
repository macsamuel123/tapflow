from datetime import datetime
from uuid import UUID

from pydantic import Field

from app.schemas.base import Inbound, Outbound

SLUG_PATTERN = r"^[a-z0-9]+(-[a-z0-9]+)*$"


class CreateSessionRequest(Inbound):
    restaurant_slug: str = Field(min_length=2, max_length=60, pattern=SLUG_PATTERN)
    table_id: UUID | None = None
    # The `token` query parameter from the table QR URL. Missing/invalid → browse-only session.
    token: str | None = Field(default=None, max_length=128)


class SessionResponse(Outbound):
    session_id: UUID
    restaurant_slug: str
    table_id: UUID | None
    table_label: str | None
    verified: bool
    expires_at: datetime


class CreateSessionResponse(SessionResponse):
    session_token: str
