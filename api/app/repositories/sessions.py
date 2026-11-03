from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from psycopg.rows import class_row

from app.db import Conn


@dataclass(frozen=True, slots=True)
class DinerSession:
    id: UUID
    restaurant_id: UUID
    restaurant_slug: str
    table_id: UUID | None
    table_label: str | None
    verified: bool
    expires_at: datetime


_SELECT = """
select s.id, s.restaurant_id, r.slug as restaurant_slug, s.table_id, t.label as table_label,
       s.verified, s.expires_at
from public.table_sessions s
join public.restaurants r on r.id = s.restaurant_id
left join public.tables t on t.id = s.table_id
"""


async def create(
    conn: Conn, *, restaurant_id: UUID, table_id: UUID | None, verified: bool
) -> DinerSession:
    cur = await conn.execute(
        "insert into public.table_sessions (restaurant_id, table_id, verified) "
        "values (%s, %s, %s) returning id",
        (restaurant_id, table_id, verified),
    )
    row = await cur.fetchone()
    session = await get_active(conn, row[0]) if row else None
    if session is None:
        raise RuntimeError("table_sessions insert returned no row")
    return session


async def get_active(conn: Conn, session_id: UUID) -> DinerSession | None:
    """The session, or None if it doesn't exist or has expired."""
    async with conn.cursor(row_factory=class_row(DinerSession)) as cur:
        await cur.execute(_SELECT + "where s.id = %s and s.expires_at > now()", (session_id,))
        return await cur.fetchone()


async def touch(conn: Conn, session_id: UUID) -> None:
    await conn.execute(
        "update public.table_sessions set last_seen_at = now() where id = %s", (session_id,)
    )
