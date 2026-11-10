"""venue_payment_settings: platform fee and the venue's Stripe connected account."""

from dataclasses import dataclass
from uuid import UUID

from psycopg.rows import class_row

from app.db import Conn


@dataclass(frozen=True, slots=True)
class PaymentSettings:
    venue_id: UUID
    platform_fee_bps: int
    stripe_account_id: str | None
    stripe_charges_enabled: bool


async def get_for_venue(conn: Conn, venue_id: UUID) -> PaymentSettings | None:
    async with conn.cursor(row_factory=class_row(PaymentSettings)) as cur:
        await cur.execute(
            "select venue_id, platform_fee_bps, stripe_account_id, stripe_charges_enabled "
            "from public.venue_payment_settings where venue_id = %s",
            (venue_id,),
        )
        return await cur.fetchone()


async def sync_charges_enabled(conn: Conn, account_id: str, enabled: bool) -> bool:
    cur = await conn.execute(
        "update public.venue_payment_settings set stripe_charges_enabled = %s "
        "where stripe_account_id = %s",
        (enabled, account_id),
    )
    return cur.rowcount > 0
