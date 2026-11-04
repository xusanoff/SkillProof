import time
from typing import Any

from httpx import AsyncClient

from tests.conftest import SignUp

PDF = b"%PDF-1.4\n%%EOF\n"


async def _skill_ids(client: AsyncClient, *names: str) -> dict[str, str]:
    out = {}
    for n in names:
        rows = (await client.get("/api/v1/skills", params={"q": n})).json()
        out[n] = next(r["id"] for r in rows if r["name"] == n)
    return out


async def _company(hr: AsyncClient, name: str) -> str:
    r = await hr.post("/api/v1/companies", json={"name": name})
    assert r.status_code == 201
    return str(r.json()["id"])


def _vacancy(**over: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "title": "Python backend dasturchi",
        "description": "FastAPI va PostgreSQL bilan API yozish.",
        "requirements": "3 yil tajriba",
        "profession_area": "it",
        "region_code": "UZ-TK",
        "city": "Toshkent",
        "remote_type": "hybrid",
        "employment_type": "full_time",
        "experience_level": "between_3_6",
        "salary_min": 15_000_000,
        "salary_max": 22_000_000,
        "currency": "UZS",
        "skills": [],
    }
    body.update(over)
    return body


async def _publish(hr: AsyncClient, cid: str, **over: Any) -> dict[str, Any]:
    r = await hr.post(f"/api/v1/companies/{cid}/vacancies", json=_vacancy(**over))
    assert r.status_code == 201, r.text
    vid = r.json()["id"]
    r = await hr.patch(f"/api/v1/companies/{cid}/vacancies/{vid}", json={"status": "published"})
    assert r.status_code == 200, r.text
    return r.json()  # type: ignore[no-any-return]


async def test_catalog_endpoints(client: AsyncClient) -> None:
    regions = (await client.get("/api/v1/regions", params={"country": "uz"})).json()
    assert regions[0] == {
        "code": "UZ-TK",
        "country": "UZ",
        "names": {"uz": "Toshkent shahri", "ru": "Ташкент", "en": "Tashkent city"},
    }
    areas = (await client.get("/api/v1/profession-areas")).json()
    assert areas[0]["slug"] == "it"
    skills = (await client.get("/api/v1/skills", params={"q": "pyt"})).json()
    assert {s["slug"] for s in skills} >= {"python", "pytest"}


