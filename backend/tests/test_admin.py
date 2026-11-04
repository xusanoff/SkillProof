"""Platform admin: access, moderation, thresholds, AI usage (Phase 10)."""

import uuid
from collections.abc import AsyncIterator
from typing import Any

import pytest
from fastapi import Request
from httpx import AsyncClient
from sqlalchemy import select, update

from app.ai import usage
from app.api.deps import client_ip
from app.core.config import AiPrice, get_settings
from app.core.db import SessionLocal
from app.core.live_thresholds import apply_overrides, current_thresholds, reload_thresholds
from app.main import create_app
from app.models import AuditLog, User
from app.models.enums import UserRole
from tests.conftest import SignUp
from tests.test_job_board import _company, _publish

ADMIN = "/api/v1/admin"


@pytest.fixture(autouse=True)
async def _reset_thresholds() -> AsyncIterator[None]:
    yield
    apply_overrides(None)


async def _admin(signup: SignUp) -> AsyncClient:
    client = await signup("candidate")
    me = (await client.get("/api/v1/auth/me")).json()
    async with SessionLocal() as db:
        await db.execute(
            update(User).where(User.id == uuid.UUID(me["id"])).values(role=UserRole.admin)
        )
        await db.commit()
    return client


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/overview"),
        ("GET", "/users"),
        ("PATCH", f"/users/{uuid.uuid4()}"),
        ("GET", "/companies"),
        ("PATCH", f"/companies/{uuid.uuid4()}"),
        ("GET", "/vacancies"),
        ("PATCH", f"/vacancies/{uuid.uuid4()}"),
        ("GET", "/thresholds"),
        ("PUT", "/thresholds"),
        ("GET", "/ai-usage"),
    ],
)
async def test_only_admins_get_in(
    signup: SignUp, client: AsyncClient, method: str, path: str
) -> None:
    body = {"json": {}} if method != "GET" else {}
    assert (await client.request(method, ADMIN + path, **body)).status_code == 401
    for role in ("candidate", "hr"):
        user = await signup(role)
        assert (await user.request(method, ADMIN + path, **body)).status_code == 403


async def test_deactivating_a_user_ends_their_access(signup: SignUp) -> None:
    admin = await _admin(signup)
    target = await signup("candidate")
    tid = (await target.get("/api/v1/auth/me")).json()["id"]

    r = await admin.patch(f"{ADMIN}/users/{tid}", json={"is_active": False})
    assert r.status_code == 200 and r.json()["is_active"] is False
    assert (await target.get("/api/v1/auth/me")).status_code == 401
    assert (await target.post("/api/v1/auth/refresh")).status_code == 401

    async with SessionLocal() as db:
        logged = await db.scalar(select(AuditLog).where(AuditLog.action == "admin.user_active"))
    assert logged is not None


async def test_an_admin_cannot_deactivate_themselves(signup: SignUp) -> None:
    admin = await _admin(signup)
    me = (await admin.get("/api/v1/auth/me")).json()["id"]
    r = await admin.patch(f"{ADMIN}/users/{me}", json={"is_active": False})
    assert r.status_code == 409


async def test_user_search_treats_wildcards_as_text(signup: SignUp) -> None:
    admin = await _admin(signup)
    await signup("candidate", email="findme@example.com")
    assert (await admin.get(f"{ADMIN}/users", params={"q": "findme"})).json()["total"] == 1
    assert (await admin.get(f"{ADMIN}/users", params={"q": "%"})).json()["total"] == 0
    r = await admin.get(f"{ADMIN}/users", params={"role": "hr"})
    assert r.json()["total"] == 0


async def test_a_hidden_vacancy_leaves_the_public_site(signup: SignUp, client: AsyncClient) -> None:
    admin = await _admin(signup)
    hr = await signup("hr")
    candidate = await signup("candidate")
    cid = await _company(hr, f"Acme {uuid.uuid4().hex[:6]}")
    v = await _publish(hr, cid)
    url = f"/api/v1/vacancies/{v['id']}"
    assert (await client.get(url)).status_code == 200

    r = await admin.patch(f"{ADMIN}/vacancies/{v['id']}", json={"hidden": True, "reason": "Spam"})
    assert r.json()["hidden_reason"] == "Spam"

    assert (await client.get(url)).status_code == 404
    assert (await client.get("/api/v1/vacancies")).json()["total"] == 0
    assert (await candidate.post(f"{url}/apply", json={})).status_code == 404
    assert (await hr.get(url)).status_code == 200  # the company still sees its own

    await admin.patch(f"{ADMIN}/vacancies/{v['id']}", json={"hidden": False})
    assert (await client.get(url)).status_code == 200


