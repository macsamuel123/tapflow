from datetime import datetime
from uuid import UUID

from pydantic import Field

from app.schemas.base import Inbound, Outbound

SLUG_PATTERN = r"^[a-z0-9]+(-[a-z0-9]+)*$"


class CreateSessionRequest(Inbound):
    venue_slug: str = Field(min_length=2, max_length=60, pattern=SLUG_PATTERN)
    touchpoint_id: UUID | None = None
    # The `token` query parameter from the touchpoint QR URL. Missing/invalid → browse-only.
    token: str | None = Field(default=None, max_length=128)


class SessionResponse(Outbound):
    session_id: UUID
    venue_slug: str
    touchpoint_id: UUID | None
    touchpoint_label: str | None
    touchpoint_kind: str | None
    verified: bool
    expires_at: datetime


class CreateSessionResponse(SessionResponse):
    session_token: str
