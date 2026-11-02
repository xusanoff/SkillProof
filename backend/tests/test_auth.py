import re

from httpx import AsyncClient

from app.services.email import ConsoleEmailSender
from tests.conftest import SignUp

REGISTER = {
    "email": "Aziz@Example.com",
    "password": "correct-horse-1",
    "full_name": "Aziz Karimov",
    "role": "candidate",
}


def _with_cookie(c: AsyncClient, refresh: str | None) -> AsyncClient:
    c.cookies.set("sp_refresh", refresh or "", domain="test.local", path="/api")
    return c


def _token(outbox: ConsoleEmailSender, template: str) -> str:
    message = next(m for m in reversed(outbox.outbox) if m.template == template)
    match = re.search(r"token=([\w-]+)", message.body)
    assert match
    return match.group(1)


async def test_register_sets_httponly_cookies_and_returns_me(
    client: AsyncClient, outbox: ConsoleEmailSender
) -> None:
    r = await client.post("/api/v1/auth/register", json=REGISTER)
    assert r.status_code == 201
    me = r.json()
    assert me["email"] == "aziz@example.com"
    assert me["role"] == "candidate" and me["is_email_verified"] is False
    assert me["companies"] == []
    assert "access" not in r.text.lower().replace("is_email_verified", "")
    cookies = r.headers.get_list("set-cookie")
    assert any(c.startswith("sp_access=") and "HttpOnly" in c and "Path=/;" in c for c in cookies)
    assert any(
        c.startswith("sp_refresh=") and "HttpOnly" in c and "Path=/api" in c for c in cookies
    )
    assert outbox.outbox[0].to == "aziz@example.com"
    assert "/uz/verify-email?token=" in outbox.outbox[0].body

    me2 = await client.get("/api/v1/auth/me")
    assert me2.status_code == 200 and me2.json()["id"] == me["id"]


async def test_register_rejects_duplicate_email_and_admin_role(client: AsyncClient) -> None:
    await client.post("/api/v1/auth/register", json=REGISTER)
    dup = await client.post("/api/v1/auth/register", json={**REGISTER, "email": "aziz@example.com"})
    assert dup.status_code == 409 and dup.json()["error"]["code"] == "email_taken"
    admin = await client.post("/api/v1/auth/register", json={**REGISTER, "role": "admin"})
    assert admin.status_code == 422


async def test_register_validates_password_and_timezone(client: AsyncClient) -> None:
    r = await client.post("/api/v1/auth/register", json={**REGISTER, "password": "short"})
    assert r.status_code == 422
    assert r.json()["error"]["details"]["fields"][0]["loc"] == ["body", "password"]
    r = await client.post("/api/v1/auth/register", json={**REGISTER, "timezone": "Mars/Base"})
    assert r.status_code == 422


async def test_me_requires_auth(client: AsyncClient) -> None:
    r = await client.get("/api/v1/auth/me")
    assert r.status_code == 401 and r.json()["error"]["code"] == "unauthorized"


async def test_login_success_and_wrong_password(client: AsyncClient, signup: SignUp) -> None:
    await signup("candidate", email="login@example.com")
    bad = await client.post(
        "/api/v1/auth/login", json={"email": "login@example.com", "password": "nope-nope"}
    )
    assert bad.status_code == 401 and bad.json()["error"]["code"] == "invalid_credentials"
    unknown = await client.post(
        "/api/v1/auth/login", json={"email": "ghost@example.com", "password": "whatever1"}
    )
    assert unknown.status_code == 401 and unknown.json()["error"]["code"] == "invalid_credentials"
    ok = await client.post(
        "/api/v1/auth/login", json={"email": "LOGIN@example.com", "password": "correct-horse-1"}
    )
    assert ok.status_code == 200 and ok.json()["email"] == "login@example.com"


async def test_login_is_rate_limited(client: AsyncClient) -> None:
    body = {"email": "spam@example.com", "password": "wrong-pass"}
    codes = [(await client.post("/api/v1/auth/login", json=body)).status_code for _ in range(11)]
    assert codes[:10] == [401] * 10
    assert codes[10] == 429


