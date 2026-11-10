"""Ticket numbers restart at 1 every day, in the venue's local time (not UTC)."""

from datetime import date, datetime
from zoneinfo import ZoneInfo


def venue_local_date(instant: datetime, tz: str) -> date:
    """The calendar date at `instant` in timezone `tz`. `instant` must be timezone-aware."""
    if instant.tzinfo is None or instant.utcoffset() is None:
        raise ValueError("instant must be timezone-aware")
    return instant.astimezone(ZoneInfo(tz)).date()
