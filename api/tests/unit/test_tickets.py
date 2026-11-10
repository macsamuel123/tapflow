"""Ticket numbers restart at the venue's local midnight, not UTC midnight."""

from datetime import UTC, date, datetime, timedelta
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

import pytest

from app.domain.tickets import venue_local_date

VANCOUVER = "America/Vancouver"


class FakeCounter:
    """Mirrors app.next_ticket_number: one counter per (venue, local date)."""

    def __init__(self) -> None:
        self.last: dict[tuple[UUID, date], int] = {}

    def next(self, venue_id: UUID, local_date: date) -> int:
        key = (venue_id, local_date)
        self.last[key] = self.last.get(key, 0) + 1
        return self.last[key]


def _local_midnight_utc(day: date, tz: str) -> datetime:
    # Derived from tzdata rather than hard-coded: BC's offset rules change (permanent DST).
    return datetime(day.year, day.month, day.day, tzinfo=ZoneInfo(tz)).astimezone(UTC)


def test_vancouver_local_midnight_fixed_example() -> None:
    # Jan 10, 2026 was PST (UTC-8): local midnight was 08:00Z.
    assert venue_local_date(datetime(2026, 1, 10, 7, 59, tzinfo=UTC), VANCOUVER) == date(2026, 1, 9)
    assert venue_local_date(datetime(2026, 1, 10, 8, 0, tzinfo=UTC), VANCOUVER) == date(2026, 1, 10)


def test_counter_resets_across_the_venue_timezone_boundary() -> None:
    venue = uuid4()
    counter = FakeCounter()
    midnight = _local_midnight_utc(date(2026, 11, 10), VANCOUVER)
    assert midnight.date() == date(2026, 11, 10)  # a UTC morning, not UTC midnight
    before = [midnight - timedelta(hours=1), midnight - timedelta(seconds=1)]
    assert [venue_local_date(t, VANCOUVER) for t in before] == [date(2026, 11, 9)] * 2
    numbers = [counter.next(venue, venue_local_date(t, VANCOUVER)) for t in before]
    assert numbers == [1, 2]
    # Same UTC date throughout, yet the venue's day rolls over.
    assert venue_local_date(midnight, VANCOUVER) == date(2026, 11, 10)
    assert counter.next(venue, venue_local_date(midnight, VANCOUVER)) == 1
    assert counter.next(venue, venue_local_date(midnight + timedelta(hours=1), VANCOUVER)) == 2


def test_venues_in_different_timezones_roll_over_at_different_instants() -> None:
    counter = FakeCounter()
    van, tor = uuid4(), uuid4()
    t1 = datetime(2026, 11, 10, 4, 30, tzinfo=UTC)  # 23:30 Toronto / 20:30 Vancouver (Nov 9)
    t2 = datetime(2026, 11, 10, 5, 30, tzinfo=UTC)  # 00:30 Toronto (Nov 10) / 21:30 Vancouver
    assert counter.next(tor, venue_local_date(t1, "America/Toronto")) == 1
    assert counter.next(van, venue_local_date(t1, VANCOUVER)) == 1
    assert counter.next(tor, venue_local_date(t2, "America/Toronto")) == 1  # new day
    assert counter.next(van, venue_local_date(t2, VANCOUVER)) == 2  # same day


def test_naive_datetimes_are_rejected() -> None:
    with pytest.raises(ValueError):
        venue_local_date(datetime(2026, 11, 10, 8, 0), VANCOUVER)
