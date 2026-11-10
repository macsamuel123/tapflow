"""PaymentIntent create parameters (destination charge). No stripe import: unit-testable."""

from dataclasses import dataclass
from typing import Any

from app.payments.gateway import PaymentIntentRequest


@dataclass(frozen=True, slots=True)
class StripeCall:
    params: dict[str, Any]
    options: dict[str, Any]


def payment_intent_params(req: PaymentIntentRequest) -> StripeCall:
    return StripeCall(
        params={
            "amount": int(req.amount_cents),
            "currency": req.currency.lower(),
            "automatic_payment_methods": {"enabled": True},
            "application_fee_amount": int(req.application_fee_cents),
            "transfer_data": {"destination": req.destination_account},
            "metadata": {"order_id": str(req.order_id)},
        },
        # One order → one PaymentIntent, however often the request is retried.
        options={"idempotency_key": str(req.order_id)},
    )
