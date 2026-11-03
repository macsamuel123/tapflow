from fastapi import APIRouter, status

from app.deps import AppSettings, CurrentSession, DbConn, api_error
from app.domain.qr_tokens import verify_table_token
from app.domain.session_tokens import issue_session_token
from app.repositories import restaurants as restaurants_repo
from app.repositories import sessions as sessions_repo
from app.repositories import tables as tables_repo
from app.repositories.sessions import DinerSession
from app.schemas.sessions import CreateSessionRequest, CreateSessionResponse, SessionResponse

router = APIRouter(prefix="/sessions", tags=["sessions"])


def _out(session: DinerSession) -> SessionResponse:
    return SessionResponse(
        session_id=session.id,
        restaurant_slug=session.restaurant_slug,
        table_id=session.table_id,
        table_label=session.table_label,
        verified=session.verified,
        expires_at=session.expires_at,
    )


@router.post("", status_code=status.HTTP_201_CREATED, response_model=CreateSessionResponse)
async def create_session(
    body: CreateSessionRequest, conn: DbConn, settings: AppSettings
) -> CreateSessionResponse:
    """Start a diner session from a table QR URL.

    A valid signed token → verified (may check out). A missing or invalid token, an unknown or
    inactive table → unverified (browse only). Never an error, so a bad QR still shows the menu.
    """
    restaurant = await restaurants_repo.get_by_slug(conn, body.restaurant_slug)
    if restaurant is None:
        raise api_error(status.HTTP_404_NOT_FOUND, "restaurant_not_found", "Restaurant not found.")

    table = None
    if body.table_id is not None:
        table = await tables_repo.get_with_secret(conn, restaurant.id, body.table_id)
        if table is not None and not table.active:
            table = None
    verified = table is not None and verify_table_token(
        table.qr_secret, restaurant.slug, table.id, body.token
    )

    session = await sessions_repo.create(
        conn,
        restaurant_id=restaurant.id,
        table_id=table.id if table else None,
        verified=verified,
    )
    token = issue_session_token(settings.session_secret.get_secret_value(), session.id)
    return CreateSessionResponse(**_out(session).model_dump(), session_token=token)


@router.get("/me", response_model=SessionResponse)
async def get_session(session: CurrentSession) -> SessionResponse:
    return _out(session)
