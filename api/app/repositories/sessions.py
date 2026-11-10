from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from psycopg.rows import class_row

from app.db import Conn


@dataclass(frozen=True, slots=True)
class DinerSession:
    id: UUID
    venue_id: UUID
    venue_slug: str
    touchpoint_id: UUID | None
    touchpoint_label: str | None
    touchpoint_kind: str | None
    verified: bool
    expires_at: datetime
    # The touchpoint's mode; a session without a touchpoint browses only, as delivery.
    service_mode: str


_SELECT = """
select s.id, s.venue_id, v.slug as venue_slug, s.touchpoint_id,
       t.label as touchpoint_label, t.kind::text as touchpoint_kind,
       s.verified, s.expires_at,
       coalesce(t.service_mode::text, 'delivery') as service_mode
from public.touchpoint_sessions s
join public.venues v on v.id = s.venue_id
left join public.touchpoints t on t.id = s.touchpoint_id
"""


async def create(
    conn: Conn, *, venue_id: UUID, touchpoint_id: UUID | None, verified: bool
) -> DinerSession:
    cur = await conn.execute(
        "insert into public.touchpoint_sessions (venue_id, touchpoint_id, verified) "
        "values (%s, %s, %s) returning id",
        (venue_id, touchpoint_id, verified),
    )
    row = await cur.fetchone()
    session = await get_active(conn, row[0]) if row else None
    if session is None:
        raise RuntimeError("touchpoint_sessions insert returned no row")
    return session


async def get_active(conn: Conn, session_id: UUID) -> DinerSession | None:
    """The session, or None if it doesn't exist or has expired."""
    async with conn.cursor(row_factory=class_row(DinerSession)) as cur:
        await cur.execute(_SELECT + "where s.id = %s and s.expires_at > now()", (session_id,))
        return await cur.fetchone()


async def touch(conn: Conn, session_id: UUID) -> None:
    await conn.execute(
        "update public.touchpoint_sessions set last_seen_at = now() where id = %s", (session_id,)
    )


async def lock(conn: Conn, session_id: UUID) -> None:
    """Serialize checkouts of one session (double taps, two tabs)."""
    await conn.execute(
        "select id from public.touchpoint_sessions where id = %s for update", (session_id,)
    )
