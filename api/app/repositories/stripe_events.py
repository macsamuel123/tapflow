"""Processed Stripe events. The primary key on event_id makes webhook delivery idempotent."""

from app.db import Conn


async def record(conn: Conn, event_id: str, event_type: str) -> bool:
    """True the first time this event is seen; False for a replay."""
    cur = await conn.execute(
        "insert into public.stripe_events (event_id, type) values (%s, %s) "
        "on conflict (event_id) do nothing returning event_id",
        (event_id, event_type),
    )
    return await cur.fetchone() is not None
