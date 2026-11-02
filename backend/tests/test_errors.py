from fastapi import FastAPI
from httpx import AsyncClient
from pydantic import BaseModel

from app.core.errors import AppError


class _Body(BaseModel):
    n: int


def _add_routes(app: FastAPI) -> None:
    @app.get("/_boom/app")
    async def app_error() -> None:
        raise AppError("vacancy_closed", "Vacancy is closed", 409, {"id": "1"})

    @app.get("/_boom/crash")
    async def crash() -> None:
        raise RuntimeError("secret internals")

    @app.post("/_boom/validate")
    async def validate(body: _Body) -> _Body:
        return body


async def test_app_error_envelope(app, client: AsyncClient) -> None:  # type: ignore[no-untyped-def]
    _add_routes(app)
    r = await client.get("/_boom/app", headers={"X-Request-ID": "req-1"})
    assert r.status_code == 409
    assert r.json() == {
        "error": {
            "code": "vacancy_closed",
            "message": "Vacancy is closed",
            "details": {"id": "1"},
            "request_id": "req-1",
        }
    }
    assert r.headers["x-request-id"] == "req-1"


async def test_not_found_uses_envelope(client: AsyncClient) -> None:
    r = await client.get("/does-not-exist")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"


async def test_validation_error_lists_fields(app, client: AsyncClient) -> None:  # type: ignore[no-untyped-def]
    _add_routes(app)
    r = await client.post("/_boom/validate", json={"n": "abc"})
    assert r.status_code == 422
    err = r.json()["error"]
    assert err["code"] == "validation_error"
    assert err["details"]["fields"][0]["loc"] == ["body", "n"]


async def test_unhandled_error_hides_internals(app) -> None:  # type: ignore[no-untyped-def]
    from httpx import ASGITransport

    _add_routes(app)
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get("/_boom/crash")
    assert r.status_code == 500
    assert r.json()["error"]["code"] == "internal_error"
    assert "secret" not in r.text
