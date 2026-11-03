"""Money is always integer cents. Never use float for any amount."""

from typing import NewType

Cents = NewType("Cents", int)

BPS_DENOMINATOR = 10_000


def apply_bps_round_half_up(amount: Cents, bps: int) -> Cents:
    """Return amount * bps / 10000, rounded half-up, using integer math only."""
    if amount < 0:
        raise ValueError("amount must be non-negative")
    if not 0 <= bps <= BPS_DENOMINATOR:
        raise ValueError("bps must be between 0 and 10000")
    return Cents((amount * bps + BPS_DENOMINATOR // 2) // BPS_DENOMINATOR)
