"""The real gateway, on stripe.StripeClient. Calls run in a worker thread so they don't
block the event loop."""

import asyncio
from typing import Any, cast

import stripe

from app.payments.gateway import PaymentIntentInfo, PaymentIntentRequest, PaymentsUnavailable
from app.payments.params import payment_intent_params


def _info(pi: stripe.PaymentIntent) -> PaymentIntentInfo:
    return PaymentIntentInfo(
        id=pi.id,
        client_secret=pi.client_secret or "",
        status=pi.status,
        amount_cents=pi.amount,
        currency=pi.currency,
    )


class StripeGateway:
    def __init__(self, secret_key: str) -> None:
        self._client = stripe.StripeClient(secret_key)

    async def create_payment_intent(self, req: PaymentIntentRequest) -> PaymentIntentInfo:
        call = payment_intent_params(req)
        try:
            pi = await asyncio.to_thread(
                self._client.v1.payment_intents.create,
                params=cast(Any, call.params),
                options=cast(Any, call.options),
            )
        except stripe.APIConnectionError as exc:
            raise PaymentsUnavailable(str(exc)) from exc
        return _info(pi)

    async def retrieve_payment_intent(self, payment_intent_id: str) -> PaymentIntentInfo:
        try:
            pi = await asyncio.to_thread(
                self._client.v1.payment_intents.retrieve, payment_intent_id
            )
        except stripe.APIConnectionError as exc:
            raise PaymentsUnavailable(str(exc)) from exc
        return _info(pi)

    async def cancel_payment_intent(self, payment_intent_id: str) -> PaymentIntentInfo:
        try:
            pi = await asyncio.to_thread(self._client.v1.payment_intents.cancel, payment_intent_id)
        except stripe.APIConnectionError as exc:
            raise PaymentsUnavailable(str(exc)) from exc
        return _info(pi)