async def test_vacancy_lifecycle_and_visibility(signup: SignUp, client: AsyncClient) -> None:
    hr = await signup("hr")
    cid = await _company(hr, "Najot Tech")
    ids = await _skill_ids(client, "Python", "FastAPI")
    r = await hr.post(
        f"/api/v1/companies/{cid}/vacancies",
        json=_vacancy(
            skills=[
                {"skill_id": ids["Python"], "weight": 5, "is_required": True},
                {"skill_id": ids["FastAPI"], "weight": 4},
            ]
        ),
    )
    assert r.status_code == 201
    draft = r.json()
    assert draft["status"] == "draft" and draft["published_at"] is None
    assert [s["slug"] for s in draft["skills"]] == ["python", "fastapi"]
    vid = draft["id"]

    # Drafts are invisible to the public and to search.
    assert (await client.get(f"/api/v1/vacancies/{vid}")).status_code == 404
    assert (await client.get("/api/v1/vacancies")).json()["total"] == 0

    base = f"/api/v1/companies/{cid}/vacancies/{vid}"
    r = await hr.patch(base, json={"status": "closed"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "invalid_status_transition"
    published = (await hr.patch(base, json={"status": "published"})).json()
    assert published["status"] == "published" and published["published_at"]

    public = (await client.get(f"/api/v1/vacancies/{vid}")).json()
    assert public["applications_count"] is None and public["viewer"] is None
    assert public["company"]["name"] == "Najot Tech"

    assert (await hr.delete(base)).status_code == 409  # only drafts can be deleted
    assert (await hr.patch(base, json={"status": "closed"})).status_code == 200
    assert (await client.get("/api/v1/vacancies")).json()["total"] == 0
    assert (await client.get(f"/api/v1/vacancies/{vid}")).status_code == 200  # still readable


async def test_publish_requires_description(signup: SignUp) -> None:
    hr = await signup("hr")
    cid = await _company(hr, "Empty Co")
    vid = (
        await hr.post(f"/api/v1/companies/{cid}/vacancies", json=_vacancy(description=""))
    ).json()["id"]
    r = await hr.patch(f"/api/v1/companies/{cid}/vacancies/{vid}", json={"status": "published"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "description_required"


async def test_vacancy_input_validation(signup: SignUp) -> None:
    hr = await signup("hr")
    cid = await _company(hr, "Strict Co")
    url = f"/api/v1/companies/{cid}/vacancies"
    assert (await hr.post(url, json=_vacancy(salary_min=10, salary_max=5))).status_code == 422
    assert (await hr.post(url, json=_vacancy(region_code="XX-00"))).status_code == 422
    assert (await hr.post(url, json=_vacancy(profession_area="astronaut"))).status_code == 422
    unknown = "00000000-0000-0000-0000-000000000000"
    assert (await hr.post(url, json=_vacancy(skills=[{"skill_id": unknown}]))).status_code == 422
    assert (await hr.post(url, json=_vacancy(remote_type="moon"))).status_code == 422


async def test_partial_update_keeps_other_fields(signup: SignUp, client: AsyncClient) -> None:
    hr = await signup("hr")
    cid = await _company(hr, "Patch Co")
    v = await _publish(hr, cid)
    r = await hr.patch(
        f"/api/v1/companies/{cid}/vacancies/{v['id']}", json={"salary_max": 30_000_000}
    )
    assert r.status_code == 200
    body = r.json()
    assert (body["salary_min"], body["salary_max"], body["title"]) == (
        15_000_000,
        30_000_000,
        "Python backend dasturchi",
    )
    bad = await hr.patch(
        f"/api/v1/companies/{cid}/vacancies/{v['id']}", json={"salary_min": 99_000_000}
    )
    assert bad.status_code == 422


async def test_search_filters_facets_and_sort(signup: SignUp, client: AsyncClient) -> None:
    hr = await signup("hr")
    cid = await _company(hr, "Lazurit Soft")
    other = await _company(hr, "Data Lab")
    ids = await _skill_ids(client, "React", "Python")
    await _publish(
        hr,
        cid,
        title="Frontend dasturchi (React)",
        remote_type="remote",
        region_code="UZ-SA",
        salary_min=None,
        salary_max=12_000_000,
        experience_level="between_1_3",
        skills=[{"skill_id": ids["React"], "is_required": True}],
    )
    await _publish(
        hr,
        cid,
        title="Backend dasturchi",
        remote_type="office",
        salary_min=20_000_000,
        salary_max=30_000_000,
    )
    await _publish(
        hr,
        other,
        title="Ma'lumotlar tahlilchisi",
        remote_type="remote",
        employment_type="part_time",
        salary_min=None,
        salary_max=None,
        experience_level="no_experience",
        skills=[{"skill_id": ids["Python"]}],
    )

    page = (await client.get("/api/v1/vacancies")).json()
    assert page["total"] == 3 and page["page_size"] == 20
    facets = {f["value"]: f["count"] for f in page["facets"]["remote_type"]}
    assert facets == {"remote": 2, "office": 1}

    r = (await client.get("/api/v1/vacancies", params={"remote_type": "remote"})).json()
    assert r["total"] == 2
    # A facet's own filter is ignored for its counts; other facets are narrowed.
    assert {f["value"]: f["count"] for f in r["facets"]["remote_type"]} == {
        "remote": 2,
        "office": 1,
    }
    assert {f["value"] for f in r["facets"]["region"]} == {"UZ-SA", "UZ-TK"}

    multi = await client.get("/api/v1/vacancies", params=[("region", "UZ-SA"), ("region", "UZ-TK")])
    assert multi.json()["total"] == 3

    by_skill = (await client.get("/api/v1/vacancies", params={"q": "react"})).json()
    assert [v["title"] for v in by_skill["items"]] == ["Frontend dasturchi (React)"]
    by_skill_name = (await client.get("/api/v1/vacancies", params={"q": "python"})).json()
    assert [v["title"] for v in by_skill_name["items"]] == ["Ma'lumotlar tahlilchisi"]
    by_prefix = (await client.get("/api/v1/vacancies", params={"q": "dastur"})).json()
    assert by_prefix["total"] == 2
    by_company = (await client.get("/api/v1/vacancies", params={"q": "data lab"})).json()
    assert by_company["total"] == 1
    hostile = await client.get("/api/v1/vacancies", params={"q": "a & | ! :* ' ( )"})
    assert hostile.status_code == 200

    with_salary = (await client.get("/api/v1/vacancies", params={"only_with_salary": True})).json()
    assert with_salary["total"] == 2
    salary_from = (await client.get("/api/v1/vacancies", params={"salary_from": 15_000_000})).json()
    assert [v["title"] for v in salary_from["items"]] == ["Backend dasturchi"]

    by_skill_filter = (await client.get("/api/v1/vacancies", params={"skill": "react"})).json()
    assert by_skill_filter["total"] == 1
    no_exp = (
        await client.get("/api/v1/vacancies", params={"experience_level": "no_experience"})
    ).json()
    assert no_exp["total"] == 1

    desc = (await client.get("/api/v1/vacancies", params={"sort": "salary_desc"})).json()
    assert [v["title"] for v in desc["items"]][:2] == [
        "Backend dasturchi",
        "Frontend dasturchi (React)",
    ]
    paged = (await client.get("/api/v1/vacancies", params={"page_size": 2, "page": 2})).json()
    assert len(paged["items"]) == 1 and paged["total"] == 3

    company_page = (await client.get("/api/v1/companies/by-slug/data-lab/vacancies")).json()
    assert company_page["total"] == 1 and company_page["facets"] is None


async def test_suggest(signup: SignUp, client: AsyncClient) -> None:
    hr = await signup("hr")
    cid = await _company(hr, "Python Group")
    await _publish(hr, cid, title="Python dasturchi")
    out = (await client.get("/api/v1/search/suggest", params={"q": "pyth"})).json()
    types = [(s["type"], s["text"]) for s in out]
    assert ("vacancy", "Python dasturchi") in types
    assert ("skill", "Python") in types
    assert ("company", "Python Group") in types
    assert (await client.get("/api/v1/search/suggest", params={"q": "p"})).json() == []
    assert (await client.get("/api/v1/search/suggest", params={"q": "%_"})).status_code == 200


async def test_apply_withdraw_reapply_and_viewer_state(signup: SignUp) -> None:
    hr = await signup("hr")
    cid = await _company(hr, "Apply Co")
    v = await _publish(hr, cid)
    cand = await signup("candidate")

    r = await cand.post(f"/api/v1/vacancies/{v['id']}/apply", json={"cover_note": "Salom!"})
    assert r.status_code == 201
    app = r.json()
    assert (
        app["status"] == "applied" and app["vacancy"]["viewer"]["application_status"] == "applied"
    )
    dup = await cand.post(f"/api/v1/vacancies/{v['id']}/apply", json={})
    assert dup.status_code == 409 and dup.json()["error"]["code"] == "already_applied"

    detail = (await cand.get(f"/api/v1/vacancies/{v['id']}")).json()
    assert detail["viewer"] == {"is_saved": False, "application_status": "applied"}

    w = await cand.post(f"/api/v1/candidate/applications/{app['id']}/withdraw")
    assert w.json()["status"] == "withdrawn"
    again = await cand.post(f"/api/v1/vacancies/{v['id']}/apply", json={})
    assert again.status_code == 201 and again.json()["id"] == app["id"]

    mine = (await cand.get("/api/v1/candidate/applications")).json()
    assert mine["total"] == 1 and mine["items"][0]["vacancy"]["title"] == v["title"]


async def test_hr_cannot_apply_and_closed_vacancy_rejects(signup: SignUp) -> None:
    hr = await signup("hr")
    cid = await _company(hr, "Closed Co")
    v = await _publish(hr, cid)
    assert (await hr.post(f"/api/v1/vacancies/{v['id']}/apply", json={})).status_code == 403
    await hr.patch(f"/api/v1/companies/{cid}/vacancies/{v['id']}", json={"status": "closed"})
    cand = await signup("candidate")
    r = await cand.post(f"/api/v1/vacancies/{v['id']}/apply", json={})
    assert r.status_code == 409 and r.json()["error"]["code"] == "vacancy_not_open"


async def test_saved_vacancies(signup: SignUp) -> None:
    hr = await signup("hr")
    cid = await _company(hr, "Saved Co")
    v = await _publish(hr, cid)
    cand = await signup("candidate")
    url = f"/api/v1/candidate/saved-vacancies/{v['id']}"
    assert (await cand.put(url)).status_code == 204
    assert (await cand.put(url)).status_code == 204  # idempotent
    saved = (await cand.get("/api/v1/candidate/saved-vacancies")).json()
    assert saved["total"] == 1 and saved["items"][0]["viewer"]["is_saved"] is True
    listing = (await cand.get("/api/v1/vacancies")).json()
    assert listing["items"][0]["viewer"]["is_saved"] is True
    assert (await cand.delete(url)).status_code == 204
    assert (await cand.get("/api/v1/candidate/saved-vacancies")).json()["total"] == 0


async def test_hr_applicants_flow_and_isolation(signup: SignUp) -> None:
    hr = await signup("hr")
    cid = await _company(hr, "Hiring Co")
    v = await _publish(hr, cid)
    cand = await signup("candidate")
    await cand.put(
        "/api/v1/candidate/profile", json={"headline": "Junior Python", "city": "Toshkent"}
    )
    await cand.post(
        "/api/v1/candidate/profile/resume", files={"file": ("cv.pdf", PDF, "application/pdf")}
    )
    await cand.post(f"/api/v1/vacancies/{v['id']}/apply", json={"cover_note": "Tayyorman"})

    listing = (await hr.get(f"/api/v1/companies/{cid}/vacancies")).json()
    assert listing["counts_by_status"] == {"draft": 0, "published": 1, "closed": 0, "archived": 0}
    assert listing["items"][0]["applications_count"] == 1
    assert listing["items"][0]["new_applications_count"] == 1

    apps = (
        await hr.get(f"/api/v1/companies/{cid}/applications", params={"vacancy_id": v["id"]})
    ).json()
    assert apps["total"] == 1
    item = apps["items"][0]
    assert item["candidate"]["headline"] == "Junior Python" and item["candidate"]["has_resume"]
    assert item["cover_note"] == "Tayyorman"
    # Opening the list marks applications as seen.
    listing = (await hr.get(f"/api/v1/companies/{cid}/vacancies")).json()
    assert listing["items"][0]["new_applications_count"] == 0

    base = f"/api/v1/companies/{cid}/applications/{item['id']}"
    r = await hr.patch(base, json={"status": "shortlisted"})
    assert r.status_code == 200 and r.json()["status"] == "shortlisted"
    assert (await hr.patch(base, json={"status": "evaluated"})).status_code == 422
    resume = await hr.get(f"{base}/resume")
    assert resume.status_code == 200 and resume.content == PDF

    # HR of another company sees nothing.
    other = await signup("hr")
    other_cid = await _company(other, "Other Co")
    assert (await other.get(f"/api/v1/companies/{cid}/applications")).status_code == 404
    assert (await other.get(f"{base}/resume")).status_code == 404
    assert (await other.patch(base, json={"status": "rejected"})).status_code == 404
    assert (await other.get(f"/api/v1/companies/{cid}/vacancies/{v['id']}")).status_code == 404
    cross = f"/api/v1/companies/{other_cid}/applications/{item['id']}"
    assert (await other.patch(cross, json={"status": "rejected"})).status_code == 404

    withdrawn = await cand.post(f"/api/v1/candidate/applications/{item['id']}/withdraw")
    assert withdrawn.json()["status"] == "withdrawn"
    assert (await hr.patch(base, json={"status": "rejected"})).status_code == 409
    assert (await hr.get(f"/api/v1/companies/{cid}/applications")).json()["total"] == 0


async def test_search_speed_smoke(signup: SignUp, client: AsyncClient) -> None:
    """Not the 10k benchmark (scripts/bench_search.py); guards against N+1 regressions."""
    hr = await signup("hr")
    cid = await _company(hr, "Speed Co")
    for i in range(25):
        await _publish(hr, cid, title=f"Dasturchi {i}")
    started = time.perf_counter()
    r = await client.get("/api/v1/vacancies", params={"q": "dasturchi", "remote_type": "hybrid"})
    assert r.status_code == 200 and r.json()["total"] == 25
    assert time.perf_counter() - started < 1.0
