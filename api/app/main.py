from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings, get_settings
from app.db import create_pool
from app.payments.gateway import PaymentGateway, UnavailableGateway
from app.routers import cart, checkout, health, menu, sessions, staff_orders, webhooks


def _payment_gateway(cfg: Settings) -> PaymentGateway:
    key = cfg.stripe_secret_key.get_secret_value() if cfg.stripe_secret_key else ""
    if not key:
        return UnavailableGateway()
    from app.payments.stripe_gateway import StripeGateway

    return StripeGateway(key)


def create_app(settings: Settings | None = None) -> FastAPI:
    cfg = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        pool = create_pool(cfg.database_url, min_size=cfg.db_pool_min, max_size=cfg.db_pool_max)
        await pool.open(wait=False)
        app.state.pool = pool
        try:
            yield
        finally:
            await pool.close()

    app = FastAPI(title="TapFlow API", version="0.1.0", lifespan=lifespan)
    app.state.settings = cfg
    app.state.payments = _payment_gateway(cfg)
    # The web app normally calls the API through the Next.js /api rewrite (same origin);
    # CORS only matters for direct calls during development.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[cfg.app_base_url],
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "X-Session-Token", "Stripe-Signature"],
    )
    app.include_router(health.router)
    app.include_router(sessions.router)
    app.include_router(menu.router)
    app.include_router(cart.router)
    app.include_router(checkout.router)
    app.include_router(webhooks.router)
    app.include_router(staff_orders.router)
    return app


app = create_app()
