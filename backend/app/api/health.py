import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel

from app.core.config import Settings, get_settings
from app.core.db import check_database
from app.core.redis import check_redis

logger = logging.getLogger(__name__)
router = APIRouter(tags=["health"])

CheckStatus = Literal["ok", "error"]
HealthCheck = Callable[[], Awaitable[bool]]


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    version: str
    environment: str
    checks: dict[str, CheckStatus]


def get_health_checks() -> dict[str, HealthCheck]:
    return {"database": check_database, "redis": check_redis}


async def _run(name: str, check: HealthCheck) -> CheckStatus:
    try:
        return "ok" if await asyncio.wait_for(check(), timeout=3) else "error"
    except Exception as exc:
        logger.warning("health_check_failed", extra={"check": name, "error": repr(exc)})
        return "error"


@router.get("/health", response_model=HealthResponse)
async def health(
    response: Response,
    settings: Annotated[Settings, Depends(get_settings)],
    checks: Annotated[dict[str, HealthCheck], Depends(get_health_checks)],
) -> HealthResponse:
    results = await asyncio.gather(*(_run(name, fn) for name, fn in checks.items()))
    statuses = dict(zip(checks, results, strict=True))
    healthy = all(s == "ok" for s in statuses.values())
    if not healthy:
        response.status_code = 503
    return HealthResponse(
        status="ok" if healthy else "degraded",
        version=settings.version,
        environment=settings.environment,
        checks=statuses,
    )
