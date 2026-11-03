"""Server-priced cart. Clients send item_id, modifier_ids, quantity and notes only;
every name and amount in the response is derived from current DB rows."""

from uuid import UUID

from fastapi import APIRouter, status

from app.deps import CurrentSession, DbConn, api_error
from app.domain.cart_rules import CartRuleError, RuleCode, ValidatedLine, validate_line
from app.domain.menu import MenuItem
from app.domain.money import Cents
from app.domain.pricing import MAX_QUANTITY, quote
from app.repositories import carts as carts_repo
from app.repositories import menu as menu_repo
from app.repositories import restaurants as restaurants_repo
from app.repositories import sessions as sessions_repo
from app.repositories.carts import CartLine
from app.repositories.sessions import DinerSession
from app.schemas.cart import (
    AddCartItemRequest,
    CartLineOut,
    CartModifierOut,
    CartResponse,
    UpdateCartItemRequest,
)

router = APIRouter(prefix="/cart", tags=["cart"])

MAX_CART_LINES = 30

_RULE_STATUS = {
    RuleCode.ITEM_NOT_FOUND: status.HTTP_404_NOT_FOUND,
    RuleCode.ITEM_OUT_OF_STOCK: status.HTTP_409_CONFLICT,
    RuleCode.MODIFIER_OUT_OF_STOCK: status.HTTP_409_CONFLICT,
}


def _rule_http_error(err: CartRuleError) -> Exception:
    code = _RULE_STATUS.get(err.code, status.HTTP_422_UNPROCESSABLE_CONTENT)
    return api_error(code, err.code.value, err.message)


async def _load_item(conn: DbConn, session: DinerSession, item_id: UUID) -> MenuItem | None:
    items = await menu_repo.load_items(conn, session.restaurant_id, [item_id])
    return items[0] if items else None


def _validate(
    item: MenuItem | None, session: DinerSession, modifier_ids: list[UUID], quantity: int
) -> ValidatedLine:
    try:
        return validate_line(
            item,
            restaurant_id=session.restaurant_id,
            modifier_ids=modifier_ids,
            quantity=quantity,
        )
    except CartRuleError as err:
        raise _rule_http_error(err) from err


def _line_out(line: CartLine, item: MenuItem | None, session: DinerSession) -> CartLineOut:
    try:
        v = validate_line(
            item,
            restaurant_id=session.restaurant_id,
            modifier_ids=line.modifier_ids,
            quantity=line.quantity,
        )
    except CartRuleError as err:
        # Still show the line so the diner can see what changed and remove it.
        return CartLineOut(
            id=line.id,
            item_id=line.item_id,
            name=item.name if item else "Unavailable item",
            modifiers=[],
            quantity=line.quantity,
            notes=line.notes,
            unit_price_cents=0,
            line_total_cents=0,
            available=False,
            problem=err.message,
        )
    return CartLineOut(
        id=line.id,
        item_id=line.item_id,
        name=v.item.name,
        modifiers=[
            CartModifierOut(id=m.id, name=m.name, price_delta_cents=m.price_delta_cents)
            for m in v.modifiers
        ],
        quantity=v.quantity,
        notes=line.notes,
        unit_price_cents=v.unit_price_cents,
        line_total_cents=v.line_total_cents,
        available=True,
        problem=None,
    )


async def _cart_response(conn: DbConn, session: DinerSession) -> CartResponse:
    restaurant = await restaurants_repo.get_by_id(conn, session.restaurant_id)
    if restaurant is None:  # session FK makes this unreachable short of a race with deletion
        raise api_error(status.HTTP_404_NOT_FOUND, "restaurant_not_found", "Restaurant not found.")
    lines = await carts_repo.list_lines(conn, session.id)
    items = (
        {
            i.id: i
            for i in await menu_repo.load_items(
                conn, session.restaurant_id, list({ln.item_id for ln in lines})
            )
        }
        if lines
        else {}
    )
    out = [_line_out(ln, items.get(ln.item_id), session) for ln in lines]
    available = [ln for ln in out if ln.available]
    q = quote(
        (Cents(ln.line_total_cents) for ln in available),
        tax_rate_bps=restaurant.tax_rate_bps,
        platform_fee_bps=restaurant.platform_fee_bps,
    )
    return CartResponse(
        currency=restaurant.currency,
        lines=out,
        item_count=sum(ln.quantity for ln in available),
        subtotal_cents=q.subtotal_cents,
        tax_rate_bps=restaurant.tax_rate_bps,
        tax_cents=q.tax_cents,
        tip_cents=q.tip_cents,
        total_cents=q.total_cents,
        verified=session.verified,
        can_checkout=session.verified and bool(out) and len(available) == len(out),
    )


@router.get("", response_model=CartResponse)
async def get_cart(conn: DbConn, session: CurrentSession) -> CartResponse:
    return await _cart_response(conn, session)


@router.post("/items", status_code=status.HTTP_201_CREATED, response_model=CartResponse)
async def add_item(body: AddCartItemRequest, conn: DbConn, session: CurrentSession) -> CartResponse:
    item = await _load_item(conn, session, body.item_id)
    _validate(item, session, body.modifier_ids, body.quantity)

    existing = await carts_repo.find_identical(
        conn, session.id, body.item_id, body.modifier_ids, body.notes
    )
    if existing is not None:
        merged = existing.quantity + body.quantity
        if merged > MAX_QUANTITY:
            raise api_error(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                RuleCode.INVALID_QUANTITY.value,
                f"You can order at most {MAX_QUANTITY} of the same item.",
            )
        await carts_repo.update_line(
            conn, session.id, existing.id, quantity=merged, notes=existing.notes
        )
    else:
        if await carts_repo.count_lines(conn, session.id) >= MAX_CART_LINES:
            raise api_error(
                status.HTTP_422_UNPROCESSABLE_CONTENT, "cart_full", "Your cart is full."
            )
        await carts_repo.insert_line(
            conn,
            session.id,
            item_id=body.item_id,
            modifier_ids=body.modifier_ids,
            quantity=body.quantity,
            notes=body.notes,
        )
    await sessions_repo.touch(conn, session.id)
    return await _cart_response(conn, session)


@router.patch("/items/{line_id}", response_model=CartResponse)
async def update_item(
    line_id: UUID, body: UpdateCartItemRequest, conn: DbConn, session: CurrentSession
) -> CartResponse:
    line = await carts_repo.get_line(conn, session.id, line_id)
    if line is None:
        raise api_error(status.HTTP_404_NOT_FOUND, "line_not_found", "That cart line is gone.")
    item = await _load_item(conn, session, line.item_id)
    _validate(item, session, line.modifier_ids, body.quantity)
    await carts_repo.update_line(
        conn,
        session.id,
        line_id,
        quantity=body.quantity,
        notes=line.notes if body.notes is None else body.notes,
    )
    await sessions_repo.touch(conn, session.id)
    return await _cart_response(conn, session)


@router.delete("/items/{line_id}", response_model=CartResponse)
async def remove_item(line_id: UUID, conn: DbConn, session: CurrentSession) -> CartResponse:
    if not await carts_repo.delete_line(conn, session.id, line_id):
        raise api_error(status.HTTP_404_NOT_FOUND, "line_not_found", "That cart line is gone.")
    await sessions_repo.touch(conn, session.id)
    return await _cart_response(conn, session)
