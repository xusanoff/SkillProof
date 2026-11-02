"""What HR sees of Stage 1: scores, signals and the replay (spec §8). Read only."""

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.models import (
    Application,
    CodeSubmission,
    EditorEvent,
    Evaluation,
    IntegritySignal,
    InterviewSession,
    PracticalTask,
    User,
)
from app.models.enums import InterviewStage, SignalSeverity
from app.schemas.interview import (
    CriterionScore,
    HrStage1Report,
    HrTaskReport,
    HrTestResult,
    ReplayEvent,
    ReplayOut,
    ReviewOut,
    SignalOut,
    SuspicionReason,
)
from app.services import audit
from app.services.applications import _company_application

_RANK = {
    SignalSeverity.disqualifying: 0,
    SignalSeverity.high: 1,
    SignalSeverity.medium: 2,
    SignalSeverity.low: 3,
    SignalSeverity.info: 4,
}
_MAX_REASONS = 5


async def _session(
    session: AsyncSession, company_id: uuid.UUID, application_id: uuid.UUID, user: User
) -> tuple[Application, InterviewSession]:
    app, _ = await _company_application(session, company_id, application_id, user)
    s = await session.scalar(
        select(InterviewSession).where(
            InterviewSession.application_id == app.id,
            InterviewSession.stage == InterviewStage.stage1,
        )
    )
    if s is None:
        raise NotFoundError("This candidate has not started Stage 1")
    return app, s


def _tests(rows: list[dict[str, Any]] | None) -> list[HrTestResult]:
    return [
        HrTestResult(
            name=r["name"], passed=r["passed"], status=r["status"], time_ms=r.get("time_ms", 0)
        )
        for r in rows or []
    ]


def _review(ev: Evaluation | None) -> ReviewOut | None:
    if ev is None:
        return None
    return ReviewOut(
        status=ev.status,
        score_percent=ev.score,
        criteria=[CriterionScore(**c) for c in ev.criteria_scores],
        findings=ev.findings,
        strengths=ev.strengths,
        weaknesses=ev.weaknesses,
        rationale=ev.rationale,
        confidence=ev.confidence,
        model=ev.model,
        prompt_version=ev.prompt_version,
    )


async def report(
    session: AsyncSession, company_id: uuid.UUID, application_id: uuid.UUID, user: User
) -> HrStage1Report:
    app, s = await _session(session, company_id, application_id, user)
    signals = list(
        await session.scalars(
            select(IntegritySignal)
            .where(IntegritySignal.session_id == s.id)
            .order_by(IntegritySignal.created_at)
        )
    )
    rows = await session.execute(
        select(CodeSubmission, PracticalTask, Evaluation)
        .join(PracticalTask, PracticalTask.id == CodeSubmission.task_id)
        .outerjoin(Evaluation, Evaluation.submission_id == CodeSubmission.id)
        .where(CodeSubmission.session_id == s.id)
        .order_by(CodeSubmission.shown_at)
    )
    tasks = [
        HrTaskReport(
            id=task.id,
            title=task.title,
            language=sub.language,
            final_code=sub.final_code,
            run_count=sub.run_count,
            shown_at=sub.shown_at,
            submitted_at=sub.submitted_at,
            visible_results=_tests(sub.visible_test_results),
            hidden_results=_tests(sub.hidden_test_results),
            review=_review(ev),
        )
        for sub, task, ev in rows
    ]
    ranked = sorted(
        (x for x in signals if x.severity is not SignalSeverity.info),
        key=lambda x: _RANK[x.severity],
    )
    return HrStage1Report(
        application_id=app.id,
        session_id=s.id,
        status=s.status,
        disqualification_reason=s.disqualification_reason,
        evaluation_state=s.evaluation_state,
        started_at=s.started_at,
        completed_at=s.completed_at,
        score_percent=s.score_percent,
        hidden_tests_percent=s.hidden_tests_percent,
        code_review_percent=s.code_review_percent,
        pass_threshold=s.config.get("thresholds", {}).get("stage1", {}).get("pass_threshold"),
        passed=s.passed,
        needs_review=s.needs_review,
        suspicion_percent=app.suspicion_percent,
        suspicion_label=app.suspicion_label,
        reasons=[
            SuspicionReason(
                type=x.type, severity=x.severity, at_ms=x.evidence.get("at_ms"), evidence=x.evidence
            )
            for x in ranked[:_MAX_REASONS]
        ],
        signals=[
            SignalOut(
                id=x.id,
                type=x.type,
                severity=x.severity,
                evidence=x.evidence,
                created_at=x.created_at,
            )
            for x in signals
        ],
        tasks=tasks,
    )


async def replay(
    session: AsyncSession,
    company_id: uuid.UUID,
    application_id: uuid.UUID,
    task_id: uuid.UUID,
    user: User,
) -> ReplayOut:
    _, s = await _session(session, company_id, application_id, user)
    sub = await session.scalar(
        select(CodeSubmission).where(
            CodeSubmission.session_id == s.id, CodeSubmission.task_id == task_id
        )
    )
    task = await session.get(PracticalTask, task_id)
    if sub is None or task is None:
        raise NotFoundError("This task is not part of the session")
    rows = list(
        await session.scalars(
            select(EditorEvent).where(
                EditorEvent.session_id == s.id, EditorEvent.task_id == task_id
            )
        )
    )
    # Edits only make sense in the order they were made, which `seq` guarantees even where the
    # clock anchoring of two batches overlaps. Server events (`run`) are placed by time.
    client = sorted((e for e in rows if e.seq > 0), key=lambda e: e.seq)
    events: list[ReplayEvent] = []
    clock = 0
    for e in client:
        clock = max(clock, e.t_ms)
        events.append(ReplayEvent(seq=e.seq, t_ms=clock, type=e.type, payload=e.payload))
    events += [
        ReplayEvent(seq=e.seq, t_ms=e.t_ms, type=e.type, payload=e.payload)
        for e in rows
        if e.seq < 0
    ]
    events.sort(key=lambda e: e.t_ms)  # stable: client order holds within one instant
    assert s.started_at is not None
    start = int((sub.shown_at - s.started_at).total_seconds() * 1000)
    ended = sub.submitted_at or s.completed_at
    end = int((ended - s.started_at).total_seconds() * 1000) if ended else clock
    language = task.allowed_languages[0]
    audit.record(session, user.id, "interview.replay_view", "interview_session", s.id)
    await session.commit()
    return ReplayOut(
        task_id=task_id,
        language=language,
        initial_code=task.starter_code.get(language, ""),
        final_code=sub.final_code,
        start_ms=start,
        end_ms=max(end, clock),
        events=events,
    )
