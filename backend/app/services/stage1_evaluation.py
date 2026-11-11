"""Everything that happens after Stage 1 ends (spec §6.1, §6.4, §7.2, §7.4): hidden tests, code
review, score, gate, integrity signals, suspicion. One transaction, so a retry starts clean."""

import logging
import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import budget
from app.ai.code_reviewer import ReviewOutcome, review_code
from app.ai.integrity.stage1 import Event, TaskInput, detect, suspicion
from app.ai.llm_client import LLMClient
from app.core.config import get_settings
from app.core.live_thresholds import current_thresholds
from app.core.thresholds import Thresholds
from app.models import (
    Application,
    Assessment,
    CodeSubmission,
    EditorEvent,
    Evaluation,
    IntegritySignal,
    InterviewSession,
    PracticalTask,
)
from app.models.enums import (
    ApplicationStatus,
    EvaluationState,
    EvaluationStatus,
    InterviewStage,
    SessionStatus,
    SignalSeverity,
)
from app.sandbox.client import Limits, Sandbox, run_tests
from app.services.assessments import effective_thresholds
from app.services.interview import sync_session
from app.services.verified_skills import blended

logger = logging.getLogger(__name__)

_SCORED = {SessionStatus.completed, SessionStatus.expired}
_ENDED = _SCORED | {SessionStatus.disqualified, SessionStatus.abandoned}


class SandboxDownError(Exception):
    """Hidden tests could not run. The job retries instead of failing the candidate."""


async def _thresholds(
    session: AsyncSession, s: InterviewSession, vacancy_id: uuid.UUID
) -> Thresholds:
    snapshot = s.config.get("thresholds")
    if snapshot:
        return Thresholds.model_validate(snapshot)
    assessment = await session.scalar(select(Assessment).where(Assessment.vacancy_id == vacancy_id))
    return effective_thresholds(assessment) if assessment else current_thresholds()


def _unchanged(sub: CodeSubmission, task: PracticalTask) -> bool:
    code = sub.final_code.strip()
    return not code or code == task.starter_code.get(sub.language, "").strip()


async def _score_task(
    session: AsyncSession,
    s: InterviewSession,
    sub: CodeSubmission,
    task: PracticalTask,
    language: str,
    t: Thresholds,
    llm: LLMClient,
    sandbox: Sandbox,
) -> tuple[float, float | None, ReviewOutcome | None]:
    limits = Limits(task.cpu_time_limit_s, task.memory_limit_mb)
    outcomes = await run_tests(sandbox, sub.language, sub.final_code, task.hidden_tests, limits)
    if any(o.status == "unavailable" for o in outcomes):
        raise SandboxDownError
    sub.hidden_test_results = [
        {"name": o.name, "passed": o.passed, "status": o.status, "time_ms": o.time_ms}
        for o in outcomes
    ]
    hidden = 100 * sum(o.passed for o in outcomes) / len(outcomes) if outcomes else 0.0
    if _unchanged(sub, task):
        # Nothing was written: deterministic zero, no LLM call (§6.6).
        session.add(
            Evaluation(
                session_id=s.id,
                submission_id=sub.id,
                score=0.0,
                max_score=100.0,
                rationale="",
                status=EvaluationStatus.ok,
            )
        )
        return hidden, 0.0, None
    review = await review_code(
        llm,
        title=task.title,
        statement=task.statement,
        rubric=task.rubric,
        code=sub.final_code,
        test_results=[
            {"name": f"hidden {i + 1}", "passed": o.passed, "status": o.status}
            for i, o in enumerate(outcomes)
        ],
        language=language,
        min_confidence=t.evaluation.min_confidence,
        max_disagreement=t.evaluation.max_disagreement,
    )
    limits_by_key = {c["key"]: c["max_points"] for c in task.rubric.get("criteria", [])}
    output = review.review
    session.add(
        Evaluation(
            session_id=s.id,
            submission_id=sub.id,
            score=review.percent,
            max_score=100.0,
            criteria_scores=[
                {
                    "key": c.key,
                    "score": c.score,
                    "max_score": limits_by_key.get(c.key, 0),
                    "rationale": c.rationale,
                    "lines": c.lines,
                }
                for c in output.criteria
            ]
            if output
            else [],
            findings=[f.model_dump() for f in output.findings] if output else [],
            rationale=output.rationale if output else "",
            strengths=[p.model_dump() for p in output.strengths] if output else [],
            weaknesses=[p.model_dump() for p in output.weaknesses] if output else [],
            confidence=output.confidence if output else None,
            model=review.model,
            prompt_version=review.prompt_version,
            status=EvaluationStatus.needs_review if review.needs_review else EvaluationStatus.ok,
        )
    )
    return hidden, review.percent, review


