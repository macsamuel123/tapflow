from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings, get_settings
from app.db import create_pool
from app.routers import cart, health, menu, sessions


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

    app = FastAPI(title="Restaurant Ordering API", version="0.1.0", lifespan=lifespan)
    app.state.settings = cfg
    # The web app normally calls the API through the Next.js /api rewrite (same origin);
    # CORS only matters for direct calls during development.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[cfg.app_base_url],
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "X-Session-Token"],
    )
    app.include_router(health.router)
    app.include_router(sessions.router)
    app.include_router(menu.router)
    app.include_router(cart.router)
    return app


app = create_app()
