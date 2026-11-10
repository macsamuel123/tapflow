"""Shared FastAPI dependencies."""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, HTTPException, Request, status

from app.auth.supabase_jwt import AuthError, verify_staff_jwt
from app.config import Settings
from app.db import Conn, get_conn
from app.domain.session_tokens import parse_session_token
from app.payments.gateway import PaymentGateway
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


def get_payment_gateway(request: Request) -> PaymentGateway:
    gateway: PaymentGateway = request.app.state.payments
    return gateway


PaymentGatewayDep = Annotated[PaymentGateway, Depends(get_payment_gateway)]


def get_staff_user(
    settings: AppSettings,
    authorization: Annotated[str | None, Header()] = None,
) -> UUID:
    """The Supabase user id from `Authorization: Bearer <access token>`, else 401.
    Sync on purpose: a JWKS fetch then runs in FastAPI's threadpool."""
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise api_error(status.HTTP_401_UNAUTHORIZED, "auth_required", "Sign in to continue.")
    try:
        return verify_staff_jwt(token.strip(), settings)
    except AuthError as err:
        raise api_error(
            status.HTTP_401_UNAUTHORIZED, "auth_invalid", "Your sign-in has expired."
        ) from err


CurrentStaffUser = Annotated[UUID, Depends(get_staff_user)]