async def _load_tasks(
    session: AsyncSession, s: InterviewSession
) -> list[tuple[CodeSubmission, PracticalTask]]:
    subs = await session.scalars(select(CodeSubmission).where(CodeSubmission.session_id == s.id))
    by_task = {str(sub.task_id): sub for sub in subs}
    rows = await session.scalars(
        select(PracticalTask).where(PracticalTask.id.in_([uuid.UUID(i) for i in by_task]))
    )
    tasks = {str(t.id): t for t in rows}
    return [
        (by_task[entry["id"]], tasks[entry["id"]])
        for entry in s.config["tasks"]
        if entry["id"] in by_task
    ]


async def _score(
    session: AsyncSession,
    s: InterviewSession,
    app: Application,
    language: str,
    t: Thresholds,
    llm: LLMClient,
    sandbox: Sandbox,
) -> None:
    with budget.scope(app.id, t.budget):
        hidden_scores: list[float] = []
        reviews: list[float | None] = []
        # Tasks the candidate never reached count as zero: the score is out of all of them.
        total = len(s.config["tasks"])
        for sub, task in await _load_tasks(session, s):
            hidden, percent, review = await _score_task(
                session, s, sub, task, language, t, llm, sandbox
            )
            hidden_scores.append(hidden)
            reviews.append(percent)
            if review is None:
                continue
            s.needs_review = s.needs_review or review.needs_review
            if review.injection_lines or review.injection_flagged:
                session.add(
                    IntegritySignal(
                        session_id=s.id,
                        stage=s.stage,
                        type="evaluator_injection_attempt",
                        severity=SignalSeverity.high,
                        evidence={"task_id": str(task.id), "lines": review.injection_lines},
                    )
                )
        s.hidden_tests_percent = round(sum(hidden_scores) / total, 1) if total else 0.0
        weight_h = t.stage1.hidden_tests_weight
        weight_r = t.stage1.code_review_weight
        if any(r is None for r in reviews):
            # The LLM gave no usable score. That must not fail anyone (the only automatic fails are
            # §7.1 and §7.1b), so the hidden tests decide for now and HR is told (D-087).
            s.code_review_percent = None
            s.score_percent = s.hidden_tests_percent
            s.needs_review = True
        else:
            s.code_review_percent = round(sum(r or 0 for r in reviews) / total, 1) if total else 0.0
            s.score_percent = round(
                (weight_h * s.hidden_tests_percent + weight_r * s.code_review_percent) / 100, 1
            )
        s.score_percent = blended(s.score_percent, total, s.config.get("reused")) or 0.0
        s.passed = s.score_percent >= t.stage1.pass_threshold
        app.status = (
            ApplicationStatus.stage2_pending if s.passed else ApplicationStatus.stage1_failed
        )


