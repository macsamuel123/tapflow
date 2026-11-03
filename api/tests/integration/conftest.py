"""Integration fixtures: real local Supabase Postgres, one rolled-back transaction per test.

The app's `get_conn` dependency is overridden to hand every request the test's connection,
so API writes and the test's own setup/assertions see the same uncommitted data.
Fixture SQL here is test setup only; application SQL lives in app/repositories/.
"""

from collections.abc import AsyncIterator
from typing import Any
from uuid import UUID

import httpx
import psycopg
import pytest
from psycopg import AsyncConnection

from app.config import get_settings
from app.db import Conn, get_conn
from app.domain.qr_tokens import sign_table_token
from app.main import create_app

SLUG = "demo-bistro"
RESTAURANT_ID = UUID("b0000000-0000-4000-8000-000000000001")
TABLE_1 = UUID("c0000000-0000-4000-8000-000000000001")
TABLE_2 = UUID("c0000000-0000-4000-8000-000000000002")
TABLE_1_SECRET = "dev-only-qr-secret-table-01"

BURGER = UUID("e0000000-0000-4000-8000-000000000201")
LATTE = UUID("e0000000-0000-4000-8000-000000000401")
FRIES = UUID("e0000000-0000-4000-8000-000000000101")
AMERICANO = UUID("e0000000-0000-4000-8000-000000000402")
NANAIMO_BAR = UUID("e0000000-0000-4000-8000-000000000304")


def _db_available() -> bool:
    try:
        with psycopg.connect(get_settings().database_url, connect_timeout=2):
            return True
    except psycopg.OperationalError:
        return False


DB_AVAILABLE = _db_available()
requires_db = pytest.mark.skipif(not DB_AVAILABLE, reason="local Supabase Postgres not running")


def table_token(table_id: UUID = TABLE_1, secret: str = TABLE_1_SECRET, slug: str = SLUG) -> str:
    return sign_table_token(secret, slug, table_id)


@pytest.fixture
async def db() -> AsyncIterator[Conn]:
    conn = await AsyncConnection.connect(get_settings().database_url, autocommit=False)
    try:
        yield conn
    finally:
        await conn.rollback()
        await conn.close()


@pytest.fixture
async def client(db: Conn) -> AsyncIterator[httpx.AsyncClient]:
    app = create_app()

    async def shared_conn() -> AsyncIterator[Conn]:
        yield db

    app.dependency_overrides[get_conn] = shared_conn
    # ASGITransport doesn't run the lifespan, so no pool is opened.
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def start_session(
    client: httpx.AsyncClient, *, verified: bool = True, table_id: UUID = TABLE_1
) -> dict[str, Any]:
    body: dict[str, Any] = {"restaurant_slug": SLUG, "table_id": str(table_id)}
    if verified:
        body["token"] = table_token(table_id, secret=f"dev-only-qr-secret-table-0{_n(table_id)}")
    res = await client.post("/sessions", json=body)
    assert res.status_code == 201, res.text
    data: dict[str, Any] = res.json()
    assert data["verified"] is verified
    return data


def _n(table_id: UUID) -> int:
    return int(str(table_id)[-1])


def auth(session: dict[str, Any]) -> dict[str, str]:
    return {"X-Session-Token": session["session_token"]}


async def modifier_ids(client: httpx.AsyncClient) -> dict[tuple[UUID, str], UUID]:
    """(item_id, modifier name) -> modifier id, from the public menu (seed ids are random)."""
    res = await client.get(f"/restaurants/{SLUG}/menu")
    assert res.status_code == 200
    out: dict[tuple[UUID, str], UUID] = {}
    for cat in res.json()["categories"]:
        for it in cat["items"]:
            for g in it["modifier_groups"]:
                for m in g["modifiers"]:
                    out[(UUID(it["id"]), m["name"])] = UUID(m["id"])
    return out
