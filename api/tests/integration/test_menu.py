import httpx
import pytest

from tests.integration.conftest import NANAIMO_BAR, SLUG, requires_db

pytestmark = [pytest.mark.integration, requires_db]


async def test_menu_lists_seed_in_order(client: httpx.AsyncClient) -> None:
    res = await client.get(f"/venues/{SLUG}/menu")
    assert res.status_code == 200
    body = res.json()
    assert body["venue"] == {
        "slug": SLUG,
        "name": "Demo Bistro",
        "currency": "CAD",
    }
    assert [c["name"] for c in body["categories"]] == ["Starters", "Mains", "Desserts", "Drinks"]
    items = [i for c in body["categories"] for i in c["items"]]
    assert len(items) >= 20
    burger = next(i for i in items if i["name"] == "Bistro Burger")
    gst = {"code": "GST", "name": "Goods and Services Tax", "rate_bps": 500}
    pst = {"code": "PST", "name": "Provincial Sales Tax", "rate_bps": 1000}
    assert burger["tax_category"] == {"name": "Food", "taxes": [gst]}
    lager = next(i for i in items if i["name"] == "House Lager")
    assert lager["tax_category"] == {"name": "Alcohol", "taxes": [gst, pst]}
    assert burger["price_cents"] == 2200
    assert [g["name"] for g in burger["modifier_groups"]] == ["Doneness", "Add-ons"]
    doneness, addons = burger["modifier_groups"]
    assert (doneness["min_select"], doneness["max_select"], doneness["required"]) == (1, 1, True)
    assert (addons["min_select"], addons["max_select"], addons["required"]) == (0, 3, False)
    assert [m["name"] for m in addons["modifiers"]] == [
        "Bacon",
        "Avocado",
        "Fried egg",
        "Extra cheddar",
    ]


async def test_nanaimo_bar_listed_as_sold_out(client: httpx.AsyncClient) -> None:
    body = (await client.get(f"/venues/{SLUG}/menu")).json()
    nanaimo = next(i for c in body["categories"] for i in c["items"] if i["id"] == str(NANAIMO_BAR))
    assert nanaimo["in_stock"] is False


async def test_menu_exposes_no_secrets_or_internal_fields(client: httpx.AsyncClient) -> None:
    text = (await client.get(f"/venues/{SLUG}/menu")).text
    for leaked in ("qr_secret", "dev-only-qr-secret", "platform_fee", "stripe"):
        assert leaked not in text


async def test_unknown_venue_404(client: httpx.AsyncClient) -> None:
    assert (await client.get("/venues/no-such-place/menu")).status_code == 404
