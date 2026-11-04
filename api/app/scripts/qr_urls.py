"""Print signed touchpoint URLs for local development: `make qr-urls`."""

import sys

import psycopg

from app.config import get_settings
from app.domain.qr_tokens import sign_touchpoint_token

QUERY = """
select v.slug, t.id, t.label, t.kind::text, t.qr_secret
from public.touchpoints t
join public.venues v on v.id = t.venue_id
where t.active
order by v.slug, t.label
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
    for slug, touchpoint_id, label, kind, secret in rows:
        token = sign_touchpoint_token(secret, slug, touchpoint_id)
        print(f"{slug:<16} {kind:<8} {label:<10} {base}/v/{slug}/p/{touchpoint_id}?token={token}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
