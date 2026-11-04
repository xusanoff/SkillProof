import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.health import router as health_router
from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.errors import register_error_handlers
from app.core.live_thresholds import RELOAD_SECONDS, reload_thresholds
from app.core.logging import RequestIdMiddleware, configure_logging

logger = logging.getLogger(__name__)


async def _keep_thresholds_current() -> None:
    while True:
        try:
            async with SessionLocal() as session:
                await reload_thresholds(session)
        except Exception as exc:
            logger.warning("thresholds_not_reloaded", extra={"error": type(exc).__name__})
        await asyncio.sleep(RELOAD_SECONDS)


@asynccontextmanager
async def _lifespan(_: FastAPI) -> AsyncIterator[None]:
    task = asyncio.create_task(_keep_thresholds_current())
    yield
    task.cancel()


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)

    public_docs = settings.environment in ("local", "test")
    app = FastAPI(
        title=f"{settings.app_name} API",
        version=settings.version,
        lifespan=_lifespan,
        docs_url="/docs" if public_docs else None,
        redoc_url="/redoc" if public_docs else None,
        openapi_url="/openapi.json" if public_docs else None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(RequestIdMiddleware)
    register_error_handlers(app)

    app.include_router(health_router)
    app.include_router(api_router)
    return app


app = create_app()
