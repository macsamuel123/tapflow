"""Postgres connection pool (psycopg 3) and FastAPI dependencies."""

from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Annotated

from fastapi import Depends, Request
from psycopg import AsyncConnection
from psycopg.rows import TupleRow
from psycopg_pool import AsyncConnectionPool

type Conn = AsyncConnection[TupleRow]
type Pool = AsyncConnectionPool[Conn]
type DbPing = Callable[[], Awaitable[bool]]

PING_TIMEOUT_SECONDS = 2.0


def create_pool(conninfo: str, *, min_size: int, max_size: int) -> Pool:
    # open=False: the app lifespan opens it without blocking, so the API can start
    # (and report a degraded /health) even when the database is down.
    return AsyncConnectionPool(
        conninfo=conninfo,
        min_size=min_size,
        max_size=max_size,
        open=False,
        kwargs={"autocommit": False},
    )


def get_pool(request: Request) -> Pool:
    pool: Pool = request.app.state.pool
    return pool


async def get_conn(
    pool: Annotated[Pool, Depends(get_pool)],
) -> AsyncIterator[Conn]:
    # Commits when the request succeeds, rolls back if it raises.
    async with pool.connection() as conn:
        yield conn


def get_db_ping(pool: Annotated[Pool, Depends(get_pool)]) -> DbPing:
    async def ping() -> bool:
        try:
            async with pool.connection(timeout=PING_TIMEOUT_SECONDS) as conn:
                cur = await conn.execute("select 1")
                row = await cur.fetchone()
                return row == (1,)
        except Exception:
            return False

    return ping
