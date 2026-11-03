"""Print signed table URLs for local development: `make qr-urls`."""

import sys

import psycopg

from app.config import get_settings
from app.domain.qr_tokens import sign_table_token

QUERY = """
select r.slug, t.id, t.label, t.qr_secret
from public.tables t
join public.restaurants r on r.id = t.restaurant_id
where t.active
order by r.slug, t.label
"""


def main() -> int:
    settings = get_settings()
    base = settings.app_base_url.rstrip("/")
    try:
        with psycopg.connect(settings.database_url, connect_timeout=3) as conn:
            rows = conn.execute(QUERY).fetchall()
    except psycopg.OperationalError as exc:
        print(f"Cannot reach database ({exc}). Is `supabase start` running?", file=sys.stderr)
        return 1
    for slug, table_id, label, secret in rows:
        token = sign_table_token(secret, slug, table_id)
        print(f"{slug:<16} {label:<10} {base}/r/{slug}/t/{table_id}?token={token}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
