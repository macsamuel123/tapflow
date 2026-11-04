from uuid import UUID

from app.schemas.base import Outbound


class ModifierOut(Outbound):
    id: UUID
    name: str
    price_delta_cents: int
    in_stock: bool


class ModifierGroupOut(Outbound):
    id: UUID
    name: str
    min_select: int
    max_select: int
    required: bool
    modifiers: list[ModifierOut]


class TaxOut(Outbound):
    code: str
    name: str
    rate_bps: int


class TaxCategoryOut(Outbound):
    name: str
    taxes: list[TaxOut]


class MenuItemOut(Outbound):
    id: UUID
    name: str
    description: str
    price_cents: int
    image_url: str | None
    ingredients: list[str]
    allergens: list[str]
    dietary_tags: list[str]
    in_stock: bool
    tax_category: TaxCategoryOut
    modifier_groups: list[ModifierGroupOut]


class MenuCategoryOut(Outbound):
    id: UUID
    name: str
    items: list[MenuItemOut]


class VenueOut(Outbound):
    slug: str
    name: str
    currency: str


class MenuResponse(Outbound):
    venue: VenueOut
    categories: list[MenuCategoryOut]
