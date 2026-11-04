"""Menu reads. One loader serves both the public menu and server-side cart validation,
so the prices and tax rates a diner sees and the ones the cart charges come from the same rows."""

from collections import defaultdict
from collections.abc import Sequence
from typing import Any
from uuid import UUID

from psycopg.rows import dict_row

from app.db import Conn
from app.domain.menu import MenuCategory, MenuItem, Modifier, ModifierGroup, TaxCategory
from app.domain.money import Cents
from app.domain.pricing import Tax


async def _fetch(conn: Conn, sql: str, params: Sequence[object]) -> list[dict[str, Any]]:
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(sql, params)
        return await cur.fetchall()


async def load_items(
    conn: Conn, venue_id: UUID, item_ids: Sequence[UUID] | None = None
) -> list[MenuItem]:
    """Items of one venue (optionally only `item_ids`) with their tax category, groups and
    modifiers, in menu order. Ids belonging to another venue are simply not returned."""
    wanted = None if item_ids is None else list(item_ids)

    items = await _fetch(
        conn,
        "select i.id, i.venue_id, i.category_id, i.name, i.description, i.price_cents, "
        "i.image_url, i.ingredients, i.allergens, i.dietary_tags, i.in_stock, "
        "tc.id as tax_category_id, tc.name as tax_category_name "
        "from public.menu_items i "
        "join public.menu_categories c on c.id = i.category_id "
        "join public.tax_categories tc on tc.id = i.tax_category_id "
        "where i.venue_id = %s and (%s::uuid[] is null or i.id = any(%s::uuid[])) "
        "order by c.sort_order, i.sort_order, i.name",
        [venue_id, wanted, wanted],
    )
    if not items:
        return []
    ids = [row["id"] for row in items]

    tax_rows = await _fetch(
        conn,
        "select ctt.tax_category_id, t.id, t.code, t.name, t.rate_bps "
        "from public.tax_category_taxes ctt join public.taxes t on t.id = ctt.tax_id "
        "where ctt.venue_id = %s order by t.code",
        [venue_id],
    )
    taxes_by_category: dict[UUID, list[Tax]] = defaultdict(list)
    for t in tax_rows:
        taxes_by_category[t["tax_category_id"]].append(
            Tax(id=t["id"], code=t["code"], name=t["name"], rate_bps=t["rate_bps"])
        )

    groups = await _fetch(
        conn,
        "select id, item_id, name, min_select, max_select, required from public.modifier_groups "
        "where venue_id = %s and item_id = any(%s) order by sort_order, name",
        [venue_id, ids],
    )
    modifiers = await _fetch(
        conn,
        "select m.id, m.group_id, m.name, m.price_delta_cents, m.in_stock "
        "from public.modifiers m join public.modifier_groups g on g.id = m.group_id "
        "where m.venue_id = %s and g.item_id = any(%s) order by m.sort_order, m.name",
        [venue_id, ids],
    )

    mods_by_group: dict[UUID, list[Modifier]] = defaultdict(list)
    for m in modifiers:
        mods_by_group[m["group_id"]].append(
            Modifier(
                id=m["id"],
                group_id=m["group_id"],
                name=m["name"],
                price_delta_cents=Cents(m["price_delta_cents"]),
                in_stock=m["in_stock"],
            )
        )
    groups_by_item: dict[UUID, list[ModifierGroup]] = defaultdict(list)
    for g in groups:
        groups_by_item[g["item_id"]].append(
            ModifierGroup(
                id=g["id"],
                item_id=g["item_id"],
                name=g["name"],
                min_select=g["min_select"],
                max_select=g["max_select"],
                required=g["required"],
                modifiers=tuple(mods_by_group[g["id"]]),
            )
        )
    return [
        MenuItem(
            id=i["id"],
            venue_id=i["venue_id"],
            category_id=i["category_id"],
            name=i["name"],
            description=i["description"],
            price_cents=Cents(i["price_cents"]),
            image_url=i["image_url"],
            ingredients=tuple(i["ingredients"]),
            allergens=tuple(i["allergens"]),
            dietary_tags=tuple(i["dietary_tags"]),
            in_stock=i["in_stock"],
            tax_category=TaxCategory(
                id=i["tax_category_id"],
                name=i["tax_category_name"],
                taxes=tuple(taxes_by_category[i["tax_category_id"]]),
            ),
            groups=tuple(groups_by_item[i["id"]]),
        )
        for i in items
    ]


async def load_menu(conn: Conn, venue_id: UUID) -> list[MenuCategory]:
    categories = await _fetch(
        conn,
        "select id, name from public.menu_categories where venue_id = %s order by sort_order, name",
        [venue_id],
    )
    items_by_category: dict[UUID, list[MenuItem]] = defaultdict(list)
    for item in await load_items(conn, venue_id):
        items_by_category[item.category_id].append(item)
    return [
        MenuCategory(id=c["id"], name=c["name"], items=tuple(items_by_category[c["id"]]))
        for c in categories
    ]
