"""Phase 8: verified skills, reuse on the next application, public badges, HR search."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import select, update

from app.core.db import SessionLocal
from app.core.thresholds import VerifiedSkillThresholds
from app.models import (
    Application,
    Assessment,
    AssessmentQuestion,
    CandidateProfile,
    InterviewSession,
    PracticalTask,
    Question,
    Skill,
    VerifiedSkill,
)
from app.models.enums import InterviewStage
from app.services import reports
from app.services import verified_skills as vs
from tests.conftest import SignUp
from tests.test_interview import _application_status, _setup
from tests.test_reports import _finalize, _url
from tests.test_stage1_evaluation import _evaluate, _submit
from tests.test_stage2 import LONG_ANSWER, _say, _start2


def test_levels_follow_the_thresholds() -> None:
    t = VerifiedSkillThresholds()
    assert [vs.level_for(x, t) for x in (60, 70, 85)] == ["basic", "intermediate", "advanced"]


def test_stage2_shrinks_with_what_is_covered() -> None:
    assert vs.stage2_size(8, 8, 8, 2) == 8  # nothing covered
    assert vs.stage2_size(8, 8, 4, 2) == 4
    assert vs.stage2_size(8, 8, 0, 0) == 0  # everything covered, no code to ask about
    assert vs.stage2_size(8, 8, 0, 2) == 2  # only questions about the code just written
    assert vs.stage2_size(8, 20, 19, 2) == 7  # a removed question always shortens it
    assert vs.stage2_size(1, 2, 1, 0) == 1  # something is left, so something is asked


def test_a_stage_score_counts_reused_and_measured_by_weight() -> None:
    assert vs.blended(80.0, 1, None) == 80.0
    assert vs.blended(None, 0, {"percent": 90, "weight": 2}) == 90.0
    assert vs.blended(60.0, 1, {"percent": 90, "weight": 1}) == 75.0


async def _skill(name: str | None = None) -> uuid.UUID:
    name = name or f"Skill {uuid.uuid4().hex[:8]}"
    async with SessionLocal() as db:
        row = Skill(name=name, slug=name.lower().replace(" ", "-"), category="it")
        db.add(row)
        await db.commit()
        return row.id


async def _vacancy_of(aid: str) -> uuid.UUID:
    async with SessionLocal() as db:
        app = await db.get(Application, uuid.UUID(aid))
        assert app is not None
        return app.vacancy_id


async def _assessment(aid: str) -> uuid.UUID:
    async with SessionLocal() as db:
        found = await db.scalar(
            select(Assessment.id).where(Assessment.vacancy_id == await _vacancy_of(aid))
        )
    assert found is not None
    return found


async def _bind(aid: str, skills: list[uuid.UUID]) -> None:
    """Spreads the assessment's tasks and questions evenly over the given skills."""
    async with SessionLocal() as db:
        a = await db.get(Assessment, await _assessment(aid))
        assert a is not None
        for i, task_id in enumerate(a.stage1_config["task_ids"]):
            await db.execute(
                update(PracticalTask)
                .where(PracticalTask.id == uuid.UUID(str(task_id)))
                .values(skill_id=skills[i % len(skills)])
            )
        ids = await db.scalars(
            select(AssessmentQuestion.question_id)
            .where(AssessmentQuestion.assessment_id == a.id)
            .order_by(AssessmentQuestion.order, AssessmentQuestion.question_id)
        )
        for i, question_id in enumerate(ids):
            await db.execute(
                update(Question)
                .where(Question.id == question_id)
                .values(skill_id=skills[i % len(skills)])
            )
        await db.commit()


async def _me(c: AsyncClient) -> uuid.UUID:
    return uuid.UUID((await c.get("/api/v1/auth/me")).json()["id"])


async def _grant(
    candidate: uuid.UUID,
    skill: uuid.UUID,
    score: float = 90.0,
    stage1: float | None = 90.0,
    stage2: float | None = 90.0,
    is_public: bool = False,
    days: int = 100,
) -> None:
    now = datetime.now(UTC)
    async with SessionLocal() as db:
        db.add(
            VerifiedSkill(
                candidate_id=candidate,
                skill_id=skill,
                score=score,
                stage1_score=stage1,
                stage2_score=stage2,
                level="advanced",
                verified_at=now - timedelta(days=1),
                valid_until=now + timedelta(days=days),
                is_public=is_public,
            )
        )
        await db.commit()


