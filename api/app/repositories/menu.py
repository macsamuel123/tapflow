"""Menu reads. One loader serves both the public menu and server-side cart validation,
so the prices a diner sees and the prices the cart charges come from the same rows."""

from collections import defaultdict
from collections.abc import Sequence
from typing import Any
from uuid import UUID

from psycopg.rows import dict_row

from app.db import Conn
from app.domain.menu import MenuCategory, MenuItem, Modifier, ModifierGroup
from app.domain.money import Cents


async def _fetch(conn: Conn, sql: str, params: Sequence[object]) -> list[dict[str, Any]]:
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(sql, params)
        return await cur.fetchall()


async def load_items(
    conn: Conn, restaurant_id: UUID, item_ids: Sequence[UUID] | None = None
) -> list[MenuItem]:
    """Items of one restaurant (optionally only `item_ids`) with their groups and modifiers,
    in menu order. Ids belonging to another restaurant are simply not returned."""
    wanted = None if item_ids is None else list(item_ids)

    items = await _fetch(
        conn,
        "select i.id, i.restaurant_id, i.category_id, i.name, i.description, i.price_cents, "
        "i.image_url, i.ingredients, i.allergens, i.dietary_tags, i.in_stock "
        "from public.menu_items i join public.menu_categories c on c.id = i.category_id "
        "where i.restaurant_id = %s and (%s::uuid[] is null or i.id = any(%s::uuid[])) "
        "order by c.sort_order, i.sort_order, i.name",
        [restaurant_id, wanted, wanted],
    )
    if not items:
        return []
    ids = [row["id"] for row in items]

    groups = await _fetch(
        conn,
        "select id, item_id, name, min_select, max_select, required from public.modifier_groups "
        "where restaurant_id = %s and item_id = any(%s) order by sort_order, name",
        [restaurant_id, ids],
    )
    modifiers = await _fetch(
        conn,
        "select m.id, m.group_id, m.name, m.price_delta_cents, m.in_stock "
        "from public.modifiers m join public.modifier_groups g on g.id = m.group_id "
        "where m.restaurant_id = %s and g.item_id = any(%s) order by m.sort_order, m.name",
        [restaurant_id, ids],
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
            restaurant_id=i["restaurant_id"],
            category_id=i["category_id"],
            name=i["name"],
            description=i["description"],
            price_cents=Cents(i["price_cents"]),
            image_url=i["image_url"],
            ingredients=tuple(i["ingredients"]),
            allergens=tuple(i["allergens"]),
            dietary_tags=tuple(i["dietary_tags"]),
            in_stock=i["in_stock"],
            groups=tuple(groups_by_item[i["id"]]),
        )
        for i in items
    ]


async def load_menu(conn: Conn, restaurant_id: UUID) -> list[MenuCategory]:
    categories = await _fetch(
        conn,
        "select id, name from public.menu_categories where restaurant_id = %s "
        "order by sort_order, name",
        [restaurant_id],
    )
    items_by_category: dict[UUID, list[MenuItem]] = defaultdict(list)
    for item in await load_items(conn, restaurant_id):
        items_by_category[item.category_id].append(item)
    return [
        MenuCategory(id=c["id"], name=c["name"], items=tuple(items_by_category[c["id"]]))
        for c in categories
    ]
