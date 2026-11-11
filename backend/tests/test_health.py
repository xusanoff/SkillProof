from httpx import AsyncClient

from app.api.health import get_health_checks


async def _ok() -> bool:
    return True


async def _boom() -> bool:
    raise ConnectionError("down")


async def test_health_ok(app, client: AsyncClient) -> None:  # type: ignore[no-untyped-def]
    app.dependency_overrides[get_health_checks] = lambda: {"database": _ok, "redis": _ok}
    r = await client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["environment"] == "test"
    assert body["checks"] == {"database": "ok", "redis": "ok"}
    assert r.headers["x-request-id"]


async def test_health_degraded_when_dependency_down(app, client: AsyncClient) -> None:  # type: ignore[no-untyped-def]
    app.dependency_overrides[get_health_checks] = lambda: {"database": _ok, "redis": _boom}
    r = await client.get("/health")
    assert r.status_code == 503
    assert r.json()["status"] == "degraded"
    assert r.json()["checks"]["redis"] == "error"


async def test_health_detects_a_stopped_worker(app, client: AsyncClient) -> None:  # type: ignore[no-untyped-def]
    app.dependency_overrides[get_health_checks] = lambda: {
        "database": _ok,
        "redis": _ok,
        "worker": _boom,
    }
    r = await client.get("/health")
    assert r.status_code == 503
    assert r.json()["checks"] == {"database": "ok", "redis": "ok", "worker": "error"}


async def test_worker_check_uses_the_arq_heartbeat(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    from unittest.mock import AsyncMock

    from arq.constants import default_queue_name, health_check_key_suffix

    from app.core.redis import check_worker, redis_client

    exists = AsyncMock(return_value=1)
    monkeypatch.setattr(redis_client, "exists", exists)
    assert await check_worker()
    exists.assert_awaited_once_with(default_queue_name + health_check_key_suffix)
    exists.return_value = 0
    assert not await check_worker()
