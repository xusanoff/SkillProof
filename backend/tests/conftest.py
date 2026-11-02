import os
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from pathlib import Path

os.environ["ENVIRONMENT"] = "test"
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://skillproof:skillproof@localhost:5432/skillproof_test",
)

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.core.db import engine
from app.core.rate_limit import MemoryRateLimitBackend, RateLimiter, get_rate_limiter
from app.main import create_app
from app.models import Base
from app.seed.reference import upsert_reference
from app.services.email import ConsoleEmailSender, get_email_sender
from app.services.storage import LocalStorage, get_storage

REFERENCE_TABLES = {"regions", "profession_areas", "skills"}


@pytest.fixture(scope="session", autouse=True)
async def _schema() -> AsyncIterator[None]:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(upsert_reference)
    yield
    await engine.dispose()


@pytest.fixture(autouse=True)
async def _clean_tables() -> AsyncIterator[None]:
    yield
    tables = ", ".join(
        t.name for t in Base.metadata.sorted_tables if t.name not in REFERENCE_TABLES
    )
    async with engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {tables} CASCADE"))


@pytest.fixture
def outbox() -> ConsoleEmailSender:
    return ConsoleEmailSender()


@pytest.fixture
def app(outbox: ConsoleEmailSender, tmp_path: Path) -> FastAPI:
    application = create_app()
    application.dependency_overrides[get_email_sender] = lambda: outbox
    application.dependency_overrides[get_storage] = lambda: LocalStorage(str(tmp_path))
    limiter = RateLimiter(MemoryRateLimitBackend())
    application.dependency_overrides[get_rate_limiter] = lambda: limiter
    return application


def make_client(app: FastAPI) -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    async with make_client(app) as c:
        yield c


SignUp = Callable[..., Awaitable[AsyncClient]]


@pytest.fixture
async def signup(app: FastAPI) -> AsyncIterator[SignUp]:
    """Registers a user and returns a client holding that user's session cookies."""
    clients: list[AsyncClient] = []

    async def _signup(role: str = "candidate", email: str | None = None) -> AsyncClient:
        c = make_client(app)
        clients.append(c)
        r = await c.post(
            "/api/v1/auth/register",
            json={
                "email": email or f"{role}-{uuid.uuid4().hex[:8]}@example.com",
                "password": "correct-horse-1",
                "full_name": f"Test {role.title()}",
                "role": role,
            },
        )
        assert r.status_code == 201, r.text
        return c

    yield _signup
    for c in clients:
        await c.aclose()
