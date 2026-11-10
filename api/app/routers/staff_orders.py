"""Staff order endpoints. Authenticated by Supabase JWT; scoped to the caller's venues and to
paid orders only. Every change runs through the status machine; the DB guard checks again."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, status

from app.deps import CurrentStaffUser, DbConn, api_error
from app.domain.order_status import (
    Actor,
    InvalidTransition,
    OrderStatus,
    RoleForbidden,
    ServiceMode,
    StaffCannotSetPaid,
    StaffRole,
    check_role,
    transition,
)
from app.repositories import orders as orders_repo
from app.repositories.orders import StaffOrder, StaffOrderItem
from app.schemas.staff import (
    StaffOrderItemOut,
    StaffOrderOut,
    StaffOrdersResponse,
    StatusUpdateRequest,
    StatusUpdateResponse,
)

router = APIRouter(prefix="/staff", tags=["staff"])


def _not_found() -> Exception:
    return api_error(status.HTTP_404_NOT_FOUND, "order_not_found", "Order not found.")


def _out(order: StaffOrder, items: list[StaffOrderItem]) -> StaffOrderOut:
    return StaffOrderOut(
        id=order.id,
        venue_id=order.venue_id,
        touchpoint_id=order.touchpoint_id,
        touchpoint_label=order.touchpoint_label,
        status=order.status,
        service_mode=order.service_mode,
        guest_name=order.guest_name,
        currency=order.currency,
        subtotal_cents=order.subtotal_cents,
        tax_cents=order.tax_cents,
        tip_cents=order.tip_cents,
        total_cents=order.total_cents,
        ticket_number=order.ticket_number,
        ticket_date=order.ticket_date,
        created_at=order.created_at,
        status_updated_at=order.status_updated_at,
        paid_at=order.paid_at,
        accepted_at=order.accepted_at,
        ready_at=order.ready_at,
        delivered_at=order.delivered_at,
        picked_up_at=order.picked_up_at,
        cancelled_at=order.cancelled_at,
        items=[
            StaffOrderItemOut(
                name=i.name,
                quantity=i.quantity,
                unit_price_cents=i.unit_price_cents,
                line_total_cents=i.line_total_cents,
                notes=i.notes,
                modifiers=i.modifiers,
            )
            for i in items
            if i.order_id == order.id
        ],
    )


@router.get("/orders", response_model=StaffOrdersResponse)
async def list_orders(
    conn: DbConn, user_id: CurrentStaffUser, venue_id: Annotated[UUID, Query()]
) -> StaffOrdersResponse:
    role = await orders_repo.staff_role(conn, user_id, venue_id)
    if role is None:
        raise api_error(status.HTTP_404_NOT_FOUND, "venue_not_found", "Venue not found.")
    orders = await orders_repo.list_for_staff(conn, user_id, venue_id)
    items = await orders_repo.items_for(conn, [o.id for o in orders])
    return StaffOrdersResponse(role=role, orders=[_out(o, items) for o in orders])


@router.patch("/orders/{order_id}/status", response_model=StatusUpdateResponse)
async def update_order_status(
    order_id: UUID, body: StatusUpdateRequest, conn: DbConn, user_id: CurrentStaffUser
) -> StatusUpdateResponse:
    found = await orders_repo.get_for_staff(conn, user_id, order_id)
    if found is None:  # missing, another venue's, or unpaid: never confirm it exists
        raise _not_found()
    order, role = found
    target = OrderStatus(body.status)
    try:
        check_role(StaffRole(role), target)
        step = transition(
            OrderStatus(order.status),
            target,
            mode=ServiceMode(order.service_mode),
            actor=Actor.STAFF,
        )
    except (RoleForbidden, StaffCannotSetPaid) as err:
        raise api_error(status.HTTP_403_FORBIDDEN, "role_forbidden", str(err)) from err
    except InvalidTransition as err:
        raise api_error(status.HTTP_409_CONFLICT, "invalid_transition", str(err)) from err

    if not await orders_repo.update_status(conn, order.id, current=order.status, target=target):
        raise api_error(
            status.HTTP_409_CONFLICT, "invalid_transition", "The order changed; refresh."
        )
    updated = await orders_repo.get_by_id_for_staff(conn, order.id)
    if updated is None:
        raise _not_found()
    items = await orders_repo.items_for(conn, [updated.id])
    return StatusUpdateResponse(order=_out(updated, items), timestamp_field=step.timestamp_field)
