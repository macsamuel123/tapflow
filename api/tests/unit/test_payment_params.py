"""PaymentIntent parameters for a Connect destination charge."""

from uuid import UUID

from app.domain.money import Cents
from app.payments.gateway import PaymentIntentRequest
from app.payments.params import payment_intent_params

ORDER = UUID("0b000000-0000-4000-8000-000000000001")


def test_destination_charge_params_and_idempotency_key() -> None:
    call = payment_intent_params(
        PaymentIntentRequest(
            amount_cents=Cents(2415),
            currency="CAD",
            application_fee_cents=Cents(63),
            destination_account="acct_123",
            order_id=ORDER,
        )
    )
    assert call.params == {
        "amount": 2415,
        "currency": "cad",
        "automatic_payment_methods": {"enabled": True},
        "application_fee_amount": 63,
        "transfer_data": {"destination": "acct_123"},
        "metadata": {"order_id": str(ORDER)},
    }
    assert call.options == {"idempotency_key": str(ORDER)}
    assert all(
        isinstance(v, int) for v in (call.params["amount"], call.params["application_fee_amount"])
    )
