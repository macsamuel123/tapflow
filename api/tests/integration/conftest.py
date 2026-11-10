"""Integration fixtures: real local Supabase Postgres, one rolled-back transaction per test.

The app's `get_conn` dependency is overridden to hand every request the test's connection,
so API writes and the test's own setup/assertions see the same uncommitted data.
Fixture SQL here is test setup only; application SQL lives in app/repositories/.
"""

import hashlib
import hmac
import json
import time
from collections.abc import AsyncIterator
from typing import Any
from uuid import UUID, uuid4

import httpx
import jwt
import psycopg
import pytest
from psycopg import AsyncConnection
from pydantic import SecretStr

from app.config import Settings, get_settings
from app.db import Conn, get_conn
from app.deps import get_payment_gateway
from app.domain.qr_tokens import sign_touchpoint_token
from app.main import create_app
from app.payments.fake import FakeGateway

SLUG = "demo-bistro"
VENUE_ID = UUID("b0000000-0000-4000-8000-000000000001")
TOUCHPOINT_1 = UUID("c0000000-0000-4000-8000-000000000001")
TOUCHPOINT_2 = UUID("c0000000-0000-4000-8000-000000000002")
TABLE_1_SECRET = "dev-only-qr-secret-table-01"

BURGER = UUID("e0000000-0000-4000-8000-000000000201")
LATTE = UUID("e0000000-0000-4000-8000-000000000401")
FRIES = UUID("e0000000-0000-4000-8000-000000000101")
AMERICANO = UUID("e0000000-0000-4000-8000-000000000402")
NANAIMO_BAR = UUID("e0000000-0000-4000-8000-000000000304")
HOUSE_RED = UUID("e0000000-0000-4000-8000-000000000407")
SPARKLING_WATER = UUID("e0000000-0000-4000-8000-000000000405")
PICKUP_COUNTER = UUID("c0000000-0000-4000-8000-000000000006")

OWNER = UUID("a0000000-0000-4000-8000-000000000001")
FULFILLMENT = UUID("a0000000-0000-4000-8000-000000000002")
MANAGER = UUID("a0000000-0000-4000-8000-000000000003")
RUNNER = UUID("a0000000-0000-4000-8000-000000000004")
PLATFORM_ADMIN = UUID("a0000000-0000-4000-8000-000000000005")

STRIPE_ACCOUNT = "acct_test_demo_bistro"
TEST_JWT_SECRET = "integration-test-jwt-secret-0123456789abcdef"
TEST_WEBHOOK_SECRET = "whsec_test_integration"


def _db_available() -> bool:
    try:
        with psycopg.connect(get_settings().database_url, connect_timeout=2):
            return True
    except psycopg.OperationalError:
        return False


DB_AVAILABLE = _db_available()
requires_db = pytest.mark.skipif(not DB_AVAILABLE, reason="local Supabase Postgres not running")


def touchpoint_token(
    touchpoint_id: UUID = TOUCHPOINT_1, secret: str = TABLE_1_SECRET, slug: str = SLUG
) -> str:
    return sign_touchpoint_token(secret, slug, touchpoint_id)


@pytest.fixture
async def db() -> AsyncIterator[Conn]:
    conn = await AsyncConnection.connect(get_settings().database_url, autocommit=False)
    try:
        yield conn
    finally:
        await conn.rollback()
        await conn.close()


def integration_settings() -> Settings:
    return get_settings().model_copy(
        update={
            "supabase_jwt_secret": SecretStr(TEST_JWT_SECRET),
            "stripe_webhook_secret": SecretStr(TEST_WEBHOOK_SECRET),
            "stripe_connect_webhook_secret": None,
            "stripe_secret_key": None,
        }
    )


@pytest.fixture
def fake_gateway() -> FakeGateway:
    return FakeGateway()


@pytest.fixture
async def client(db: Conn, fake_gateway: FakeGateway) -> AsyncIterator[httpx.AsyncClient]:
    app = create_app(integration_settings())

    async def shared_conn() -> AsyncIterator[Conn]:
        yield db

    app.dependency_overrides[get_conn] = shared_conn
    app.dependency_overrides[get_payment_gateway] = lambda: fake_gateway
    # ASGITransport doesn't run the lifespan, so no pool is opened.
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def start_session(
    client: httpx.AsyncClient, *, verified: bool = True, touchpoint_id: UUID = TOUCHPOINT_1
) -> dict[str, Any]:
    body: dict[str, Any] = {"venue_slug": SLUG, "touchpoint_id": str(touchpoint_id)}
    if verified:
        body["token"] = touchpoint_token(
            touchpoint_id, secret=f"dev-only-qr-secret-table-0{_n(touchpoint_id)}"
        )
    res = await client.post("/sessions", json=body)
    assert res.status_code == 201, res.text
    data: dict[str, Any] = res.json()
    assert data["verified"] is verified
    return data


