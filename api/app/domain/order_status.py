"""The order status machine (CLAUDE.md invariant 4). Pure; the DB guard enforces it again.

    pending_payment → paid                 (webhook only, after a verified payment)
    pending_payment → cancelled            (system only: re-checkout replaces an unpaid order)
    paid            → accepted | cancelled
    accepted        → ready    | cancelled
    ready           → delivered            (delivery orders only)
    ready           → picked_up            (pickup orders only)

delivered, picked_up and cancelled are terminal. Staff can never set `paid`. Each transition
stamps `<status>_at`.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from enum import StrEnum


class OrderStatus(StrEnum):
    PENDING_PAYMENT = "pending_payment"
    PAID = "paid"
    ACCEPTED = "accepted"
    READY = "ready"
    DELIVERED = "delivered"
    PICKED_UP = "picked_up"
    CANCELLED = "cancelled"


class ServiceMode(StrEnum):
    DELIVERY = "delivery"
    PICKUP = "pickup"


class Actor(StrEnum):
    STAFF = "staff"
    WEBHOOK = "webhook"  # signature-verified payment_intent.succeeded
    SYSTEM = "system"  # the API itself (re-checkout)


class StaffRole(StrEnum):
    OWNER = "owner"
    MANAGER = "manager"
    FULFILLMENT = "fulfillment"
    RUNNER = "runner"


TIMESTAMP_FIELD: Mapping[OrderStatus, str] = {
    OrderStatus.PAID: "paid_at",
    OrderStatus.ACCEPTED: "accepted_at",
    OrderStatus.READY: "ready_at",
    OrderStatus.DELIVERED: "delivered_at",
    OrderStatus.PICKED_UP: "picked_up_at",
    OrderStatus.CANCELLED: "cancelled_at",
}

TERMINAL: frozenset[OrderStatus] = frozenset(
    {OrderStatus.DELIVERED, OrderStatus.PICKED_UP, OrderStatus.CANCELLED}
)

_S = OrderStatus
_EDGES: Mapping[Actor, frozenset[tuple[OrderStatus, OrderStatus]]] = {
    Actor.WEBHOOK: frozenset({(_S.PENDING_PAYMENT, _S.PAID)}),
    Actor.SYSTEM: frozenset({(_S.PENDING_PAYMENT, _S.CANCELLED)}),
    Actor.STAFF: frozenset(
        {
            (_S.PAID, _S.ACCEPTED),
            (_S.PAID, _S.CANCELLED),
            (_S.ACCEPTED, _S.READY),
            (_S.ACCEPTED, _S.CANCELLED),
            (_S.READY, _S.DELIVERED),
            (_S.READY, _S.PICKED_UP),
        }
    ),
}

# The final hand-off depends on how the order reaches the diner.
_MODE_ONLY: Mapping[OrderStatus, ServiceMode] = {
    OrderStatus.DELIVERED: ServiceMode.DELIVERY,
    OrderStatus.PICKED_UP: ServiceMode.PICKUP,
}

# What each venue role may move an order to. Runners only hand over ready delivery orders.
ROLE_TARGETS: Mapping[StaffRole, frozenset[OrderStatus]] = {
    StaffRole.OWNER: frozenset({_S.ACCEPTED, _S.READY, _S.DELIVERED, _S.PICKED_UP, _S.CANCELLED}),
    StaffRole.MANAGER: frozenset({_S.ACCEPTED, _S.READY, _S.DELIVERED, _S.PICKED_UP, _S.CANCELLED}),
    StaffRole.FULFILLMENT: frozenset(
        {_S.ACCEPTED, _S.READY, _S.DELIVERED, _S.PICKED_UP, _S.CANCELLED}
    ),
    StaffRole.RUNNER: frozenset({_S.DELIVERED}),
}


class TransitionError(Exception):
    pass


class InvalidTransition(TransitionError):
    def __init__(self, current: OrderStatus, target: OrderStatus, mode: ServiceMode) -> None:
        super().__init__(f"An order can't go from {current} to {target} ({mode}).")
        self.current = current
        self.target = target


class StaffCannotSetPaid(TransitionError):
    def __init__(self) -> None:
        super().__init__("Only a verified payment can mark an order paid.")


class RoleForbidden(TransitionError):
    def __init__(self, role: StaffRole, target: OrderStatus) -> None:
        super().__init__(f"A {role} can't mark an order {target}.")


@dataclass(frozen=True, slots=True)
class Transition:
    target: OrderStatus
    timestamp_field: str


def transition(
    current: OrderStatus, target: OrderStatus, *, mode: ServiceMode, actor: Actor
) -> Transition:
    """Validate `current → target` for this actor and service mode, or raise."""
    if target is OrderStatus.PAID and actor is not Actor.WEBHOOK:
        raise StaffCannotSetPaid()
    if (current, target) not in _EDGES[actor]:
        raise InvalidTransition(current, target, mode)
    required_mode = _MODE_ONLY.get(target)
    if required_mode is not None and mode is not required_mode:
        raise InvalidTransition(current, target, mode)
    return Transition(target=target, timestamp_field=TIMESTAMP_FIELD[target])


def check_role(role: StaffRole, target: OrderStatus) -> None:
    if target not in ROLE_TARGETS[role]:
        raise RoleForbidden(role, target)
