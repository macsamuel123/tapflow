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


async def get_by_slug(conn: Conn, slug: str) -> Venue | None:
    async with conn.cursor(row_factory=class_row(Venue)) as cur:
        await cur.execute(
            "select id, slug, name, currency, platform_fee_bps from public.venues where slug = %s",
            (slug,),
        )
        return await cur.fetchone()


async def get_by_id(conn: Conn, venue_id: UUID) -> Venue | None:
    async with conn.cursor(row_factory=class_row(Venue)) as cur:
        await cur.execute(
            "select id, slug, name, currency, platform_fee_bps from public.venues where id = %s",
            (venue_id,),
        )
        return await cur.fetchone()
