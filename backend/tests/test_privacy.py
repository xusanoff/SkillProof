"""Retention, data export, account deletion, company analytics (Phase 10)."""

import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

from httpx import AsyncClient
from sqlalchemy import func, select

from app.core.db import SessionLocal
from app.models import (
    Application,
    AuditLog,
    CompanyMember,
    EditorEvent,
    InterviewSession,
    InterviewTurn,
    User,
)
from app.models.enums import (
    ApplicationStatus,
    EvaluationState,
    InterviewStage,
    MemberRole,
    SessionStatus,
)
from app.services.privacy import purge_expired
from app.services.storage import LocalStorage
from tests.conftest import SignUp
from tests.test_job_board import _company, _publish

PASSWORD = "correct-horse-1"


async def _apply(signup: SignUp) -> tuple[AsyncClient, AsyncClient, str, uuid.UUID]:
    hr = await signup("hr")
    cand = await signup("candidate")
    cid = await _company(hr, f"Acme {uuid.uuid4().hex[:6]}")
    v = await _publish(hr, cid)
    r = await cand.post(f"/api/v1/vacancies/{v['id']}/apply", json={"cover_note": "Salom"})
    assert r.status_code in (200, 201), r.text
    return hr, cand, cid, uuid.UUID(r.json()["id"])


async def _session_with_data(
    aid: uuid.UUID,
    storage: LocalStorage,
    *,
    stage: InterviewStage = InterviewStage.stage2,
    completed_days_ago: int = 200,
    score: float | None = 80.0,
    passed: bool | None = True,
    state: EvaluationState = EvaluationState.done,
) -> tuple[uuid.UUID, str]:
    now = datetime.now(UTC)
    key = await storage.save("interviews/test/answers", "webm", b"voice")
    async with SessionLocal() as db:
        s = InterviewSession(
            application_id=aid,
            stage=stage,
            status=SessionStatus.completed,
            started_at=now - timedelta(days=completed_days_ago, minutes=30),
            completed_at=now - timedelta(days=completed_days_ago),
            evaluation_state=state,
            score_percent=score,
            passed=passed,
        )
        db.add(s)
        await db.flush()
        db.add(EditorEvent(session_id=s.id, seq=1, t_ms=1, type="insert", payload={}))
        db.add(
            InterviewTurn(
                session_id=s.id,
                order=1,
                shown_at=now,
                kind="bank",
                question_text="Nima uchun?",
                answer_transcript="Chunki.",
                answer_audio_url=key,
            )
        )
        await db.commit()
        return s.id, key


async def test_retention_removes_recordings_and_telemetry_only(
    signup: SignUp, tmp_path: Path
) -> None:
    _, _, _, aid = await _apply(signup)
    storage = LocalStorage(str(tmp_path))
    sid, key = await _session_with_data(aid, storage)

    async with SessionLocal() as db:
        assert await purge_expired(db, storage) == 1

    async with SessionLocal() as db:
        s = await db.get(InterviewSession, sid)
        assert s is not None and s.data_purged_at is not None
        assert s.score_percent == 80.0  # the hiring record stays
        events = await db.scalar(select(func.count()).select_from(EditorEvent))
        assert events == 0
        turn = await db.scalar(select(InterviewTurn).where(InterviewTurn.session_id == sid))
        assert turn is not None
        assert turn.answer_audio_url is None
        assert turn.answer_transcript == "Chunki."
    assert not (tmp_path / key).exists()

    async with SessionLocal() as db:
        assert await purge_expired(db, storage) == 0  # nothing twice


async def test_retention_leaves_recent_and_unevaluated_sessions(
    signup: SignUp, tmp_path: Path
) -> None:
    storage = LocalStorage(str(tmp_path))
    _, _, _, recent = await _apply(signup)
    await _session_with_data(recent, storage, completed_days_ago=10)
    _, _, _, pending = await _apply(signup)
    await _session_with_data(pending, storage, state=EvaluationState.pending)

    async with SessionLocal() as db:
        assert await purge_expired(db, storage) == 0
        assert await db.scalar(select(func.count()).select_from(EditorEvent)) == 2


async def test_export_holds_the_persons_data_and_not_the_private_parts(
    signup: SignUp, tmp_path: Path
) -> None:
    _, cand, _, aid = await _apply(signup)
    await _session_with_data(aid, LocalStorage(str(tmp_path)))

    r = await cand.get("/api/v1/auth/me/export")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["account"]["email"].startswith("candidate-")
    assert data["applications"][0]["cover_note"] == "Salom"
    assert data["applications"][0]["answers"][0]["answer"] == "Chunki."
    text = r.text.lower()
    for private in ("password", "suspicion", "integrity", "signal"):
        assert private not in text


async def test_export_covers_only_the_callers_data(signup: SignUp) -> None:
    await _apply(signup)
    other = await signup("candidate")
    assert (await other.get("/api/v1/auth/me/export")).json()["applications"] == []


async def test_export_needs_a_session_and_is_rate_limited(
    signup: SignUp, client: AsyncClient
) -> None:
    assert (await client.get("/api/v1/auth/me/export")).status_code == 401
    cand = await signup("candidate")
    codes = [(await cand.get("/api/v1/auth/me/export")).status_code for _ in range(4)]
    assert codes == [200, 200, 200, 429]


