"""The PaymentGateway Protocol: the API's only view of Stripe's network calls."""

from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

from app.domain.money import Cents


class PaymentsUnavailable(Exception):
    """No Stripe key is configured, or Stripe could not be reached."""


@dataclass(frozen=True, slots=True)
class PaymentIntentRequest:
    amount_cents: Cents
    currency: str  # ISO 4217, any case; sent to Stripe lowercase
    application_fee_cents: Cents
    destination_account: str  # the venue's connected account (acct_...)
    order_id: UUID


@dataclass(frozen=True, slots=True)
class PaymentIntentInfo:
    id: str
    client_secret: str
    status: str
    amount_cents: int
    currency: str


class PaymentGateway(Protocol):
    async def create_payment_intent(self, req: PaymentIntentRequest) -> PaymentIntentInfo: ...

    async def retrieve_payment_intent(self, payment_intent_id: str) -> PaymentIntentInfo: ...

    async def cancel_payment_intent(self, payment_intent_id: str) -> PaymentIntentInfo: ...


class UnavailableGateway:
    """Used when STRIPE_SECRET_KEY is not set: checkout answers 503 instead of crashing."""

    async def create_payment_intent(self, req: PaymentIntentRequest) -> PaymentIntentInfo:
        raise PaymentsUnavailable("STRIPE_SECRET_KEY is not configured")

    async def retrieve_payment_intent(self, payment_intent_id: str) -> PaymentIntentInfo:
        raise PaymentsUnavailable("STRIPE_SECRET_KEY is not configured")

    async def cancel_payment_intent(self, payment_intent_id: str) -> PaymentIntentInfo:
        raise PaymentsUnavailable("STRIPE_SECRET_KEY is not configured")
