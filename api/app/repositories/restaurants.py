from dataclasses import dataclass
from uuid import UUID

from psycopg.rows import class_row

from app.db import Conn


@dataclass(frozen=True, slots=True)
class Restaurant:
    id: UUID
    slug: str
    name: str
    currency: str
    tax_rate_bps: int
    platform_fee_bps: int


async def get_by_slug(conn: Conn, slug: str) -> Restaurant | None:
    async with conn.cursor(row_factory=class_row(Restaurant)) as cur:
        await cur.execute(
            "select id, slug, name, currency, tax_rate_bps, platform_fee_bps "
            "from public.restaurants where slug = %s",
            (slug,),
        )
        return await cur.fetchone()


async def get_by_id(conn: Conn, restaurant_id: UUID) -> Restaurant | None:
    async with conn.cursor(row_factory=class_row(Restaurant)) as cur:
        await cur.execute(
            "select id, slug, name, currency, tax_rate_bps, platform_fee_bps "
            "from public.restaurants where id = %s",
            (restaurant_id,),
        )
        return await cur.fetchone()