async def test_deleting_an_account_removes_the_person_and_their_files(
    signup: SignUp, tmp_path: Path, app: object
) -> None:
    _, cand, _, aid = await _apply(signup)
    me = (await cand.get("/api/v1/auth/me")).json()["id"]
    # The app's storage override roots at the same tmp_path fixture.
    storage = LocalStorage(str(tmp_path))
    _, key = await _session_with_data(aid, storage)

    r = await cand.post("/api/v1/auth/me/delete", json={"password": "wrong-password"})
    assert r.status_code == 403
    async with SessionLocal() as db:
        assert await db.get(User, uuid.UUID(me)) is not None

    r = await cand.post("/api/v1/auth/me/delete", json={"password": PASSWORD})
    assert r.status_code == 204, r.text

    async with SessionLocal() as db:
        assert await db.get(User, uuid.UUID(me)) is None
        assert await db.get(Application, aid) is None
        logged = await db.scalar(select(AuditLog).where(AuditLog.action == "user.delete"))
        assert logged is not None and logged.entity_id == me
    assert not (tmp_path / key).exists()
    assert (await cand.get("/api/v1/auth/me")).status_code == 401


async def test_a_sole_owner_must_hand_the_company_over_first(signup: SignUp) -> None:
    hr = await signup("hr")
    await _company(hr, f"Acme {uuid.uuid4().hex[:6]}")
    r = await hr.post("/api/v1/auth/me/delete", json={"password": PASSWORD})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "sole_company_owner"


async def test_analytics_counts_the_funnel(signup: SignUp, tmp_path: Path) -> None:
    storage = LocalStorage(str(tmp_path))
    hr = await signup("hr")
    cid = await _company(hr, f"Acme {uuid.uuid4().hex[:6]}")
    v = await _publish(hr, cid)
    aids = []
    for _ in range(3):
        cand = await signup("candidate")
        r = await cand.post(f"/api/v1/vacancies/{v['id']}/apply", json={})
        aids.append(r.json()["id"])

    await _session_with_data(
        uuid.UUID(aids[0]), storage, stage=InterviewStage.stage1, score=90, passed=True
    )
    await _session_with_data(
        uuid.UUID(aids[1]), storage, stage=InterviewStage.stage1, score=50, passed=False
    )
    r = await hr.patch(
        f"/api/v1/companies/{cid}/applications/{aids[0]}", json={"status": "shortlisted"}
    )
    assert r.status_code == 200, r.text

    r = await hr.get(f"/api/v1/companies/{cid}/analytics")
    assert r.status_code == 200, r.text
    data = r.json()
    total = data["total"]
    assert total["applied"] == 3
    assert total["stage1_started"] == 2
    assert total["stage1_passed"] == 1
    assert total["stage1_pass_rate"] == 50.0
    assert total["avg_stage1_score"] == 70.0
    assert total["stage2_pass_rate"] is None
    assert total["shortlisted"] == 1
    assert data["median_hours_to_shortlist"] is not None
    assert data["vacancies"][0]["title"] == v["title"]


async def test_analytics_is_for_the_companys_members(signup: SignUp) -> None:
    hr, cand, cid, _ = await _apply(signup)
    other = await signup("hr")
    assert (await other.get(f"/api/v1/companies/{cid}/analytics")).status_code == 404
    assert (await cand.get(f"/api/v1/companies/{cid}/analytics")).status_code in (403, 404)
    r = await hr.get(f"/api/v1/companies/{cid}/analytics", params={"vacancy_id": str(uuid.uuid4())})
    assert r.json()["total"]["applied"] == 0


async def test_analytics_leaves_out_withdrawn_applications(signup: SignUp) -> None:
    hr, _, cid, aid = await _apply(signup)
    async with SessionLocal() as db:
        row = await db.get(Application, aid)
        assert row is not None
        row.status = ApplicationStatus.withdrawn
        await db.commit()
    data = (await hr.get(f"/api/v1/companies/{cid}/analytics")).json()
    assert data["total"]["applied"] == 0


async def test_an_owner_can_hand_over_and_then_leave(signup: SignUp) -> None:
    owner = await signup("hr")
    other = await signup("hr")
    outsider = await signup("hr")
    cid = await _company(owner, f"Acme {uuid.uuid4().hex[:6]}")
    other_id = (await other.get("/api/v1/auth/me")).json()["id"]
    outsider_id = (await outsider.get("/api/v1/auth/me")).json()["id"]
    async with SessionLocal() as db:
        db.add(
            CompanyMember(
                company_id=uuid.UUID(cid),
                user_id=uuid.UUID(other_id),
                member_role=MemberRole.hr,
            )
        )
        await db.commit()
    url = f"/api/v1/companies/{cid}/members/{other_id}/owner"

    assert (await other.post(url)).status_code == 403  # a plain member cannot promote themselves
    assert (await outsider.post(url)).status_code == 404
    missing = f"/api/v1/companies/{cid}/members/{outsider_id}/owner"
    assert (await owner.post(missing)).status_code == 404

    assert (await owner.post(url)).status_code == 204
    r = await owner.post("/api/v1/auth/me/delete", json={"password": PASSWORD})
    assert r.status_code == 204, r.text
    me = (await other.get("/api/v1/auth/me")).json()
    assert me["companies"][0]["member_role"] == "owner"
