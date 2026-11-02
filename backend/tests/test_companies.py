"""Includes the Phase 1 acceptance check: HR of company A cannot access company B."""

import re

from httpx import AsyncClient

from app.services.email import ConsoleEmailSender
from tests.conftest import SignUp

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


async def _company(hr: AsyncClient, name: str = "Acme Tech") -> dict:  # type: ignore[type-arg]
    r = await hr.post(
        "/api/v1/companies",
        json={"name": name, "website": "https://acme.uz", "country": "uz", "city": "Toshkent"},
    )
    assert r.status_code == 201, r.text
    return r.json()  # type: ignore[no-any-return]


def _invite_token(outbox: ConsoleEmailSender) -> str:
    match = re.search(r"/invitations/([\w-]+)", outbox.outbox[-1].body)
    assert match
    return match.group(1)


async def test_hr_creates_company_and_becomes_owner(signup: SignUp) -> None:
    hr = await signup("hr")
    company = await _company(hr, "O'zbek Soft")
    assert company["member_role"] == "owner"
    assert company["slug"] == "ozbek-soft"
    assert company["country"] == "UZ"
    me = (await hr.get("/api/v1/auth/me")).json()
    assert me["companies"] == [
        {"id": company["id"], "name": "O'zbek Soft", "slug": "ozbek-soft", "member_role": "owner"}
    ]
    second = await _company(hr, "O'zbek Soft")
    assert second["slug"].startswith("ozbek-soft-") and second["slug"] != "ozbek-soft"


async def test_candidate_cannot_create_company(signup: SignUp) -> None:
    candidate = await signup("candidate")
    r = await candidate.post("/api/v1/companies", json={"name": "Nope LLC"})
    assert r.status_code == 403


async def test_public_company_page_by_slug(signup: SignUp, client: AsyncClient) -> None:
    hr = await signup("hr")
    company = await _company(hr)
    r = await client.get(f"/api/v1/companies/by-slug/{company['slug']}")
    assert r.status_code == 200 and r.json()["name"] == "Acme Tech"
    assert "member_role" not in r.json()


async def test_hr_of_company_a_cannot_access_company_b(signup: SignUp) -> None:
    hr_a = await signup("hr")
    hr_b = await signup("hr")
    await _company(hr_a, "Company A")
    b = await _company(hr_b, "Company B")
    base = f"/api/v1/companies/{b['id']}"

    attempts = [
        await hr_a.get(base),
        await hr_a.patch(base, json={"name": "Hijacked"}),
        await hr_a.get(f"{base}/members"),
        await hr_a.get(f"{base}/invitations"),
        await hr_a.post(f"{base}/invitations", json={"email": "x@example.com"}),
        await hr_a.post(f"{base}/logo", files={"file": ("l.png", PNG, "image/png")}),
        await hr_a.delete(f"{base}/members/{(await hr_b.get('/api/v1/auth/me')).json()['id']}"),
    ]
    for r in attempts:
        assert r.status_code == 404, (r.request.method, r.request.url, r.text)
        assert r.json()["error"]["code"] == "not_found"

    mine = (await hr_a.get("/api/v1/companies/mine")).json()
    assert [c["name"] for c in mine] == ["Company A"]
    assert (await hr_b.get(base)).json()["name"] == "Company B"


