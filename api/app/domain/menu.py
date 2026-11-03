"""Menu domain objects, loaded from the DB by repositories/menu.py."""

from dataclasses import dataclass
from uuid import UUID

from app.domain.money import Cents


@dataclass(frozen=True, slots=True)
class Modifier:
    id: UUID
    group_id: UUID
    name: str
    price_delta_cents: Cents
    in_stock: bool


@dataclass(frozen=True, slots=True)
class ModifierGroup:
    id: UUID
    item_id: UUID
    name: str
    min_select: int
    max_select: int
    required: bool
    modifiers: tuple[Modifier, ...]


@dataclass(frozen=True, slots=True)
class MenuItem:
    id: UUID
    restaurant_id: UUID
    category_id: UUID
    name: str
    description: str
    price_cents: Cents
    image_url: str | None
    ingredients: tuple[str, ...]
    allergens: tuple[str, ...]
    dietary_tags: tuple[str, ...]
    in_stock: bool
    groups: tuple[ModifierGroup, ...]


@dataclass(frozen=True, slots=True)
class MenuCategory:
    id: UUID
    name: str
    items: tuple[MenuItem, ...]