def _n(touchpoint_id: UUID) -> int:
    return int(str(touchpoint_id)[-1])


def auth(session: dict[str, Any]) -> dict[str, str]:
    return {"X-Session-Token": session["session_token"]}


async def modifier_ids(client: httpx.AsyncClient) -> dict[tuple[UUID, str], UUID]:
    """(item_id, modifier name) -> modifier id, from the public menu (seed ids are random)."""
    res = await client.get(f"/venues/{SLUG}/menu")
    assert res.status_code == 200
    out: dict[tuple[UUID, str], UUID] = {}
    for cat in res.json()["categories"]:
        for it in cat["items"]:
            for g in it["modifier_groups"]:
                for m in g["modifiers"]:
                    out[(UUID(it["id"]), m["name"])] = UUID(m["id"])
    return out


# ---------------------------------------------------------------- M7: payments and staff


def staff_headers(user_id: UUID, *, secret: str = TEST_JWT_SECRET) -> dict[str, str]:
    """A Supabase-style access token for a seed user."""
    claims = {
        "sub": str(user_id),
        "aud": "authenticated",
        "role": "authenticated",
        "exp": int(time.time()) + 600,
    }
    return {"Authorization": f"Bearer {jwt.encode(claims, secret, algorithm='HS256')}"}


def stripe_signature(payload: bytes, *, secret: str = TEST_WEBHOOK_SECRET) -> str:
    t = int(time.time())
    mac = hmac.new(secret.encode(), f"{t}.".encode() + payload, hashlib.sha256).hexdigest()
    return f"t={t},v1={mac}"


async def post_webhook(
    client: httpx.AsyncClient, event: dict[str, Any], *, secret: str = TEST_WEBHOOK_SECRET
) -> httpx.Response:
    payload = json.dumps(event).encode()
    return await client.post(
        "/webhooks/stripe",
        content=payload,
        headers={
            "Stripe-Signature": stripe_signature(payload, secret=secret),
            "Content-Type": "application/json",
        },
    )


def pi_event(
    event_type: str,
    *,
    pi_id: str,
    order_id: str,
    amount: int,
    currency: str = "cad",
    event_id: str | None = None,
) -> dict[str, Any]:
    return {
        "id": event_id or f"evt_{uuid4().hex}",
        "object": "event",
        "type": event_type,
        "data": {
            "object": {
                "id": pi_id,
                "object": "payment_intent",
                "amount": amount,
                "amount_received": amount if event_type == "payment_intent.succeeded" else 0,
                "currency": currency,
                "metadata": {"order_id": order_id},
            }
        },
    }


async def enable_charges(db: Conn, *, enabled: bool = True) -> None:
    await db.execute(
        "update public.venue_payment_settings set stripe_account_id = %s, "
        "stripe_charges_enabled = %s where venue_id = %s",
        (STRIPE_ACCOUNT, enabled, VENUE_ID),
    )


async def add_to_cart(
    client: httpx.AsyncClient,
    session: dict[str, Any],
    item_id: UUID,
    modifier_ids: list[UUID] | None = None,
    quantity: int = 1,
) -> None:
    res = await client.post(
        "/cart/items",
        json={
            "item_id": str(item_id),
            "modifier_ids": [str(m) for m in modifier_ids or []],
            "quantity": quantity,
        },
        headers=auth(session),
    )
    assert res.status_code == 201, res.text


async def checkout(
    client: httpx.AsyncClient, session: dict[str, Any], **body: Any
) -> httpx.Response:
    return await client.post("/checkout", json=body, headers=auth(session))


async def paid_order(
    client: httpx.AsyncClient,
    db: Conn,
    *,
    touchpoint_id: UUID = TOUCHPOINT_1,
    item_id: UUID = AMERICANO,
    **checkout_body: Any,
) -> dict[str, Any]:
    """Session → cart → checkout → signed payment_intent.succeeded. Returns the checkout body
    plus the payment intent id."""
    await enable_charges(db)
    session = await start_session(client, touchpoint_id=touchpoint_id)
    await add_to_cart(client, session, item_id)
    res = await checkout(client, session, **checkout_body)
    assert res.status_code == 201, res.text
    out: dict[str, Any] = res.json()
    cur = await db.execute(
        "select stripe_payment_intent_id from public.order_payments where order_id = %s",
        (out["order_id"],),
    )
    row = await cur.fetchone()
    assert row is not None
    out["pi_id"] = row[0]
    hook = await post_webhook(
        client,
        pi_event(
            "payment_intent.succeeded",
            pi_id=row[0],
            order_id=out["order_id"],
            amount=out["total_cents"],
        ),
    )
    assert hook.status_code == 200, hook.text
    assert "ticket_number" in hook.json(), hook.json()
    out["session"] = session
    return out
