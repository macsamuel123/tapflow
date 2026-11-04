"""Runs against the local Supabase Postgres; skipped when it isn't reachable."""

import psycopg
import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import create_app

pytestmark = pytest.mark.integration


def _db_available() -> bool:
    try:
        with psycopg.connect(get_settings().database_url, connect_timeout=2):
            return True
    except psycopg.OperationalError:
        return False


@pytest.mark.skipif(not _db_available(), reason="local Supabase Postgres not running")
def test_health_against_real_db() -> None:
    with TestClient(create_app()) as client:  # runs lifespan → real pool
        res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "db": "ok"}


@pytest.mark.skipif(not _db_available(), reason="local Supabase Postgres not running")
def test_seed_loaded() -> None:
    with psycopg.connect(get_settings().database_url) as conn:
        row = conn.execute(
            "select currency, timezone from public.venues where slug = 'demo-bistro'"
        ).fetchone()
        assert row == ("CAD", "America/Vancouver")
        rates = conn.execute(
            "select tc.name, t.code, t.rate_bps from public.tax_categories tc "
            "join public.tax_category_taxes ctt on ctt.tax_category_id = tc.id "
            "join public.taxes t on t.id = ctt.tax_id "
            "join public.venues v on v.id = tc.venue_id where v.slug = 'demo-bistro' "
            "order by tc.name, t.code"
        ).fetchall()
        assert rates == [("Alcohol", "GST", 500), ("Alcohol", "PST", 1000), ("Food", "GST", 500)]
        n_items = conn.execute("select count(*) from public.menu_items").fetchone()
        assert n_items is not None and n_items[0] >= 20
