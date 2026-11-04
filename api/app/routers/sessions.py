from fastapi import APIRouter, status

from app.deps import AppSettings, CurrentSession, DbConn, api_error
from app.domain.qr_tokens import verify_touchpoint_token
from app.domain.session_tokens import issue_session_token
from app.repositories import sessions as sessions_repo
from app.repositories import touchpoints as touchpoints_repo
from app.repositories import venues as venues_repo
from app.repositories.sessions import DinerSession
from app.schemas.sessions import CreateSessionRequest, CreateSessionResponse, SessionResponse

router = APIRouter(prefix="/sessions", tags=["sessions"])


def _out(session: DinerSession) -> SessionResponse:
    return SessionResponse(
        session_id=session.id,
        venue_slug=session.venue_slug,
        touchpoint_id=session.touchpoint_id,
        touchpoint_label=session.touchpoint_label,
        touchpoint_kind=session.touchpoint_kind,
        verified=session.verified,
        expires_at=session.expires_at,
    )


@router.post("", status_code=status.HTTP_201_CREATED, response_model=CreateSessionResponse)
async def create_session(
    body: CreateSessionRequest, conn: DbConn, settings: AppSettings
) -> CreateSessionResponse:
    """Start a diner session from a touchpoint QR URL.

    A valid signed token → verified (may check out). A missing or invalid token, an unknown or
    inactive touchpoint → unverified (browse only). Never an error, so a bad QR still shows
    the menu.
    """
    venue = await venues_repo.get_by_slug(conn, body.venue_slug)
    if venue is None:
        raise api_error(status.HTTP_404_NOT_FOUND, "venue_not_found", "Venue not found.")

    touchpoint = None
    if body.touchpoint_id is not None:
        touchpoint = await touchpoints_repo.get_with_secret(conn, venue.id, body.touchpoint_id)
        if touchpoint is not None and not touchpoint.active:
            touchpoint = None
    verified = touchpoint is not None and verify_touchpoint_token(
        touchpoint.qr_secret, venue.slug, touchpoint.id, body.token
    )

    session = await sessions_repo.create(
        conn,
        venue_id=venue.id,
        touchpoint_id=touchpoint.id if touchpoint else None,
        verified=verified,
    )
    token = issue_session_token(settings.session_secret.get_secret_value(), session.id)
    return CreateSessionResponse(**_out(session).model_dump(), session_token=token)


@router.get("/me", response_model=SessionResponse)
async def get_session(session: CurrentSession) -> SessionResponse:
    return _out(session)
