"""POST /checkout: turn a verified session's cart into a pending_payment order and a
PaymentIntent. Every amount is computed here from DB prices (CLAUDE.md invariant 1); the
order becomes `paid` only through the Stripe webhook (invariant 3)."""

from typing import Any

from fastapi import APIRouter, Response, status

from app.deps import CurrentSession, DbConn, PaymentGatewayDep, api_error
from app.domain.cart_rules import CartRuleError, validate_line
from app.domain.checkout import (
    CartEntry,
    CheckoutError,
    RecheckoutAction,
    build_order_draft,
    recheckout_action,
    require_guest_name,
)
from app.domain.money import Cents
from app.domain.order_status import ServiceMode
from app.payments.gateway import PaymentIntentRequest, PaymentsUnavailable
from app.repositories import carts as carts_repo
from app.repositories import menu as menu_repo
from app.repositories import orders as orders_repo
from app.repositories import payment_settings as payment_settings_repo
from app.repositories import sessions as sessions_repo
from app.repositories import venues as venues_repo
from app.routers.cart import rule_http_error
from app.schemas.checkout import CheckoutRequest, CheckoutResponse

router = APIRouter(tags=["checkout"])

_CHECKOUT_ERROR_STATUS = {
    "cart_empty": status.HTTP_409_CONFLICT,
    "fee_exceeds_total": status.HTTP_409_CONFLICT,
}

_RESPONSES: dict[int | str, dict[str, Any]] = {
    403: {"description": "Session not verified: scan the QR on your touchpoint"},
    409: {"description": "Empty cart, payments unavailable, or an item went out of stock"},
    422: {"description": "Invalid body, tip or guest name, or a cart rule failed"},
}


def _checkout_http_error(err: CheckoutError) -> Exception:
    code = _CHECKOUT_ERROR_STATUS.get(err.code, status.HTTP_422_UNPROCESSABLE_CONTENT)
    return api_error(code, err.code, err.message)


def _unavailable() -> Exception:
    return api_error(
        status.HTTP_503_SERVICE_UNAVAILABLE,
        "payments_unavailable",
        "Payments are temporarily unavailable. Please try again.",
    )


@router.post(
    "/checkout",
    status_code=status.HTTP_201_CREATED,
    response_model=CheckoutResponse,
    responses=_RESPONSES,
)
async def checkout(
    body: CheckoutRequest,
    response: Response,
    conn: DbConn,
    session: CurrentSession,
    payments: PaymentGatewayDep,
) -> CheckoutResponse:
    if not session.verified or session.touchpoint_id is None:
        raise api_error(
            status.HTTP_403_FORBIDDEN,
            "session_unverified",
            "Scan the QR on your touchpoint to check out.",
        )
    await sessions_repo.lock(conn, session.id)

    mode = ServiceMode(session.service_mode)
    try:
        guest_name = require_guest_name(mode, body.guest_name)
    except CheckoutError as err:
        raise _checkout_http_error(err) from err

    venue = await venues_repo.get_by_id(conn, session.venue_id)
    settings = await payment_settings_repo.get_for_venue(conn, session.venue_id)
    if (
        venue is None
        or settings is None
        or not settings.stripe_charges_enabled
        or not settings.stripe_account_id
    ):
        raise api_error(
            status.HTTP_409_CONFLICT,
            "payments_unavailable",
            "This venue isn't taking card payments right now.",
        )

    try:
        # ---------------------------------------------------------------- re-checkout
        pending = await orders_repo.get_pending_for_session(conn, session.id)
        if pending is not None:
            action = RecheckoutAction.REPLACE
            pi = None
            if pending.payment_intent_id is not None:
                pi = await payments.retrieve_payment_intent(pending.payment_intent_id)
                action = recheckout_action(pi.status)
            if action is RecheckoutAction.REUSE and pi is not None:
                response.status_code = status.HTTP_200_OK
                return CheckoutResponse(
                    order_id=pending.id,
                    client_secret=pi.client_secret,
                    currency=pending.currency,
                    total_cents=pending.total_cents,
                    reused=True,
                )
            if pi is not None and pi.status != "canceled":
                await payments.cancel_payment_intent(pi.id)
            await orders_repo.cancel_unpaid(conn, pending.id)

        # ---------------------------------------------------------------- cart + stock
        lines = await carts_repo.list_lines(conn, session.id)
        if not lines:
            raise api_error(status.HTTP_409_CONFLICT, "cart_empty", "Your cart is empty.")
        items = {
            i.id: i
            for i in await menu_repo.load_items(
                conn, session.venue_id, list({ln.item_id for ln in lines})
            )
        }
        entries: list[CartEntry] = []
        for ln in lines:
            try:
                validated = validate_line(
                    items.get(ln.item_id),
                    venue_id=session.venue_id,
                    modifier_ids=ln.modifier_ids,
                    quantity=ln.quantity,
                )
            except CartRuleError as err:
                raise rule_http_error(err) from err
            entries.append(CartEntry(line=validated, notes=ln.notes))

        try:
            draft = build_order_draft(
                entries, platform_fee_bps=settings.platform_fee_bps, tip=Cents(body.tip_cents)
            )
        except CheckoutError as err:
            raise _checkout_http_error(err) from err

        # ---------------------------------------------------------------- order + PaymentIntent
        order_id = await orders_repo.insert_pending(
            conn,
            venue_id=session.venue_id,
            touchpoint_id=session.touchpoint_id,
            session_id=session.id,
            currency=venue.currency,
            service_mode=mode.value,
            guest_name=guest_name,
            draft=draft,
        )
        pi = await payments.create_payment_intent(
            PaymentIntentRequest(
                amount_cents=draft.quote.total_cents,
                currency=venue.currency,
                application_fee_cents=draft.quote.platform_fee_cents,
                destination_account=settings.stripe_account_id,
                order_id=order_id,
            )
        )
        await orders_repo.set_payment_intent(conn, order_id, pi.id)
    except PaymentsUnavailable as err:
        raise _unavailable() from err

    await sessions_repo.touch(conn, session.id)
    return CheckoutResponse(
        order_id=order_id,
        client_secret=pi.client_secret,
        currency=venue.currency,
        total_cents=draft.quote.total_cents,
        reused=False,
    )
