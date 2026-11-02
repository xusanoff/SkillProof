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
