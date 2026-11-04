"""Runs the cases in testdata/pricing-cases.json, which web/src/lib/pricing.ts must also pass.
The file is what stops the demo's prices and the API's prices drifting apart."""

import json
from pathlib import Path
from typing import Any
from uuid import NAMESPACE_DNS, uuid5

import pytest

from app.domain.money import Cents
from app.domain.pricing import Tax, TaxableLine, quote

DATA = json.loads(
    (Path(__file__).parents[3] / "testdata" / "pricing-cases.json").read_text(encoding="utf-8")
)
TAXES = {
    code: Tax(uuid5(NAMESPACE_DNS, code), code, tax["name"], tax["rate_bps"])
    for code, tax in DATA["taxes"].items()
}


@pytest.mark.parametrize("case", DATA["cases"], ids=lambda c: c["name"])
def test_shared_pricing_case(case: dict[str, Any]) -> None:
    lines = [
        TaxableLine(Cents(amount), tuple(TAXES[code] for code in codes))
        for amount, codes in case["lines"]
    ]
    q = quote(lines, platform_fee_bps=case["fee_bps"], tip=Cents(case.get("tip", 0)))
    assert (q.subtotal_cents, q.tax_cents, q.platform_fee_cents, q.total_cents) == (
        case["subtotal"],
        case["tax"],
        case["fee"],
        case["total"],
    )
    assert [[t.code, t.base_cents, t.tax_cents] for t in q.tax_lines] == case["tax_lines"]
