from dataclasses import dataclass
from uuid import UUID

from psycopg.rows import class_row

from app.db import Conn


@dataclass(frozen=True, slots=True)
class Venue:
    id: UUID
    slug: str
    name: str
    currency: str
    platform_fee_bps: int


_SELECT = (
    "select v.id, v.slug, v.name, v.currency, s.platform_fee_bps "
    "from public.venues v join public.venue_payment_settings s on s.venue_id = v.id "
)


async def get_by_slug(conn: Conn, slug: str) -> Venue | None:
    async with conn.cursor(row_factory=class_row(Venue)) as cur:
        await cur.execute(_SELECT + "where v.slug = %s", (slug,))
        return await cur.fetchone()


async def get_by_id(conn: Conn, venue_id: UUID) -> Venue | None:
    async with conn.cursor(row_factory=class_row(Venue)) as cur:
        await cur.execute(_SELECT + "where v.id = %s", (venue_id,))
        return await cur.fetchone()
