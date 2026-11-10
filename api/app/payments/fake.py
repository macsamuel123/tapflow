"""An in-memory PaymentGateway for tests. Records every call; tests set PaymentIntent status."""

from dataclasses import dataclass, field, replace

from app.payments.gateway import PaymentIntentInfo, PaymentIntentRequest
from app.payments.params import StripeCall, payment_intent_params


@dataclass
class FakeGateway:
    created: list[PaymentIntentRequest] = field(default_factory=list)
    create_calls: list[StripeCall] = field(default_factory=list)
    retrieved: list[str] = field(default_factory=list)
    cancelled: list[str] = field(default_factory=list)
    intents: dict[str, PaymentIntentInfo] = field(default_factory=dict)

    async def create_payment_intent(self, req: PaymentIntentRequest) -> PaymentIntentInfo:
        self.created.append(req)
        self.create_calls.append(payment_intent_params(req))
        pi_id = f"pi_fake_{len(self.created)}"
        info = PaymentIntentInfo(
            id=pi_id,
            client_secret=f"{pi_id}_secret_fake",
            status="requires_payment_method",
            amount_cents=int(req.amount_cents),
            currency=req.currency.lower(),
        )
        self.intents[pi_id] = info
        return info

    async def retrieve_payment_intent(self, payment_intent_id: str) -> PaymentIntentInfo:
        self.retrieved.append(payment_intent_id)
        return self.intents[payment_intent_id]

    async def cancel_payment_intent(self, payment_intent_id: str) -> PaymentIntentInfo:
        self.cancelled.append(payment_intent_id)
        info = replace(self.intents[payment_intent_id], status="canceled")
        self.intents[payment_intent_id] = info
        return info

    def set_status(self, payment_intent_id: str, status: str) -> None:
        self.intents[payment_intent_id] = replace(self.intents[payment_intent_id], status=status)
