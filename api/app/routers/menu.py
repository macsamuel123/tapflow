from fastapi import APIRouter, Path, status

from app.deps import DbConn, api_error
from app.domain.menu import MenuItem
from app.repositories import menu as menu_repo
from app.repositories import venues as venues_repo
from app.schemas.menu import (
    MenuCategoryOut,
    MenuItemOut,
    MenuResponse,
    ModifierGroupOut,
    ModifierOut,
    TaxCategoryOut,
    VenueOut,
)
from app.schemas.sessions import SLUG_PATTERN

router = APIRouter(tags=["menu"])


def _item_out(item: MenuItem) -> MenuItemOut:
    return MenuItemOut(
        id=item.id,
        name=item.name,
        description=item.description,
        price_cents=item.price_cents,
        image_url=item.image_url,
        ingredients=list(item.ingredients),
        allergens=list(item.allergens),
        dietary_tags=list(item.dietary_tags),
        in_stock=item.in_stock,
        tax_category=TaxCategoryOut(
            name=item.tax_category.name, rate_bps=item.tax_category.rate_bps
        ),
        modifier_groups=[
            ModifierGroupOut(
                id=g.id,
                name=g.name,
                min_select=g.min_select,
                max_select=g.max_select,
                required=g.required,
                modifiers=[
                    ModifierOut(
                        id=m.id,
                        name=m.name,
                        price_delta_cents=m.price_delta_cents,
                        in_stock=m.in_stock,
                    )
                    for m in g.modifiers
                ],
            )
            for g in item.groups
        ],
    )


@router.get("/venues/{slug}/menu", response_model=MenuResponse)
async def get_menu(
    conn: DbConn, slug: str = Path(min_length=2, max_length=60, pattern=SLUG_PATTERN)
) -> MenuResponse:
    venue = await venues_repo.get_by_slug(conn, slug)
    if venue is None:
        raise api_error(status.HTTP_404_NOT_FOUND, "venue_not_found", "Venue not found.")
    categories = await menu_repo.load_menu(conn, venue.id)
    return MenuResponse(
        venue=VenueOut(slug=venue.slug, name=venue.name, currency=venue.currency),
        categories=[
            MenuCategoryOut(id=c.id, name=c.name, items=[_item_out(i) for i in c.items])
            for c in categories
            if c.items
        ],
    )
