"""POST /webhooks/stripe. The only path to `paid` (CLAUDE.md invariant 3).

Signature-verified; idempotent through stripe_events (a replay is a 200 no-op). The event row
and its effects commit in one transaction, so a crash mid-way lets Stripe retry cleanly.
"""

import logging
from datetime import UTC, datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Header, Request, status

from app.deps import AppSettings, DbConn, api_error
from app.domain.order_status import (
    Actor,
    OrderStatus,
    ServiceMode,
    TransitionError,
    transition,
)
from app.domain.tickets import venue_local_date
from app.payments.webhooks import SignatureError, WebhookEvent, verify_event
from app.repositories import carts as carts_repo
from app.repositories import orders as orders_repo
from app.repositories import payment_settings as payment_settings_repo
from app.repositories import stripe_events as stripe_events_repo

router = APIRouter(tags=["webhooks"])
log = logging.getLogger(__name__)


async def _payment_succeeded(conn: DbConn, event: WebhookEvent) -> dict[str, Any]:
    obj = event.object
    pi_id = str(obj.get("id", ""))
    raw_order_id = (obj.get("metadata") or {}).get("order_id")
    try:
        order_id = UUID(str(raw_order_id))
    except ValueError:
        log.warning("stripe %s: PaymentIntent %s has no order_id", event.id, pi_id)
        return {"ignored": "unknown_order"}

    order = await orders_repo.lock_for_payment(conn, order_id, pi_id)
    if order is None:
        log.warning("stripe %s: no order %s for PaymentIntent %s", event.id, order_id, pi_id)
        return {"ignored": "unknown_order"}
    if order.status != OrderStatus.PENDING_PAYMENT:
        return {"ignored": "not_pending"}

    amount = obj.get("amount_received", obj.get("amount"))
    currency = str(obj.get("currency", "")).lower()
    if amount != order.total_cents or currency != order.currency.lower():
        # Recorded but not applied: the order stays pending. A 4xx would only make Stripe
        # retry the same mismatched event.
        log.error(
            "stripe %s: amount/currency mismatch for order %s: got %s %s, expected %s %s",
            event.id,
            order.id,
            amount,
            currency,
            order.total_cents,
            order.currency,
        )
        return {"ignored": "amount_mismatch"}

    try:
        transition(
            OrderStatus(order.status),
            OrderStatus.PAID,
            mode=ServiceMode(order.service_mode),
            actor=Actor.WEBHOOK,
        )
    except TransitionError:  # unreachable: pending_payment → paid is the webhook's edge
        return {"ignored": "invalid_transition"}

    local_date = venue_local_date(datetime.now(UTC), order.timezone)
    ticket = await orders_repo.mark_paid(conn, order.id, order.venue_id, local_date)
    if ticket is None:
        return {"ignored": "not_pending"}
    if order.session_id is not None:
        await carts_repo.clear(conn, order.session_id)
    return {"order_id": str(order.id), "ticket_number": ticket}


async def _account_updated(conn: DbConn, event: WebhookEvent) -> dict[str, Any]:
    account_id = str(event.object.get("id", ""))
    enabled = event.object.get("charges_enabled") is True
    synced = await payment_settings_repo.sync_charges_enabled(conn, account_id, enabled)
    return {"synced": synced}


@router.post("/webhooks/stripe")
async def stripe_webhook(
    request: Request,
    conn: DbConn,
    settings: AppSettings,
    stripe_signature: Annotated[str | None, Header(alias="Stripe-Signature")] = None,
) -> dict[str, Any]:
    payload = await request.body()
    secrets = [
        s.get_secret_value()
        for s in (settings.stripe_webhook_secret, settings.stripe_connect_webhook_secret)
        if s is not None and s.get_secret_value()
    ]
    try:
        event = verify_event(payload, stripe_signature, secrets)
    except SignatureError as err:
        raise api_error(
            status.HTTP_400_BAD_REQUEST, "bad_signature", "Invalid Stripe signature."
        ) from err

    if not await stripe_events_repo.record(conn, event.id, event.type):
        return {"received": True, "duplicate": True}

    result: dict[str, Any] = {}
    if event.type == "payment_intent.succeeded":
        result = await _payment_succeeded(conn, event)
    elif event.type == "payment_intent.payment_failed":
        # The diner can retry with another card; the order stays pending_payment.
        log.info("stripe %s: payment failed for %s", event.id, event.object.get("id"))
    elif event.type == "account.updated":
        result = await _account_updated(conn, event)
    return {"received": True, "duplicate": False, **result}