async def test_refresh_rotates_and_replay_revokes_all_sessions(
    client: AsyncClient, signup: SignUp
) -> None:
    user = await signup()
    old_refresh = user.cookies.get("sp_refresh")
    r = await user.post("/api/v1/auth/refresh")
    assert r.status_code == 200
    new_refresh = user.cookies.get("sp_refresh")
    assert new_refresh and new_refresh != old_refresh

    # An attacker replays the old (already rotated) token...
    replay = await _with_cookie(client, old_refresh).post("/api/v1/auth/refresh")
    assert replay.status_code == 401
    assert replay.json()["error"]["code"] == "invalid_refresh_token"
    # ...so the legitimate session is revoked too.
    again = await user.post("/api/v1/auth/refresh")
    assert again.status_code == 401


async def test_logout_revokes_refresh_token(signup: SignUp) -> None:
    user = await signup()
    refresh = user.cookies.get("sp_refresh")
    assert (await user.post("/api/v1/auth/logout")).status_code == 204
    r = await _with_cookie(user, refresh).post("/api/v1/auth/refresh")
    assert r.status_code == 401


async def test_email_verification_flow(client: AsyncClient, outbox: ConsoleEmailSender) -> None:
    await client.post("/api/v1/auth/register", json=REGISTER)
    token = _token(outbox, "verify_email")
    assert (
        await client.post("/api/v1/auth/verify-email", json={"token": token})
    ).status_code == 204
    assert (await client.get("/api/v1/auth/me")).json()["is_email_verified"] is True
    reused = await client.post("/api/v1/auth/verify-email", json={"token": token})
    assert reused.status_code == 400 and reused.json()["error"]["code"] == "invalid_token"


async def test_resend_verification_invalidates_previous_link(
    client: AsyncClient, outbox: ConsoleEmailSender
) -> None:
    await client.post("/api/v1/auth/register", json=REGISTER)
    first = _token(outbox, "verify_email")
    assert (await client.post("/api/v1/auth/resend-verification")).status_code == 204
    second = _token(outbox, "verify_email")
    assert first != second
    assert (
        await client.post("/api/v1/auth/verify-email", json={"token": first})
    ).status_code == 400
    assert (
        await client.post("/api/v1/auth/verify-email", json={"token": second})
    ).status_code == 204


async def test_password_reset_flow(
    client: AsyncClient, signup: SignUp, outbox: ConsoleEmailSender
) -> None:
    user = await signup(email="reset@example.com")
    r = await client.post("/api/v1/auth/password/forgot", json={"email": "reset@example.com"})
    assert r.status_code == 202
    token = _token(outbox, "reset_password")
    r = await client.post(
        "/api/v1/auth/password/reset", json={"token": token, "password": "brand-new-pass"}
    )
    assert r.status_code == 204
    # Old sessions are revoked, the new password works, the old one doesn't.
    assert (await user.post("/api/v1/auth/refresh")).status_code == 401
    login = {"email": "reset@example.com", "password": "brand-new-pass"}
    assert (await client.post("/api/v1/auth/login", json=login)).status_code == 200
    login["password"] = "correct-horse-1"
    assert (await client.post("/api/v1/auth/login", json=login)).status_code == 401
    reuse = await client.post(
        "/api/v1/auth/password/reset", json={"token": token, "password": "another-pass1"}
    )
    assert reuse.status_code == 400


async def test_forgot_password_does_not_reveal_accounts(
    client: AsyncClient, outbox: ConsoleEmailSender
) -> None:
    r = await client.post("/api/v1/auth/password/forgot", json={"email": "nobody@example.com"})
    assert r.status_code == 202
    assert outbox.outbox == []


async def test_update_me(signup: SignUp) -> None:
    user = await signup()
    r = await user.patch(
        "/api/v1/auth/me",
        json={"full_name": "Yangi Ism", "locale": "ru", "timezone": "Europe/Moscow"},
    )
    assert r.status_code == 200
    assert (r.json()["full_name"], r.json()["locale"], r.json()["timezone"]) == (
        "Yangi Ism",
        "ru",
        "Europe/Moscow",
    )