async def _rows(candidate: uuid.UUID) -> list[VerifiedSkill]:
    async with SessionLocal() as db:
        return list(
            await db.scalars(select(VerifiedSkill).where(VerifiedSkill.candidate_id == candidate))
        )


async def _begin(c: AsyncClient, aid: str, reuse: bool | None = True) -> dict[str, Any]:
    state = (await c.get(f"/api/v1/applications/{aid}/interview")).json()
    r = await c.post(
        f"/api/v1/applications/{aid}/interview/rules",
        json={"rules_version": state["rules_version"]},
    )
    assert r.status_code == 200, r.text
    r = await c.post(
        f"/api/v1/applications/{aid}/interview/stage1",
        **({} if reuse is None else {"json": {"reuse": reuse}}),
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _session(aid: str, stage: InterviewStage) -> InterviewSession:
    async with SessionLocal() as db:
        s = await db.scalar(
            select(InterviewSession).where(
                InterviewSession.application_id == uuid.UUID(aid), InterviewSession.stage == stage
            )
        )
    assert s is not None
    return s


async def test_a_second_application_reuses_the_first_result(signup: SignUp, app: FastAPI) -> None:
    skill = await _skill()
    first = await _setup(signup, app)
    await _bind(first["aid"], [skill])
    done = await _setup(signup, app)
    await _bind(done["aid"], [skill])
    done["cid"] = (await done["hr"].get("/api/v1/auth/me")).json()["companies"][0]["id"]
    candidate = first["c"]
    me = await _me(candidate)
    assert await _rows(me) == []
    sid = await _submit(first, await _begin(candidate, first["aid"], reuse=None))
    await _evaluate(sid)
    state = await _start2(first)
    while state["status"] == "in_progress":
        state = await _say(first, state, LONG_ANSWER)
    await _finalize(first["aid"])
    rows = await _rows(me)
    assert len(rows) == 1 and rows[0].skill_id == skill
    assert rows[0].is_public is False, "nothing is public until the candidate says so"
    assert rows[0].source_application_id == uuid.UUID(first["aid"])
    assert rows[0].stage1_score is not None and rows[0].stage2_score is not None
    source = rows[0]

    # Same skill, another company. Everything is covered, so nothing is left to take.
    second_vacancy = done["aid"]
    vid = await _vacancy_of(second_vacancy)
    applied = await candidate.post(f"/api/v1/vacancies/{vid}/apply", json={})
    assert applied.status_code == 201, applied.text
    aid = applied.json()["id"]
    offer = (await candidate.get(f"/api/v1/applications/{aid}/interview")).json()["reuse"]
    assert offer["tasks_skipped"] == offer["tasks_total"] == 1
    assert offer["questions_skipped"] == offer["questions_total"] == 8
    assert offer["skills"][0]["skill_id"] == str(skill)

    s1 = await _begin(candidate, aid)
    assert s1["status"] == "completed" and s1["tasks"] == []
    assert s1["result"]["passed"] is True and s1["result"]["tasks"] == []
    assert await _application_status(aid) == "stage2_pending"
    ctx = {"c": candidate, "aid": aid}
    s2 = await _start2(ctx)
    assert s2["status"] == "completed" and s2["current_turn"] is None

    async with SessionLocal() as db:
        assert uuid.UUID(aid) in await reports.due(db), "the worker picks it up by itself"
    provider = await _finalize(aid)
    assert provider.requests == [], "nothing was measured, so no model is asked"
    assert await _application_status(aid) == "evaluated"
    results = (await candidate.get(f"/api/v1/applications/{aid}/results")).json()
    assert results["state"] == "done"
    assert results["per_skill"][0]["reused"] is True
    assert results["stage1_score"] == source.stage1_score
    assert results["stage2_score"] == source.stage2_score

    hr_ctx = {"cid": done["cid"], "aid": aid}
    r = await done["hr"].get(_url(hr_ctx, "report"))
    assert r.status_code == 200, r.text
    report = r.json()
    assert {x["stage"] for x in report["reused_skills"]} == {"stage1", "stage2"}
    assert report["per_skill"][0]["reused"] == ["stage1", "stage2"]
    assert report["recommendation"] is not None
    # Which company it was measured at is the first company's business.
    assert "source_application_id" not in r.text and first["aid"] not in r.text

    # A reused result does not renew itself.
    after = await _rows(me)
    assert after[0].source_application_id == source.source_application_id
    assert after[0].valid_until == source.valid_until


async def test_only_the_missing_skill_is_taken_and_the_score_counts_both(
    signup: SignUp, app: FastAPI
) -> None:
    known, missing = await _skill(), await _skill()
    ctx = await _setup(signup, app, tasks=2)
    await _bind(ctx["aid"], [known, missing])
    await _grant(await _me(ctx["c"]), known, stage1=100.0, stage2=100.0, score=100.0)

    s1 = await _begin(ctx["c"], ctx["aid"])
    assert len(s1["tasks"]) == 1
    sid = await _submit({**ctx, "tasks": [s1["tasks"][0]["id"]]}, s1)
    await _evaluate(sid)
    row = await _session(ctx["aid"], InterviewStage.stage1)
    assert row.config["reused"]["weight"] == 1
    assert row.hidden_tests_percent is not None and row.score_percent is not None
    measured = (
        row.hidden_tests_percent
        if row.code_review_percent is None
        else (
            row.config["thresholds"]["stage1"]["hidden_tests_weight"] * row.hidden_tests_percent
            + row.config["thresholds"]["stage1"]["code_review_weight"] * row.code_review_percent
        )
        / 100
    )
    assert row.score_percent == round((round(measured, 1) + 100) / 2, 1)

    state = await _start2(ctx)
    plan = (await _session(ctx["aid"], InterviewStage.stage2)).config["plan"]
    assert len(plan["questions"]) == 4 and plan["question_count"] == 4
    assert all(q["skill"] == str(missing) for q in plan["questions"])
    assert str(known) not in plan["skill_weights"]
    assert state["question_count"] == 4


async def test_a_mandatory_question_is_asked_whatever_the_candidate_holds(
    signup: SignUp, app: FastAPI
) -> None:
    skill = await _skill()
    ctx = await _setup(signup, app)
    await _bind(ctx["aid"], [skill])
    assessment = await _assessment(ctx["aid"])
    async with SessionLocal() as db:
        one = await db.scalar(
            select(AssessmentQuestion.question_id)
            .where(AssessmentQuestion.assessment_id == assessment)
            .limit(1)
        )
        await db.execute(
            update(AssessmentQuestion)
            .where(AssessmentQuestion.question_id == one)
            .values(is_mandatory=True)
        )
        await db.commit()
    await _grant(await _me(ctx["c"]), skill)
    offer = (await ctx["c"].get(f"/api/v1/applications/{ctx['aid']}/interview")).json()["reuse"]
    assert offer["questions_skipped"] == 7
    await _begin(ctx["c"], ctx["aid"])
    state = await _start2(ctx)
    assert state["status"] == "in_progress"
    plan = (await _session(ctx["aid"], InterviewStage.stage2)).config["plan"]
    assert [q["id"] for q in plan["questions"]] == [str(one)]


async def test_nothing_is_skipped_without_the_candidates_choice(
    signup: SignUp, app: FastAPI
) -> None:
    skill = await _skill()
    ctx = await _setup(signup, app)
    await _bind(ctx["aid"], [skill])
    await _grant(await _me(ctx["c"]), skill)
    s1 = await _begin(ctx["c"], ctx["aid"], reuse=None)
    assert s1["status"] == "in_progress" and len(s1["tasks"]) == 1
    row = await _session(ctx["aid"], InterviewStage.stage1)
    assert row.config["reused"] is None and row.config["reuse_stage2"] == []


async def test_what_cannot_be_reused_is_not_offered(signup: SignUp, app: FastAPI) -> None:
    skill = await _skill()
    ctx = await _setup(signup, app)
    await _bind(ctx["aid"], [skill])
    me = await _me(ctx["c"])
    url = f"/api/v1/applications/{ctx['aid']}/interview"

    # Below this vacancy's own pass marks (70 and 60).
    await _grant(me, skill, score=50.0, stage1=50.0, stage2=50.0)
    assert (await ctx["c"].get(url)).json()["reuse"] is None

    async with SessionLocal() as db:
        await db.execute(
            update(VerifiedSkill)
            .where(VerifiedSkill.candidate_id == me)
            .values(score=90.0, stage1_score=90.0, stage2_score=None)
        )
        await db.commit()
    # Checked by coding only: no question can be skipped.
    offer = (await ctx["c"].get(url)).json()["reuse"]
    assert offer["tasks_skipped"] == 1 and offer["questions_skipped"] == 0

    async with SessionLocal() as db:
        await db.execute(
            update(VerifiedSkill)
            .where(VerifiedSkill.candidate_id == me)
            .values(valid_until=datetime.now(UTC) - timedelta(days=1))
        )
        await db.commit()
    assert (await ctx["c"].get(url)).json()["reuse"] is None, "expired"

    async with SessionLocal() as db:
        await db.execute(
            update(VerifiedSkill)
            .where(VerifiedSkill.candidate_id == me)
            .values(valid_until=datetime.now(UTC) + timedelta(days=9))
        )
        await db.execute(
            update(Assessment)
            .where(Assessment.id == await _assessment(ctx["aid"]))
            .values(allow_skill_reuse=False)
        )
        await db.commit()
    assert (await ctx["c"].get(url)).json()["reuse"] is None, "HR turned reuse off"
    # And asking for it anyway changes nothing.
    s1 = await _begin(ctx["c"], ctx["aid"], reuse=True)
    assert len(s1["tasks"]) == 1


async def _application(aid: str) -> Application:
    async with SessionLocal() as db:
        row = await db.get(Application, uuid.UUID(aid))
    assert row is not None
    return row


def _row(skill: uuid.UUID, percent: float) -> dict[str, Any]:
    return {
        "skill_id": str(skill),
        "percent": percent,
        "stage1_percent": percent,
        "stage2_percent": percent,
    }


def _passed(s: InterviewSession) -> InterviewSession:
    s.passed, s.needs_review = True, False
    return s


async def _record(app_row: Application, rows: list[dict[str, Any]], **kwargs: Any) -> None:
    stage1 = kwargs.pop("stage1", None) or _passed(
        InterviewSession(stage=InterviewStage.stage1, config={})
    )
    stage2 = kwargs.pop("stage2", None) or _passed(
        InterviewSession(stage=InterviewStage.stage2, config={})
    )
    stage2.completed_at = kwargs.pop("at", datetime.now(UTC))
    flags = {"disqualifying_signal": False, "lifted_disqualification": False, **kwargs}
    async with SessionLocal() as db:
        await vs.record(db, app_row, stage1, stage2, rows, **flags)
        await db.commit()


async def test_only_a_clean_machine_result_verifies_a_skill(signup: SignUp, app: FastAPI) -> None:
    skill = await _skill()
    ctx = await _setup(signup, app)
    row = await _application(ctx["aid"])
    me = row.candidate_id

    failed = InterviewSession(stage=InterviewStage.stage2, config={})
    failed.passed, failed.needs_review = False, False
    review = _passed(InterviewSession(stage=InterviewStage.stage2, config={}))
    review.needs_review = True
    await _record(row, [_row(skill, 90)], stage2=failed)
    await _record(row, [_row(skill, 90)], stage2=review)
    await _record(row, [_row(skill, 90)], disqualifying_signal=True)
    await _record(row, [_row(skill, 90)], lifted_disqualification=True)
    await _record(row, [_row(skill, 59)])
    row.suspicion_label = "high"
    await _record(row, [_row(skill, 90)])
    assert await _rows(me) == []

    row.suspicion_label = "low"
    await _record(row, [_row(skill, 90)])
    assert (await _rows(me))[0].level == "advanced"


async def test_the_better_valid_result_stands_until_it_expires(
    signup: SignUp, app: FastAPI
) -> None:
    skill = await _skill()
    ctx = await _setup(signup, app)
    row = await _application(ctx["aid"])
    me = row.candidate_id
    now = datetime.now(UTC)

    await _record(row, [_row(skill, 90)], at=now)
    await _record(row, [_row(skill, 70)], at=now + timedelta(days=30))
    kept = (await _rows(me))[0]
    assert kept.score == 90 and kept.verified_at == now

    async with SessionLocal() as db:
        await db.execute(
            update(VerifiedSkill).where(VerifiedSkill.candidate_id == me).values(is_public=True)
        )
        await db.commit()
    await _record(row, [_row(skill, 95)], at=now + timedelta(days=31))
    better = (await _rows(me))[0]
    assert better.score == 95 and better.is_public is True, "the candidate's choice survives"

    await _record(row, [_row(skill, 65)], at=now + timedelta(days=500))
    assert (await _rows(me))[0].score == 65, "expired: the new result replaces it"
    assert len(await _rows(me)) == 1


async def test_the_candidate_controls_what_is_public(signup: SignUp, app: FastAPI) -> None:
    skill = await _skill("Rust Public")
    candidate, other = await signup("candidate"), await signup("candidate")
    me = await _me(candidate)
    await _grant(me, skill)
    anonymous = f"/api/v1/profiles/{me}"
    assert (await candidate.get(anonymous)).status_code == 404, "nothing public, no page"

    own = (await candidate.get("/api/v1/candidate/verified-skills")).json()
    assert own[0]["is_valid"] is True and own[0]["is_public"] is False
    url = f"/api/v1/candidate/verified-skills/{own[0]['id']}"
    assert (await other.patch(url, json={"is_public": True})).status_code == 404
    r = await candidate.patch(url, json={"is_public": True})
    assert r.status_code == 200 and r.json()["is_public"] is True

    r = await other.get(anonymous)
    assert r.status_code == 200
    assert [s["name"] for s in r.json()["skills"]] == ["Rust Public"]
    assert "email" not in r.text and "source_application" not in r.text

    async with SessionLocal() as db:
        await db.execute(
            update(VerifiedSkill)
            .where(VerifiedSkill.candidate_id == me)
            .values(valid_until=datetime.now(UTC) - timedelta(days=1))
        )
        await db.commit()
    assert (await other.get(anonymous)).status_code == 404, "an expired badge is not shown"
    assert (await candidate.get("/api/v1/candidate/verified-skills")).json()[0]["is_valid"] is False


async def _open_to_work(candidate: uuid.UUID, value: bool) -> None:
    async with SessionLocal() as db:
        profile = await db.get(CandidateProfile, candidate)
        if profile is None:
            db.add(CandidateProfile(user_id=candidate, currency="UZS", open_to_work=value))
        else:
            profile.open_to_work = value
        await db.commit()


async def test_hr_finds_open_to_work_candidates_by_verified_skill(
    signup: SignUp, app: FastAPI
) -> None:
    python, sql = await _skill(), await _skill()
    hr = await signup("hr")
    cid = (await hr.post("/api/v1/companies", json={"name": f"Co {uuid.uuid4().hex[:6]}"})).json()[
        "id"
    ]
    strong, weak, hidden = await signup("candidate"), await signup("candidate"), await signup()
    strong_id, weak_id, hidden_id = await _me(strong), await _me(weak), await _me(hidden)
    for who in (strong_id, weak_id, hidden_id):
        await _open_to_work(who, True)
    await _grant(strong_id, python, score=92.0, is_public=True)
    await _grant(strong_id, sql, score=75.0, is_public=True)
    await _grant(weak_id, python, score=71.0, is_public=True)
    await _grant(hidden_id, python, score=99.0, is_public=False)
    no_profile_yet = await _me(await signup("candidate"))
    await _grant(no_profile_yet, python, score=80.0, is_public=True)
    url = f"/api/v1/companies/{cid}/talent"

    found = (await hr.get(url, params={"skill_id": str(python)})).json()
    assert [x["candidate_id"] for x in found["items"]] == [
        str(strong_id),
        str(no_profile_yet),
        str(weak_id),
    ], "best first, private results stay out, and a profile never opened counts as open to work"
    assert found["total"] == 3
    assert "email" not in str(found)

    found = (await hr.get(url, params={"skill_id": str(python), "min_score": 80})).json()
    assert [x["candidate_id"] for x in found["items"]] == [str(strong_id), str(no_profile_yet)]

    both = {"skill_id": [str(python), str(sql)]}
    found = (await hr.get(url, params=both)).json()
    assert [x["candidate_id"] for x in found["items"]] == [str(strong_id)], "every skill must match"

    await _open_to_work(strong_id, False)
    found = (await hr.get(url, params={"skill_id": str(python)})).json()
    assert [x["candidate_id"] for x in found["items"]] == [str(no_profile_yet), str(weak_id)]


async def test_only_the_companys_members_can_search(signup: SignUp, app: FastAPI) -> None:
    hr, outsider, candidate = await signup("hr"), await signup("hr"), await signup("candidate")
    cid = (await hr.post("/api/v1/companies", json={"name": f"Co {uuid.uuid4().hex[:6]}"})).json()[
        "id"
    ]
    url = f"/api/v1/companies/{cid}/talent"
    assert (await hr.get(url)).status_code == 200
    assert (await outsider.get(url)).status_code in (403, 404)
    assert (await candidate.get(url)).status_code in (403, 404)