async def test_a_blocked_company_leaves_the_public_site(
    signup: SignUp, client: AsyncClient
) -> None:
    admin = await _admin(signup)
    hr = await signup("hr")
    candidate = await signup("candidate")
    cid = await _company(hr, f"Acme {uuid.uuid4().hex[:6]}")
    v = await _publish(hr, cid)
    slug = (await hr.get(f"/api/v1/companies/{cid}")).json()["slug"]

    r = await admin.patch(f"{ADMIN}/companies/{cid}", json={"blocked": True, "reason": "Fraud"})
    assert r.status_code == 200 and r.json()["blocked_at"] is not None

    url = f"/api/v1/vacancies/{v['id']}"
    assert (await client.get(url)).status_code == 404
    assert (await client.get("/api/v1/vacancies")).json()["total"] == 0
    assert (await client.get(f"/api/v1/companies/by-slug/{slug}")).status_code == 404
    assert (await candidate.post(f"{url}/apply", json={})).status_code == 404

    # A blocked company cannot put anything back on the site.
    base = f"/api/v1/companies/{cid}/vacancies/{v['id']}"
    assert (await hr.patch(base, json={"status": "closed"})).status_code == 200
    r = await hr.patch(base, json={"status": "published"})
    assert r.status_code == 403 and r.json()["error"]["code"] == "company_blocked"

    await admin.patch(f"{ADMIN}/companies/{cid}", json={"blocked": False})
    assert (await client.get(f"/api/v1/companies/by-slug/{slug}")).status_code == 200


async def test_verifying_a_company(signup: SignUp) -> None:
    admin = await _admin(signup)
    hr = await signup("hr")
    cid = await _company(hr, f"Acme {uuid.uuid4().hex[:6]}")
    r = await admin.patch(f"{ADMIN}/companies/{cid}", json={"is_verified": True})
    assert r.json()["is_verified"] is True


async def test_global_thresholds_apply_and_survive_a_reload(signup: SignUp) -> None:
    admin = await _admin(signup)
    default = get_settings().thresholds.stage1.pass_threshold
    target = default - 5

    r = await admin.put(
        f"{ADMIN}/thresholds", json={"overrides": {"stage1": {"pass_threshold": target}}}
    )
    assert r.status_code == 200, r.text
    assert r.json()["effective"]["stage1"]["pass_threshold"] == target
    assert r.json()["defaults"]["stage1"]["pass_threshold"] == default
    assert current_thresholds().stage1.pass_threshold == target

    apply_overrides(None)  # another process, or a restart
    assert current_thresholds().stage1.pass_threshold == default
    async with SessionLocal() as db:
        await reload_thresholds(db)
    assert current_thresholds().stage1.pass_threshold == target

    r = await admin.put(f"{ADMIN}/thresholds", json={"overrides": {}})
    assert r.json()["effective"]["stage1"]["pass_threshold"] == default


@pytest.mark.parametrize(
    "overrides",
    [
        {"stage1": {"no_such_threshold": 1}},
        {"no_such_group": {}},
        {"privacy": {"retention_days": 0}},
        {"stage1": {"pass_threshold": "many"}},
    ],
)
async def test_bad_thresholds_are_refused(signup: SignUp, overrides: dict[str, object]) -> None:
    admin = await _admin(signup)
    r = await admin.put(f"{ADMIN}/thresholds", json={"overrides": overrides})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "invalid_thresholds"
    assert (await admin.get(f"{ADMIN}/thresholds")).json()["overrides"] == {}


async def test_ai_usage_adds_up_and_marks_unknown_prices(
    signup: SignUp, monkeypatch: pytest.MonkeyPatch
) -> None:
    admin = await _admin(signup)
    monkeypatch.setitem(
        get_settings().ai_prices, "priced", AiPrice(input_per_mtok=1, output_per_mtok=2)
    )
    await usage.record(
        usage.Call(
            kind="llm",
            provider="p",
            model="priced",
            role="code_reviewer",
            input_tokens=1_000_000,
            output_tokens=1_000_000,
        )
    )
    await usage.record(usage.Call(kind="llm", provider="p", model="free?", outcome="invalid"))

    data = (await admin.get(f"{ADMIN}/ai-usage")).json()
    assert data["total"]["calls"] == 2
    assert data["total"]["cost_usd"] == 3.0
    assert data["total"]["unpriced_calls"] == 1
    assert data["total"]["failed_calls"] == 1
    assert {b["key"] for b in data["by_model"]} == {"priced", "free?"}
    assert len(data["by_day"]) == 1

    overview = (await admin.get(f"{ADMIN}/overview")).json()
    assert overview["ai_calls_30d"] == 2
    assert overview["ai_calls_unpriced_30d"] == 1


async def test_recording_usage_never_breaks_the_call(monkeypatch: pytest.MonkeyPatch) -> None:
    def broken() -> None:
        raise OSError("db down")

    monkeypatch.setattr("app.ai.usage.SessionLocal", broken)
    await usage.record(usage.Call(kind="llm", provider="p"))


def _request(xff: str | None, host: str = "10.0.0.1") -> Any:
    headers = [(b"x-forwarded-for", xff.encode())] if xff else []
    return Request({"type": "http", "headers": headers, "client": (host, 1)})


def test_the_forwarded_address_counts_only_behind_a_trusted_proxy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assert client_ip(_request("1.2.3.4")) == "10.0.0.1"  # anyone could send this header
    monkeypatch.setattr(get_settings(), "trust_forwarded_for", True)
    assert client_ip(_request("1.2.3.4, 5.6.7.8")) == "1.2.3.4"
    assert client_ip(_request(None)) == "10.0.0.1"


def test_api_docs_are_closed_outside_development(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "environment", "production")
    app = create_app()
    assert app.openapi_url is None and app.docs_url is None and app.redoc_url is None
