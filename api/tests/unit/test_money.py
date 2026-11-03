import pytest

from app.domain.money import Cents, apply_bps_round_half_up


@pytest.mark.parametrize(
    ("amount", "bps", "expected"),
    [
        (Cents(0), 500, 0),
        (Cents(1000), 500, 50),  # 5% of $10.00
        (Cents(10), 500, 1),  # 0.5¢ rounds half-up → 1¢
        (Cents(9), 500, 0),  # 0.45¢ → 0¢
        (Cents(2999), 500, 150),  # 149.95¢ → 150¢
        (Cents(3333), 300, 100),  # 99.99¢ → 100¢
        (Cents(12345), 10_000, 12345),
        (Cents(12345), 0, 0),
    ],
)
def test_apply_bps_round_half_up(amount: Cents, bps: int, expected: int) -> None:
    result = apply_bps_round_half_up(amount, bps)
    assert result == expected
    assert isinstance(result, int)


@pytest.mark.parametrize(
    ("amount", "bps"), [(Cents(-1), 500), (Cents(100), -1), (Cents(100), 10_001)]
)
def test_apply_bps_rejects_out_of_range(amount: Cents, bps: int) -> None:
    with pytest.raises(ValueError):
        apply_bps_round_half_up(amount, bps)
