from tests.conftest import SignUp

PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
PROFILE = {
    "headline": "Python dasturchi",
    "country": "uz",
    "city": "Toshkent",
    "experience_years": 3,
    "about": "FastAPI, PostgreSQL",
    "desired_salary_min": 12_000_000,
    "desired_salary_max": 18_000_000,
    "currency": "uzs",
    "open_to_work": True,
}


async def test_profile_defaults_then_update(signup: SignUp) -> None:
    c = await signup("candidate")
    r = await c.get("/api/v1/candidate/profile")
    assert r.status_code == 200
    assert r.json()["currency"] == "UZS" and r.json()["resume"] is None
    r = await c.put("/api/v1/candidate/profile", json=PROFILE)
    assert r.status_code == 200
    body = r.json()
    assert (body["country"], body["currency"], body["desired_salary_max"]) == (
        "UZ",
        "UZS",
        18_000_000,
    )


async def test_profile_validation(signup: SignUp) -> None:
    c = await signup("candidate")
    bad_range = {**PROFILE, "desired_salary_min": 20, "desired_salary_max": 10}
    assert (await c.put("/api/v1/candidate/profile", json=bad_range)).status_code == 422
    assert (
        await c.put("/api/v1/candidate/profile", json={**PROFILE, "country": "UZB"})
    ).status_code == 422
    assert (
        await c.put("/api/v1/candidate/profile", json={**PROFILE, "experience_years": 99})
    ).status_code == 422


async def test_hr_has_no_candidate_profile(signup: SignUp) -> None:
    hr = await signup("hr")
    r = await hr.get("/api/v1/candidate/profile")
    assert r.status_code == 403 and r.json()["error"]["code"] == "permission_denied"


async def test_resume_upload_download_delete(signup: SignUp) -> None:
    c = await signup("candidate")
    r = await c.post(
        "/api/v1/candidate/profile/resume",
        files={"file": ("CV Aziz.pdf", PDF, "application/pdf")},
    )
    assert r.status_code == 200, r.text
    resume = r.json()["resume"]
    assert resume["filename"] == "CV Aziz.pdf" and resume["size_bytes"] == len(PDF)
    assert resume["content_type"] == "application/pdf"

    d = await c.get("/api/v1/candidate/profile/resume")
    assert d.status_code == 200 and d.content == PDF
    assert "attachment" in d.headers["content-disposition"]

    assert (await c.delete("/api/v1/candidate/profile/resume")).status_code == 204
    assert (await c.get("/api/v1/candidate/profile/resume")).status_code == 404


async def test_resume_rejects_fake_type_and_large_files(signup: SignUp) -> None:
    c = await signup("candidate")
    fake = await c.post(
        "/api/v1/candidate/profile/resume",
        files={"file": ("cv.pdf", b"<html>not a pdf</html>", "application/pdf")},
    )
    assert fake.status_code == 400 and fake.json()["error"]["code"] == "unsupported_file_type"
    big = await c.post(
        "/api/v1/candidate/profile/resume",
        files={"file": ("cv.pdf", PDF + b"0" * (5 * 1024 * 1024), "application/pdf")},
    )
    assert big.status_code == 413 and big.json()["error"]["code"] == "file_too_large"


async def test_candidates_cannot_see_each_others_resume(signup: SignUp) -> None:
    a = await signup("candidate")
    b = await signup("candidate")
    await a.post(
        "/api/v1/candidate/profile/resume", files={"file": ("a.pdf", PDF, "application/pdf")}
    )
    assert (await b.get("/api/v1/candidate/profile/resume")).status_code == 404
