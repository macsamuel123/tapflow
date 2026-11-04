"""Touchpoints (tables, seats, loungers, carts, rooms, counters). The only module that reads
`touchpoints.qr_secret`."""

from dataclasses import dataclass
from uuid import UUID

from psycopg.rows import class_row

from app.db import Conn


@dataclass(frozen=True, slots=True)
class TouchpointWithSecret:
    id: UUID
    venue_id: UUID
    label: str
    kind: str
    qr_secret: str
    active: bool


async def get_with_secret(
    conn: Conn, venue_id: UUID, touchpoint_id: UUID
) -> TouchpointWithSecret | None:
    async with conn.cursor(row_factory=class_row(TouchpointWithSecret)) as cur:
        await cur.execute(
            "select id, venue_id, label, kind::text as kind, qr_secret, active "
            "from public.touchpoints where id = %s and venue_id = %s",
            (touchpoint_id, venue_id),
        )
        return await cur.fetchone()


async def rotate_qr_secret(conn: Conn, touchpoint_id: UUID) -> None:
    """Issue a fresh random secret. Every QR printed with the old one stops verifying."""
    await conn.execute(
        "update public.touchpoints set qr_secret = encode(extensions.gen_random_bytes(32), 'hex') "
        "where id = %s",
        (touchpoint_id,),
    )