async def test_invite_accept_flow_and_owner_only_routes(
    signup: SignUp, outbox: ConsoleEmailSender, client: AsyncClient
) -> None:
    owner = await signup("hr")
    company = await _company(owner)
    base = f"/api/v1/companies/{company['id']}"

    r = await owner.post(f"{base}/invitations", json={"email": "Recruiter@Example.com"})
    assert r.status_code == 201
    assert r.json()["email"] == "recruiter@example.com"
    assert r.json()["invited_by_name"] == "Test Hr"
    dup = await owner.post(f"{base}/invitations", json={"email": "recruiter@example.com"})
    assert dup.json()["error"]["code"] == "invitation_pending"

    token = _invite_token(outbox)
    public = await client.get(f"/api/v1/invitations/{token}")
    assert public.json() == {
        "company": {"name": "Acme Tech", "slug": company["slug"], "logo_url": None},
        "email": "recruiter@example.com",
        "status": "pending",
    }

    recruiter = await signup("hr", email="recruiter@example.com")
    accepted = await recruiter.post(f"/api/v1/invitations/{token}/accept")
    assert accepted.status_code == 200 and accepted.json()["member_role"] == "hr"
    assert (await client.get(f"/api/v1/invitations/{token}")).json()["status"] == "accepted"

    members = (await owner.get(f"{base}/members")).json()
    assert sorted(m["member_role"] for m in members) == ["hr", "owner"]

    # A plain HR member can read and edit the company, but not manage the team.
    assert (await recruiter.get(f"{base}/members")).status_code == 200
    assert (await recruiter.patch(base, json={"industry": "IT"})).status_code == 200
    forbidden = await recruiter.post(f"{base}/invitations", json={"email": "z@example.com"})
    assert forbidden.status_code == 403
    assert (await recruiter.get(f"{base}/invitations")).status_code == 403

    already = await owner.post(f"{base}/invitations", json={"email": "recruiter@example.com"})
    assert already.json()["error"]["code"] == "already_member"

    recruiter_id = (await recruiter.get("/api/v1/auth/me")).json()["id"]
    assert (await owner.delete(f"{base}/members/{recruiter_id}")).status_code == 204
    assert (await recruiter.get(base)).status_code == 404


async def test_invitation_email_and_role_mismatch(
    signup: SignUp, outbox: ConsoleEmailSender
) -> None:
    owner = await signup("hr")
    company = await _company(owner)
    await owner.post(
        f"/api/v1/companies/{company['id']}/invitations", json={"email": "cand@example.com"}
    )
    token = _invite_token(outbox)

    other_hr = await signup("hr")
    r = await other_hr.post(f"/api/v1/invitations/{token}/accept")
    assert r.status_code == 403 and r.json()["error"]["code"] == "email_mismatch"

    candidate = await signup("candidate", email="cand@example.com")
    r = await candidate.post(f"/api/v1/invitations/{token}/accept")
    assert r.status_code == 403 and r.json()["error"]["code"] == "role_mismatch"


async def test_revoked_invitation_cannot_be_accepted(
    signup: SignUp, outbox: ConsoleEmailSender
) -> None:
    owner = await signup("hr")
    company = await _company(owner)
    base = f"/api/v1/companies/{company['id']}"
    inv = (await owner.post(f"{base}/invitations", json={"email": "r2@example.com"})).json()
    token = _invite_token(outbox)
    assert (await owner.delete(f"{base}/invitations/{inv['id']}")).status_code == 204
    assert (await owner.get(f"{base}/invitations")).json() == []
    invitee = await signup("hr", email="r2@example.com")
    r = await invitee.post(f"/api/v1/invitations/{token}/accept")
    assert r.status_code == 410


async def test_last_owner_cannot_be_removed(signup: SignUp) -> None:
    owner = await signup("hr")
    company = await _company(owner)
    me = (await owner.get("/api/v1/auth/me")).json()
    r = await owner.delete(f"/api/v1/companies/{company['id']}/members/{me['id']}")
    assert r.status_code == 409 and r.json()["error"]["code"] == "last_owner"


async def test_logo_upload_and_public_download(signup: SignUp, client: AsyncClient) -> None:
    hr = await signup("hr")
    company = await _company(hr)
    r = await hr.post(
        f"/api/v1/companies/{company['id']}/logo", files={"file": ("logo.png", PNG, "image/png")}
    )
    assert r.status_code == 200
    url = r.json()["logo_url"]
    assert url.startswith(f"/api/v1/companies/{company['id']}/logo")
    img = await client.get(url)
    assert img.status_code == 200 and img.content == PNG
    assert img.headers["content-type"] == "image/png"

    svg = await hr.post(
        f"/api/v1/companies/{company['id']}/logo",
        files={"file": ("x.svg", b"<svg onload=alert(1)>", "image/svg+xml")},
    )
    assert svg.status_code == 400
