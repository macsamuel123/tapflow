"""Physical dining tables. The only module that reads `tables.qr_secret`."""

from dataclasses import dataclass
from uuid import UUID

from psycopg.rows import class_row

from app.db import Conn


@dataclass(frozen=True, slots=True)
class TableWithSecret:
    id: UUID
    restaurant_id: UUID
    label: str
    qr_secret: str
    active: bool


async def get_with_secret(
    conn: Conn, restaurant_id: UUID, table_id: UUID
) -> TableWithSecret | None:
    async with conn.cursor(row_factory=class_row(TableWithSecret)) as cur:
        await cur.execute(
            "select id, restaurant_id, label, qr_secret, active from public.tables "
            "where id = %s and restaurant_id = %s",
            (table_id, restaurant_id),
        )
        return await cur.fetchone()


async def rotate_qr_secret(conn: Conn, table_id: UUID) -> None:
    """Issue a fresh random secret. Every QR printed with the old one stops verifying."""
    await conn.execute(
        "update public.tables set qr_secret = encode(extensions.gen_random_bytes(32), 'hex') "
        "where id = %s",
        (table_id,),
    )
