"""Cart lines. Only ids, quantity and notes are stored; prices are always recomputed
from the menu on read (and again at checkout)."""

from dataclasses import dataclass
from uuid import UUID

from psycopg.rows import class_row

from app.db import Conn


@dataclass(frozen=True, slots=True)
class CartLine:
    id: UUID
    item_id: UUID
    modifier_ids: list[UUID]
    quantity: int
    notes: str


def canonical_modifier_ids(modifier_ids: list[UUID]) -> list[UUID]:
    """Stable order so the same choice always produces the same stored array."""
    return sorted(set(modifier_ids), key=str)


async def list_lines(conn: Conn, session_id: UUID) -> list[CartLine]:
    async with conn.cursor(row_factory=class_row(CartLine)) as cur:
        await cur.execute(
            "select id, item_id, modifier_ids, quantity, notes from public.cart_items "
            "where session_id = %s order by created_at, id",
            (session_id,),
        )
        return await cur.fetchall()


async def count_lines(conn: Conn, session_id: UUID) -> int:
    cur = await conn.execute(
        "select count(*) from public.cart_items where session_id = %s", (session_id,)
    )
    row = await cur.fetchone()
    return int(row[0]) if row else 0


async def get_line(conn: Conn, session_id: UUID, line_id: UUID) -> CartLine | None:
    async with conn.cursor(row_factory=class_row(CartLine)) as cur:
        await cur.execute(
            "select id, item_id, modifier_ids, quantity, notes from public.cart_items "
            "where id = %s and session_id = %s",
            (line_id, session_id),
        )
        return await cur.fetchone()


async def find_identical(
    conn: Conn, session_id: UUID, item_id: UUID, modifier_ids: list[UUID], notes: str
) -> CartLine | None:
    async with conn.cursor(row_factory=class_row(CartLine)) as cur:
        await cur.execute(
            "select id, item_id, modifier_ids, quantity, notes from public.cart_items "
            "where session_id = %s and item_id = %s and modifier_ids = %s::uuid[] and notes = %s "
            "limit 1",
            (session_id, item_id, canonical_modifier_ids(modifier_ids), notes),
        )
        return await cur.fetchone()


async def insert_line(
    conn: Conn,
    session_id: UUID,
    *,
    item_id: UUID,
    modifier_ids: list[UUID],
    quantity: int,
    notes: str,
) -> UUID:
    cur = await conn.execute(
        # clock_timestamp(), not the now() default: lines added in one transaction still get
        # distinct times, so the cart keeps insertion order.
        "insert into public.cart_items "
        "(session_id, item_id, modifier_ids, quantity, notes, created_at) "
        "values (%s, %s, %s::uuid[], %s, %s, clock_timestamp()) returning id",
        (session_id, item_id, canonical_modifier_ids(modifier_ids), quantity, notes),
    )
    row = await cur.fetchone()
    if row is None:
        raise RuntimeError("cart_items insert returned no row")
    line_id: UUID = row[0]
    return line_id


async def update_line(
    conn: Conn, session_id: UUID, line_id: UUID, *, quantity: int, notes: str
) -> bool:
    cur = await conn.execute(
        "update public.cart_items set quantity = %s, notes = %s where id = %s and session_id = %s",
        (quantity, notes, line_id, session_id),
    )
    return cur.rowcount == 1


async def delete_line(conn: Conn, session_id: UUID, line_id: UUID) -> bool:
    cur = await conn.execute(
        "delete from public.cart_items where id = %s and session_id = %s", (line_id, session_id)
    )
    return cur.rowcount == 1


async def clear(conn: Conn, session_id: UUID) -> None:
    await conn.execute("delete from public.cart_items where session_id = %s", (session_id,))