async def _signals(
    session: AsyncSession, s: InterviewSession, app: Application, t: Thresholds
) -> None:
    rows = await session.scalars(
        select(EditorEvent)
        .where(EditorEvent.session_id == s.id)
        .order_by(EditorEvent.t_ms, EditorEvent.id)
    )
    events = list(rows)
    assert s.started_at is not None and s.completed_at is not None
    end_ms = int((s.completed_at - s.started_at).total_seconds() * 1000)
    for sub, task in await _load_tasks(session, s):
        start = int((sub.shown_at - s.started_at).total_seconds() * 1000)
        task_end = (
            int((sub.submitted_at - s.started_at).total_seconds() * 1000)
            if sub.submitted_at
            else end_ms
        )
        task_events = [Event(e.t_ms, e.type, e.payload) for e in events if e.task_id == task.id]
        hidden = sub.hidden_test_results or []
        found = detect(
            TaskInput(
                str(task.id),
                start,
                task_end,
                task_events,
                sub.final_code,
                task.starter_code.get(sub.language, ""),
                bool(hidden) and all(r.get("passed") for r in hidden),
            ),
            t.integrity,
        )
        for signal in found:
            session.add(
                IntegritySignal(
                    session_id=s.id,
                    stage=s.stage,
                    type=signal.type,
                    severity=signal.severity,
                    evidence={**signal.evidence, "at_ms": signal.at_ms},
                )
            )
    await session.flush()
    stored = await session.scalars(
        select(IntegritySignal).where(IntegritySignal.session_id == s.id)
    )
    percent, label = suspicion([(x.type, x.severity) for x in stored], t.integrity)
    s.suspicion_score = float(percent)
    app.suspicion_percent, app.suspicion_label = percent, label


async def evaluate_session(
    session: AsyncSession, session_id: uuid.UUID, llm: LLMClient, sandbox: Sandbox
) -> None:
    # An advisory lock, not a row lock: the sandbox and the LLM take a while, and the candidate's
    # polling reads this row meanwhile.
    locked = await session.scalar(
        select(func.pg_try_advisory_xact_lock(func.hashtextextended(str(session_id), 0)))
    )
    s = await session.get(InterviewSession, session_id) if locked else None
    if s is None or s.evaluation_state is not EvaluationState.pending or s.status not in _ENDED:
        return
    app = await session.get(Application, s.application_id)
    assert app is not None
    assessment = await session.scalar(
        select(Assessment).where(Assessment.vacancy_id == app.vacancy_id)
    )
    language = assessment.language if assessment else "en"
    thresholds = await _thresholds(session, s, app.vacancy_id)
    try:
        if s.status in _SCORED:
            await _score(session, s, app, language, thresholds, llm, sandbox)
        await _signals(session, s, app, thresholds)
        s.evaluation_state = EvaluationState.done
        await session.commit()
    except SandboxDownError:
        await session.rollback()
        await _note_failure(session, session_id, "sandbox_unavailable")
    except Exception:
        logger.exception("stage1_evaluation_error: %s", session_id)
        await session.rollback()
        await _note_failure(session, session_id, "error")


async def _note_failure(session: AsyncSession, session_id: uuid.UUID, reason: str) -> None:
    """Stays `pending` and is picked up again by the sweep, up to the limit. After that a person
    has to look: `failed` is visible to HR and changes nothing for the candidate's status."""
    s = await session.get(InterviewSession, session_id)
    assert s is not None
    s.evaluation_attempts += 1
    if s.evaluation_attempts >= get_settings().evaluation_max_attempts:
        s.evaluation_state = EvaluationState.failed
        s.needs_review = True
        logger.error("stage1_evaluation_failed: %s %s", session_id, reason)
    await session.commit()


async def sessions_to_process(session: AsyncSession) -> list[uuid.UUID]:
    """The sweep: closes sessions whose browser is gone (limits still apply), returns those due
    for evaluation. Runs on a schedule, so every way a stage can end is covered by one path."""
    running = await session.scalars(
        select(InterviewSession)
        .where(
            InterviewSession.stage == InterviewStage.stage1,
            InterviewSession.status == SessionStatus.in_progress,
            or_(
                InterviewSession.disconnected_at.is_not(None),
                InterviewSession.expires_at <= func.now(),
            ),
        )
        .limit(get_settings().evaluation_sweep_batch)
        .with_for_update(skip_locked=True)
    )
    for s in running:
        await sync_session(session, s)
    await session.commit()
    due = await session.scalars(
        select(InterviewSession.id)
        .where(
            InterviewSession.stage == InterviewStage.stage1,
            InterviewSession.evaluation_state == EvaluationState.pending,
            InterviewSession.status.in_(_ENDED),
        )
        .limit(get_settings().evaluation_sweep_batch)
    )
    return list(due)
