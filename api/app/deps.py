"""Shared FastAPI dependencies."""

from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status

from app.config import Settings
from app.db import Conn, get_conn
from app.domain.session_tokens import parse_session_token
from app.repositories import sessions as sessions_repo
from app.repositories.sessions import DinerSession

SESSION_HEADER = "X-Session-Token"


def get_app_settings(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


DbConn = Annotated[Conn, Depends(get_conn)]
AppSettings = Annotated[Settings, Depends(get_app_settings)]


def api_error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message})


async def get_diner_session(
    conn: DbConn,
    settings: AppSettings,
    x_session_token: Annotated[str | None, Header(alias=SESSION_HEADER)] = None,
) -> DinerSession:
    session_id = parse_session_token(settings.session_secret.get_secret_value(), x_session_token)
    session = await sessions_repo.get_active(conn, session_id) if session_id else None
    if session is None:
        raise api_error(
            status.HTTP_401_UNAUTHORIZED,
            "session_invalid",
            "Your session has expired. Scan the QR at your touchpoint again.",
        )
    return session


CurrentSession = Annotated[DinerSession, Depends(get_diner_session)]
