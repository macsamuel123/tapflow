"""The status machine (CLAUDE.md invariant 4): every from→to pair, both service modes."""

import itertools

import pytest

from app.domain.order_status import (
    ROLE_TARGETS,
    TERMINAL,
    TIMESTAMP_FIELD,
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

S = OrderStatus
D, P = ServiceMode.DELIVERY, ServiceMode.PICKUP

# The complete set of staff-valid (from, to, mode) triples. Everything else is invalid.
STAFF_VALID = {
    (S.PAID, S.ACCEPTED, D),
    (S.PAID, S.ACCEPTED, P),
    (S.PAID, S.CANCELLED, D),
    (S.PAID, S.CANCELLED, P),
    (S.ACCEPTED, S.READY, D),
    (S.ACCEPTED, S.READY, P),
    (S.ACCEPTED, S.CANCELLED, D),
    (S.ACCEPTED, S.CANCELLED, P),
    (S.READY, S.DELIVERED, D),
    (S.READY, S.PICKED_UP, P),
}

ALL_PAIRS = list(itertools.product(OrderStatus, OrderStatus, ServiceMode))


@pytest.mark.parametrize(("current", "target", "mode"), ALL_PAIRS)
def test_staff_matrix(current: OrderStatus, target: OrderStatus, mode: ServiceMode) -> None:
    if target is S.PAID:
        with pytest.raises(StaffCannotSetPaid):
            transition(current, target, mode=mode, actor=Actor.STAFF)
    elif (current, target, mode) in STAFF_VALID:
        step = transition(current, target, mode=mode, actor=Actor.STAFF)
        assert step.target is target
        assert step.timestamp_field == f"{target.value}_at"
    else:
        with pytest.raises(InvalidTransition):
            transition(current, target, mode=mode, actor=Actor.STAFF)


@pytest.mark.parametrize(("current", "target", "mode"), ALL_PAIRS)
def test_webhook_matrix(current: OrderStatus, target: OrderStatus, mode: ServiceMode) -> None:
    if (current, target) == (S.PENDING_PAYMENT, S.PAID):
        assert transition(current, target, mode=mode, actor=Actor.WEBHOOK).timestamp_field == (
            "paid_at"
        )
    else:
        with pytest.raises(InvalidTransition):
            transition(current, target, mode=mode, actor=Actor.WEBHOOK)


@pytest.mark.parametrize(("current", "target", "mode"), ALL_PAIRS)
def test_system_matrix(current: OrderStatus, target: OrderStatus, mode: ServiceMode) -> None:
    if target is S.PAID:
        with pytest.raises(StaffCannotSetPaid):
            transition(current, target, mode=mode, actor=Actor.SYSTEM)
    elif (current, target) == (S.PENDING_PAYMENT, S.CANCELLED):
        transition(current, target, mode=mode, actor=Actor.SYSTEM)
    else:
        with pytest.raises(InvalidTransition):
            transition(current, target, mode=mode, actor=Actor.SYSTEM)


def test_picked_up_only_on_pickup_and_delivered_only_on_delivery() -> None:
    transition(S.READY, S.PICKED_UP, mode=P, actor=Actor.STAFF)
    transition(S.READY, S.DELIVERED, mode=D, actor=Actor.STAFF)
    with pytest.raises(InvalidTransition):
        transition(S.READY, S.PICKED_UP, mode=D, actor=Actor.STAFF)
    with pytest.raises(InvalidTransition):
        transition(S.READY, S.DELIVERED, mode=P, actor=Actor.STAFF)


@pytest.mark.parametrize("mode", list(ServiceMode))
@pytest.mark.parametrize("current", list(OrderStatus))
def test_cancelled_only_from_paid_or_accepted(current: OrderStatus, mode: ServiceMode) -> None:
    if current in (S.PAID, S.ACCEPTED):
        assert transition(current, S.CANCELLED, mode=mode, actor=Actor.STAFF).timestamp_field == (
            "cancelled_at"
        )
    else:
        with pytest.raises(InvalidTransition):
            transition(current, S.CANCELLED, mode=mode, actor=Actor.STAFF)


@pytest.mark.parametrize("current", list(OrderStatus))
def test_staff_can_never_set_paid(current: OrderStatus) -> None:
    for mode in ServiceMode:
        with pytest.raises(StaffCannotSetPaid):
            transition(current, S.PAID, mode=mode, actor=Actor.STAFF)


@pytest.mark.parametrize("terminal", sorted(TERMINAL))
def test_terminal_states_have_no_exits(terminal: OrderStatus) -> None:
    for target, mode, actor in itertools.product(OrderStatus, ServiceMode, Actor):
        with pytest.raises((InvalidTransition, StaffCannotSetPaid)):
            transition(terminal, target, mode=mode, actor=actor)


def test_each_status_has_its_timestamp_field() -> None:
    assert dict(TIMESTAMP_FIELD) == {
        S.PAID: "paid_at",
        S.ACCEPTED: "accepted_at",
        S.READY: "ready_at",
        S.DELIVERED: "delivered_at",
        S.PICKED_UP: "picked_up_at",
        S.CANCELLED: "cancelled_at",
    }


def test_runner_may_only_deliver() -> None:
    assert ROLE_TARGETS[StaffRole.RUNNER] == {S.DELIVERED}
    check_role(StaffRole.RUNNER, S.DELIVERED)
    for target in (S.ACCEPTED, S.READY, S.CANCELLED, S.PICKED_UP, S.PAID):
        with pytest.raises(RoleForbidden):
            check_role(StaffRole.RUNNER, target)


@pytest.mark.parametrize("role", [StaffRole.OWNER, StaffRole.MANAGER, StaffRole.FULFILLMENT])
def test_other_roles_run_the_whole_board_but_never_paid(role: StaffRole) -> None:
    for target in (S.ACCEPTED, S.READY, S.DELIVERED, S.PICKED_UP, S.CANCELLED):
        check_role(role, target)
    for target in (S.PAID, S.PENDING_PAYMENT):
        with pytest.raises(RoleForbidden):
            check_role(role, target)
