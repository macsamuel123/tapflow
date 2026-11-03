from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel

from app.db import DbPing, get_db_ping

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    db: Literal["ok", "down"]


@router.get("/health", response_model=HealthResponse)
async def health(
    response: Response, ping: Annotated[DbPing, Depends(get_db_ping)]
) -> HealthResponse:
    db_ok = await ping()
    if not db_ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return HealthResponse(status="ok" if db_ok else "degraded", db="ok" if db_ok else "down")
