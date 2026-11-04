"""The end of an application (spec §6.4, §6.5): the final Stage 2 evaluation, the session report,
and what HR and the candidate read of it. One job does all of it, so every way a stage can end
takes the same path."""

import logging
import uuid
from typing import Any

from sqlalchemy import exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import interviewer
from app.ai.guardrails import score_mcq, scrub_answer
from app.ai.integrity.stage1 import suspicion
from app.ai.llm_client import LLMClient
from app.ai.report_writer import (
    band_for,
    clamp_recommendation,
    write_feedback,
    write_report,
)
from app.core.config import get_settings
from app.core.errors import AppError, NotFoundError
from app.core.live_thresholds import current_thresholds
from app.core.thresholds import Thresholds
from app.models import (
    Application,
    ApplicationNote,
    Assessment,
    CodeSubmission,
    Evaluation,
    HrOverride,
    IntegritySignal,
    InterviewSession,
    InterviewTurn,
    PracticalTask,
    Question,
    SessionReport,
    Skill,
    User,
    Vacancy,
    VacancySkill,
)
from app.models.enums import (
    ApplicationStatus,
    EvaluationState,
    EvaluationStatus,
    InterviewStage,
    SessionStatus,
    SignalSeverity,
)
from app.schemas.report import (
    CandidateAnswer,
    CandidateLearnItem,
    CandidateMistake,
    CandidateResults,
    CandidateSkill,
    ExplainedSignal,
    HrReport,
    HrStage2,
    HrTurn,
    NoteOut,
    OverrideIn,
    OverrideOut,
    ReportPoint,
    SkillScore,
    TimelineSignal,
    TurnCriterion,
)
from app.schemas.verified_skill import ReusedSkillOut
from app.services import audit, verified_skills
from app.services.applications import _company_application
from app.services.assessments import effective_thresholds
from app.services.interview import candidate_result
from app.services.storage import Storage

logger = logging.getLogger(__name__)

_ENDED = (
    SessionStatus.completed,
    SessionStatus.expired,
    SessionStatus.disqualified,
    SessionStatus.abandoned,
)
# Applications that stop before Stage 2 is scored still get a report: the candidate reads it.
_STOPPED = (
    ApplicationStatus.stage1_failed,
    ApplicationStatus.stage1_disqualified,
    ApplicationStatus.stage2_disqualified,
)
_RANK = {
    SignalSeverity.disqualifying: 0,
    SignalSeverity.high: 1,
    SignalSeverity.medium: 2,
    SignalSeverity.low: 3,
    SignalSeverity.info: 4,
}
_MAX_REASONS = 5
_SCORE_FIELDS = ("stage1_score", "stage2_score", "overall_score")


async def _sessions(
    session: AsyncSession, application_id: uuid.UUID
) -> dict[InterviewStage, InterviewSession]:
    rows = await session.scalars(
        select(InterviewSession).where(InterviewSession.application_id == application_id)
    )
    return {s.stage: s for s in rows}


async def _thresholds(
    session: AsyncSession, app: Application, sessions: dict[InterviewStage, InterviewSession]
) -> Thresholds:
    for stage in (InterviewStage.stage2, InterviewStage.stage1):
        s = sessions.get(stage)
        if s is not None and s.config.get("thresholds"):
            return Thresholds.model_validate(s.config["thresholds"])
    assessment = await session.scalar(
        select(Assessment).where(Assessment.vacancy_id == app.vacancy_id)
    )
    return effective_thresholds(assessment) if assessment else current_thresholds()


async def _turns(session: AsyncSession, s: InterviewSession) -> list[InterviewTurn]:
    rows = await session.scalars(
        select(InterviewTurn).where(InterviewTurn.session_id == s.id).order_by(InterviewTurn.order)
    )
    return list(rows)


# --- final Stage 2 evaluation --------------------------------------------------------------------
async def _turn_question(
    session: AsyncSession, turn: InterviewTurn, by_id: dict[uuid.UUID, InterviewTurn]
) -> Question | None:
    source = by_id.get(turn.parent_turn_id, turn) if turn.parent_turn_id else turn
    return await session.get(Question, source.question_id) if source.question_id else None


def _store_grade(
    session: AsyncSession,
    s: InterviewSession,
    turn: InterviewTurn,
    existing: Evaluation | None,
    outcome: interviewer.GradeOutcome,
) -> Evaluation:
    ev = existing or Evaluation(session_id=s.id, turn_id=turn.id)
    grade = outcome.grade
    ev.max_score = outcome.max_score
    ev.score = (
        round(outcome.percent * outcome.max_score / 100, 2) if outcome.percent is not None else None
    )
    ev.criteria_scores = [c.model_dump() for c in grade.criteria] if grade else []
    ev.rationale = grade.rationale if grade else ""
    ev.confidence = grade.confidence if grade else None
    ev.model = outcome.model
    ev.prompt_version = outcome.prompt_version
    ev.status = EvaluationStatus.needs_review if outcome.needs_review else EvaluationStatus.ok
    if existing is None:
        session.add(ev)
    if grade is not None and grade.injection_attempt:
        turn.flags = {**turn.flags, "injection_attempt": True}
    return ev


async def _evaluate_stage2(
    session: AsyncSession,
    s: InterviewSession,
    language: str,
    t: Thresholds,
    llm: LLMClient,
) -> None:
    """Every asked question ends with a score, or with `needs_review` when no score can be had.
    Questions the time limit cut off count for nothing: the session is scored on what was
    answered (§6.2), and a model failure never counts against the candidate (D-087)."""
    turns = await _turns(session, s)
    by_id = {x.id: x for x in turns}
    rows = await session.scalars(
        select(Evaluation).where(Evaluation.session_id == s.id, Evaluation.turn_id.is_not(None))
    )
    existing = {e.turn_id: e for e in rows}
    for turn in turns:
        if turn.answered_at is None:
            continue
        ev = existing.get(turn.id)
        question = await _turn_question(session, turn, by_id)
        if question is not None and question.type == "mcq" and question.options:
            percent = score_mcq(
                turn.answer_transcript or "", question.options, question.correct_answer or []
            )
            ev = ev or Evaluation(session_id=s.id, turn_id=turn.id)
            ev.score, ev.max_score, ev.confidence = percent, 100.0, 1.0
            ev.model, ev.prompt_version, ev.status = "", "deterministic", EvaluationStatus.ok
            session.add(ev)
            continue
        if turn.flags.get("stt_failed"):
            if ev is None:
                session.add(
                    Evaluation(
                        session_id=s.id,
                        turn_id=turn.id,
                        status=EvaluationStatus.needs_review,
                        prompt_version="deterministic",
                    )
                )
            continue
        # A live grade that was sure of itself stands (D-111).
        confident = (
            ev is not None
            and ev.score is not None
            and ev.status is EvaluationStatus.ok
            and (ev.confidence is None or ev.confidence >= t.evaluation.min_confidence)
        )
        if confident:
            continue
        rubric = question.rubric if question is not None else interviewer.OWN_CODE_RUBRIC
        first = (
            100 * ev.score / ev.max_score
            if ev is not None and ev.score is not None and ev.max_score
            else None
        )
        outcome = await interviewer.evaluate_answer(
            llm,
            language,
            question=turn.question_text,
            rubric=rubric or {},
            reference=question.reference_answer if question is not None else None,
            answer=turn.answer_transcript or "",
            first_percent=first,
            first_confidence=ev.confidence if ev is not None else None,
            min_confidence=t.evaluation.min_confidence,
            max_disagreement=t.evaluation.max_disagreement,
        )
        if outcome is None:
            # The question has no rubric: nothing to score it by, so a person looks.
            if ev is None:
                session.add(
                    Evaluation(
                        session_id=s.id,
                        turn_id=turn.id,
                        status=EvaluationStatus.needs_review,
                        prompt_version="deterministic",
                    )
                )
            continue
        _store_grade(session, s, turn, ev, outcome)
    await session.flush()
    scores = await _turn_percents(session, s, turns)
    s.needs_review = await _has_needs_review(session, s)
    if scores:
        s.score_percent = round(sum(scores.values()) / len(scores), 1)
    # Asked but unscorable stays with a person: reused results alone must not decide it.
    if scores or not turns:
        s.score_percent = verified_skills.blended(
            s.score_percent, len(scores), s.config.get("reused")
        )
    if s.status in (SessionStatus.completed, SessionStatus.expired):
        if s.score_percent is not None:
            s.passed = s.score_percent >= t.stage2.pass_threshold
        else:
            s.passed = None if s.needs_review else False
    s.evaluation_state = EvaluationState.done


async def _has_needs_review(session: AsyncSession, s: InterviewSession) -> bool:
    found = await session.scalar(
        select(Evaluation.id)
        .where(Evaluation.session_id == s.id, Evaluation.status == EvaluationStatus.needs_review)
        .limit(1)
    )
    return found is not None


async def _turn_percents(
    session: AsyncSession, s: InterviewSession, turns: list[InterviewTurn]
) -> dict[uuid.UUID, float]:
    rows = await session.scalars(
        select(Evaluation).where(Evaluation.session_id == s.id, Evaluation.turn_id.is_not(None))
    )
    by_turn = {e.turn_id: e for e in rows}
    last = turns[-1].id if turns else None
    out: dict[uuid.UUID, float] = {}
    for turn in turns:
        ev = by_turn.get(turn.id)
        if ev is None or ev.score is None or not ev.max_score:
            continue
        cut_off = (
            s.status is SessionStatus.expired
            and turn.id == last
            and not (turn.answer_transcript or "").strip()
        )
        if not cut_off:
            out[turn.id] = 100 * ev.score / ev.max_score
    return out


# --- what the writers and the report are built from ----------------------------------------------
async def _tasks(
    session: AsyncSession, s: InterviewSession | None, t: Thresholds
) -> list[dict[str, Any]]:
    if s is None:
        return []
    rows = await session.execute(
        select(CodeSubmission, PracticalTask, Evaluation)
        .join(PracticalTask, PracticalTask.id == CodeSubmission.task_id)
        .outerjoin(Evaluation, Evaluation.submission_id == CodeSubmission.id)
        .where(CodeSubmission.session_id == s.id)
        .order_by(CodeSubmission.shown_at)
    )
    out = []
    for number, (sub, task, ev) in enumerate(rows, 1):
        hidden = sub.hidden_test_results or []
        hidden_percent = (
            100 * sum(1 for r in hidden if r.get("passed")) / len(hidden) if hidden else 0.0
        )
        review = ev.score if ev is not None else None
        percent = (
            hidden_percent
            if review is None
            else (
                t.stage1.hidden_tests_weight * hidden_percent + t.stage1.code_review_weight * review
            )
            / 100
        )
        out.append(
            {
                "ref": f"task_{number}",
                "sub": sub,
                "task": task,
                "ev": ev,
                "percent": round(percent, 1),
                "scored": bool(hidden) or review is not None,
            }
        )
    return out


def _task_block(item: dict[str, Any]) -> dict[str, Any]:
    ev: Evaluation | None = item["ev"]
    hidden = item["sub"].hidden_test_results or []
    lines = sorted(
        {n for p in ((ev.weaknesses + ev.strengths) if ev else []) for n in p.get("lines", [])}
    )
    return {
        "ref": item["ref"],
        "kind": "task",
        "title": item["task"].title,
        "percent": item["percent"],
        "tests_passed": sum(1 for r in hidden if r.get("passed")),
        "tests_total": len(hidden),
        "criteria": ev.criteria_scores if ev else [],
        "findings": ev.findings if ev else [],
        "strengths": ev.strengths if ev else [],
        "weaknesses": ev.weaknesses if ev else [],
        "rationale": ev.rationale if ev else "",
        "lines": lines,
    }


def _turn_block(
    turn: InterviewTurn, ev: Evaluation | None, percent: float | None
) -> dict[str, Any]:
    criteria = ev.criteria_scores if ev else []
    quote = next((c["quote"] for c in criteria if c.get("quote")), "")
    return {
        "ref": f"turn_{turn.order}",
        "kind": "answer",
        "question": turn.question_text,
        "percent": percent,
        "criteria": criteria,
        "rationale": ev.rationale if ev else "",
        "quote": quote,
    }


def _excerpt(code: str, lines: list[int]) -> str:
    source = code.splitlines()
    return "\n".join(source[n - 1] for n in sorted(set(lines))[:8] if 1 <= n <= len(source))


def _weighted(a: float | None, b: float | None, weight_a: float, weight_b: float) -> float | None:
    if a is None and b is None:
        return None
    if a is None:
        return b
    if b is None:
        return a
    return round((weight_a * a + weight_b * b) / (weight_a + weight_b), 1)


async def _per_skill(
    session: AsyncSession,
    app: Application,
    tasks: list[dict[str, Any]],
    turns: list[InterviewTurn],
    percents: dict[uuid.UUID, float],
    t: Thresholds,
) -> list[dict[str, Any]]:
    first: dict[uuid.UUID, list[float]] = {}
    second: dict[uuid.UUID, list[float]] = {}
    task_skill: dict[str, uuid.UUID | None] = {}
    for item in tasks:
        task_skill[str(item["sub"].id)] = item["task"].skill_id
        if item["task"].skill_id is not None and item["scored"]:
            first.setdefault(item["task"].skill_id, []).append(item["percent"])
    by_id = {x.id: x for x in turns}
    for turn in turns:
        percent = percents.get(turn.id)
        if percent is None:
            continue
        skill_id = None
        question = await _turn_question(session, turn, by_id)
        if question is not None:
            skill_id = question.skill_id
        else:
            root = by_id.get(turn.parent_turn_id, turn) if turn.parent_turn_id else turn
            skill_id = task_skill.get(str((root.refers_to or {}).get("submission_id")))
        if skill_id is not None:
            second.setdefault(skill_id, []).append(percent)
    ids = set(first) | set(second)
    if not ids:
        return []
    names = dict(
        (await session.execute(select(Skill.id, Skill.name).where(Skill.id.in_(ids))))
        .tuples()
        .all()
    )
    weights = dict(
        (
            await session.execute(
                select(VacancySkill.skill_id, VacancySkill.weight).where(
                    VacancySkill.vacancy_id == app.vacancy_id
                )
            )
        )
        .tuples()
        .all()
    )
    out = []
    for skill_id in sorted(ids, key=lambda i: (-weights.get(i, 0), names.get(i, ""))):
        a = round(sum(first[skill_id]) / len(first[skill_id]), 1) if skill_id in first else None
        b = round(sum(second[skill_id]) / len(second[skill_id]), 1) if skill_id in second else None
        out.append(
            {
                "skill_id": str(skill_id),
                "name": names.get(skill_id, ""),
                "percent": _weighted(a, b, t.report.stage1_weight, t.report.stage2_weight),
                "stage1_percent": a,
                "stage2_percent": b,
            }
        )
    return out


def _with_reused(
    rows: list[dict[str, Any]], reused: list[dict[str, Any]], t: Thresholds
) -> list[dict[str, Any]]:
    """Adds what this application took from verified skills, marked as such."""
    out = {x["skill_id"]: {**x, "reused": []} for x in rows}
    for entry in reused:
        row = out.setdefault(
            entry["skill_id"],
            {
                "skill_id": entry["skill_id"],
                "name": entry["name"],
                "percent": None,
                "stage1_percent": None,
                "stage2_percent": None,
                "reused": [],
            },
        )
        row[f"{entry['stage']}_percent"] = entry["percent"]
        row["reused"].append(entry["stage"])
        row["percent"] = _weighted(
            row["stage1_percent"],
            row["stage2_percent"],
            t.report.stage1_weight,
            t.report.stage2_weight,
        )
    return list(out.values())


async def _all_signals(
    session: AsyncSession, sessions: dict[InterviewStage, InterviewSession]
) -> list[IntegritySignal]:
    if not sessions:
        return []
    rows = await session.scalars(
        select(IntegritySignal)
        .where(IntegritySignal.session_id.in_([s.id for s in sessions.values()]))
        .order_by(IntegritySignal.created_at)
    )
    return list(rows)


def _reasons(signals: list[IntegritySignal]) -> list[dict[str, Any]]:
    ranked = sorted(
        (x for x in signals if x.severity is not SignalSeverity.info),
        key=lambda x: _RANK[x.severity],
    )
    return [
        {
            "stage": x.stage.value,
            "type": x.type,
            "severity": x.severity.value,
            "at_ms": x.evidence.get("at_ms"),
            "evidence": x.evidence,
        }
        for x in ranked[:_MAX_REASONS]
    ]


def _recompute_overall(report: SessionReport, app: Application, t: Thresholds) -> None:
    """Overall exists once Stage 2 has a score; the stopped are not ranked (spec §8)."""
    if app.status in _STOPPED or report.stage2_score is None:
        report.overall_score = None
    else:
        report.overall_score = _weighted(
            report.stage1_score, report.stage2_score, t.report.stage1_weight, t.report.stage2_weight
        )


async def _latest_overrides(
    session: AsyncSession, application_id: uuid.UUID
) -> dict[str, HrOverride]:
    rows = await session.scalars(
        select(HrOverride)
        .where(HrOverride.application_id == application_id)
        .order_by(HrOverride.created_at)
    )
    return {o.field: o for o in rows}


def _apply_score_overrides(
    report: SessionReport, app: Application, latest: dict[str, HrOverride], t: Thresholds
) -> None:
    """HR's decisions outlive a rewritten report."""
    for field in ("stage1_score", "stage2_score"):
        if field in latest and latest[field].new_value is not None:
            setattr(report, field, float(latest[field].new_value or 0))
    if report.stage2_score is not None and "stage2_score" in latest:
        report.stage2_passed = report.stage2_score >= t.stage2.pass_threshold
    _recompute_overall(report, app, t)
    if "overall_score" in latest and latest["overall_score"].new_value is not None:
        report.overall_score = float(latest["overall_score"].new_value or 0)
    if "recommendation" in latest:
        report.recommendation = latest["recommendation"].new_value
    app.final_score = report.overall_score


async def finalize(session: AsyncSession, application_id: uuid.UUID, llm: LLMClient) -> None:
    """Idempotent. An advisory lock rather than a row lock: model calls take a while and readers
    must not wait on them. A failure leaves `pending` for the sweep, up to the limit."""
    try:
        locked = await session.scalar(
            select(func.pg_try_advisory_xact_lock(func.hashtextextended(str(application_id), 1)))
        )
        if not locked:
            return
        await _finalize(session, application_id, llm)
        await session.commit()
    except Exception:
        logger.exception("report_failed: %s", application_id)
        await session.rollback()
        await _note_failure(session, application_id)


async def _note_failure(session: AsyncSession, application_id: uuid.UUID) -> None:
    report = await _report_row(session, application_id)
    report.attempts += 1
    if report.attempts >= get_settings().evaluation_max_attempts:
        report.state = EvaluationState.failed
        report.needs_review = True
        stage2 = (await _sessions(session, application_id)).get(InterviewStage.stage2)
        if stage2 is not None and stage2.evaluation_state is EvaluationState.pending:
            stage2.evaluation_state = EvaluationState.failed
            stage2.needs_review = True
    await session.commit()


async def _report_row(session: AsyncSession, application_id: uuid.UUID) -> SessionReport:
    report = await session.scalar(
        select(SessionReport).where(SessionReport.application_id == application_id)
    )
    if report is None:
        report = SessionReport(application_id=application_id)
        session.add(report)
        await session.flush()
    return report


async def _finalize(session: AsyncSession, application_id: uuid.UUID, llm: LLMClient) -> None:
    app = await session.get(Application, application_id)
    if app is None:
        return
    sessions = await _sessions(session, application_id)
    stage1, stage2 = sessions.get(InterviewStage.stage1), sessions.get(InterviewStage.stage2)
    t = await _thresholds(session, app, sessions)
    assessment = await session.scalar(
        select(Assessment).where(Assessment.vacancy_id == app.vacancy_id)
    )
    language = assessment.language if assessment else "en"
    if (
        stage2 is not None
        and stage2.status in _ENDED
        and stage2.evaluation_state is EvaluationState.pending
    ):
        await _evaluate_stage2(session, stage2, language, t, llm)
    if (
        app.status is ApplicationStatus.stage2_in_progress
        and stage2 is not None
        and stage2.evaluation_state is EvaluationState.done
    ):
        app.status = ApplicationStatus.evaluated

    # Suspicion covers both stages (§7.4), and is never part of the skill score.
    signals = await _all_signals(session, sessions)
    if signals or app.suspicion_percent is None:
        app.suspicion_percent, app.suspicion_label = suspicion(
            [(x.type, x.severity) for x in signals], t.integrity
        )

    tasks = await _tasks(session, stage1, t)
    turns = await _turns(session, stage2) if stage2 is not None else []
    percents = await _turn_percents(session, stage2, turns) if stage2 is not None else {}
    report = await _report_row(session, application_id)
    report.stage1_score = stage1.score_percent if stage1 is not None else None
    report.stage2_score = stage2.score_percent if stage2 is not None else None
    report.stage2_passed = stage2.passed if stage2 is not None else None
    latest = await _latest_overrides(session, application_id)
    report.recommendation = None
    _apply_score_overrides(report, app, latest, t)
    fresh_skills = await _per_skill(session, app, tasks, turns, percents, t)
    report.per_skill_scores = _with_reused(
        fresh_skills, verified_skills.reused_entries([stage1, stage2]), t
    )
    report.suspicion_explanation = _reasons(signals)
    await _write(session, app, report, tasks, turns, percents, stage2, signals, language, t, llm)
    report.needs_review = report.needs_review or any(s.needs_review for s in sessions.values())
    if "recommendation" in latest:
        report.recommendation = latest["recommendation"].new_value
    report.state = EvaluationState.done
    await verified_skills.record(
        session,
        app,
        stage1,
        stage2,
        fresh_skills,
        disqualifying_signal=any(x.severity is SignalSeverity.disqualifying for x in signals),
        lifted_disqualification="disqualification" in latest,
    )


async def _write(
    session: AsyncSession,
    app: Application,
    report: SessionReport,
    tasks: list[dict[str, Any]],
    turns: list[InterviewTurn],
    percents: dict[uuid.UUID, float],
    stage2: InterviewSession | None,
    signals: list[IntegritySignal],
    language: str,
    t: Thresholds,
    llm: LLMClient,
) -> None:
    by_turn: dict[uuid.UUID | None, Evaluation] = {}
    if stage2 is not None:
        rows = await session.scalars(
            select(Evaluation).where(
                Evaluation.session_id == stage2.id, Evaluation.turn_id.is_not(None)
            )
        )
        by_turn = {e.turn_id: e for e in rows}
    answered = [x for x in turns if x.id in percents]
    blocks = [_task_block(item) for item in tasks if item["scored"]]
    blocks += [_turn_block(x, by_turn.get(x.id), percents[x.id]) for x in answered]
    answers = {f"turn_{x.order}": scrub_answer(x.answer_transcript or "") for x in answered}
    code = {item["ref"]: item["sub"].final_code for item in tasks if item["scored"]}
    report.needs_review = False
    if not blocks:
        # Disqualified before anything could be scored: nothing to write about, and no model call.
        report.summary_for_hr, report.strengths, report.gaps = "", [], []
        report.candidate_feedback = {"mistakes": [], "learn_next": []}
        report.prompt_version = "deterministic"
        # Reused results alone can reach an overall score; the band needs no model.
        report.recommendation = band_for(report.overall_score, t.report)
        return
    scores = {
        "stage1": report.stage1_score,
        "stage2": report.stage2_score,
        "overall": report.overall_score,
        "per_skill": [
            {"skill": x["name"], "percent": x["percent"]} for x in report.per_skill_scores
        ],
    }
    written = await write_report(
        llm,
        language,
        scores=scores,
        evaluations=blocks,
        signals=[
            {"type": x.type, "severity": x.severity.value, "at_ms": x.evidence.get("at_ms")}
            for x in signals
            if x.severity is not SignalSeverity.info
        ],
        answers=answers,
        code=code,
    )
    band = band_for(report.overall_score, t.report)
    if written.draft is None:
        report.summary_for_hr, report.strengths, report.gaps = "", [], []
        report.recommendation = band
        report.needs_review = True
    else:
        draft = written.draft
        report.summary_for_hr = draft.summary
        report.strengths = [_point(p.model_dump(), code) for p in draft.strengths]
        report.gaps = [_point(p.model_dump(), code) for p in draft.gaps]
        # No overall score (stopped before the end): HR sees the status, not a recommendation.
        report.recommendation = clamp_recommendation(draft.recommendation, band) if band else None
        report.needs_review = draft.insufficient_evidence
    report.model = written.model
    report.prompt_version = written.prompt_version
    await _write_feedback(session, report, tasks, turns, blocks, language, llm)


def _point(point: dict[str, Any], code: dict[str, str]) -> dict[str, Any]:
    """The code excerpt comes from the stored code, not from the model."""
    source = code.get(point["ref"])
    return {**point, "excerpt": _excerpt(source, point["lines"]) if source else ""}


async def _write_feedback(
    session: AsyncSession,
    report: SessionReport,
    tasks: list[dict[str, Any]],
    turns: list[InterviewTurn],
    blocks: list[dict[str, Any]],
    language: str,
    llm: LLMClient,
) -> None:
    secrets: list[str] = []
    hidden: list[str] = []
    about = {item["ref"]: item["task"].title for item in tasks}
    for item in tasks:
        task = item["task"]
        solution = task.reference_solution or {}
        if solution.get("code"):
            secrets.append(solution["code"])
        for test in task.hidden_tests or []:
            hidden += [str(test.get("input", "")), str(test.get("output", ""))]
    by_id = {x.id: x for x in turns}
    for turn in turns:
        about[f"turn_{turn.order}"] = turn.question_text
        question = await _turn_question(session, turn, by_id)
        if question is not None and question.reference_answer:
            secrets.append(question.reference_answer)
    written = await write_feedback(
        llm,
        language,
        evaluations=blocks,
        skills=[x["name"] for x in report.per_skill_scores],
        refs=set(about),
        secrets=secrets,
        hidden_values=hidden,
    )
    if written.draft is None:
        report.candidate_feedback = {"mistakes": [], "learn_next": []}
        report.needs_review = True
        return
    report.candidate_feedback = {
        "mistakes": [{"text": m.text, "about": about[m.ref]} for m in written.draft.mistakes],
        "learn_next": [x.model_dump() for x in written.draft.learn_next],
    }


async def due(session: AsyncSession) -> list[uuid.UUID]:
    """Applications the job should look at: an ended Stage 2 not yet evaluated, or an application
    that stopped earlier and has no report. Stage 1's evaluation must have finished first."""
    settings = get_settings()
    stage2 = await session.scalars(
        select(InterviewSession.application_id)
        .where(
            InterviewSession.stage == InterviewStage.stage2,
            InterviewSession.evaluation_state == EvaluationState.pending,
            InterviewSession.status.in_(_ENDED),
        )
        .limit(settings.evaluation_sweep_batch)
    )
    stage1_finished = exists().where(
        InterviewSession.application_id == Application.id,
        InterviewSession.stage == InterviewStage.stage1,
        InterviewSession.evaluation_state != EvaluationState.pending,
    )
    stopped = await session.scalars(
        select(Application.id)
        .outerjoin(SessionReport, SessionReport.application_id == Application.id)
        .where(
            Application.status.in_(_STOPPED),
            stage1_finished,
            or_(SessionReport.id.is_(None), SessionReport.state == EvaluationState.pending),
        )
        .limit(settings.evaluation_sweep_batch)
    )
    return list({*stage2, *stopped})


# --- HR -------------------------------------------------------------------------------------------
async def _hr_stage2(
    session: AsyncSession, s: InterviewSession, turns: list[InterviewTurn]
) -> HrStage2:
    rows = await session.scalars(
        select(Evaluation).where(Evaluation.session_id == s.id, Evaluation.turn_id.is_not(None))
    )
    by_turn = {e.turn_id: e for e in rows}
    thresholds = s.config.get("thresholds", {}).get("stage2", {})
    out = []
    for x in turns:
        ev = by_turn.get(x.id)
        out.append(
            HrTurn(
                id=x.id,
                order=x.order,
                kind=x.kind,
                is_follow_up=x.is_follow_up,
                question_text=x.question_text,
                transcript=x.answer_transcript,
                answer_source=x.answer_source,
                has_answer_audio=x.answer_audio_url is not None,
                response_latency_ms=x.response_latency_ms,
                silence_ms=x.silence_ms,
                flags=x.flags,
                percent=round(100 * ev.score / ev.max_score, 1)
                if ev is not None and ev.score is not None and ev.max_score
                else None,
                needs_review=ev is not None and ev.status is EvaluationStatus.needs_review,
                criteria=[TurnCriterion(**c) for c in ev.criteria_scores] if ev else [],
                rationale=ev.rationale if ev else "",
                confidence=ev.confidence if ev else None,
                model=ev.model if ev else "",
                prompt_version=ev.prompt_version if ev else "",
            )
        )
    return HrStage2(
        session_id=s.id,
        status=s.status,
        mode=s.config.get("mode", "text"),
        evaluation_state=s.evaluation_state,
        disqualification_reason=s.disqualification_reason,
        pass_threshold=thresholds.get("pass_threshold"),
        passed=s.passed,
        turns=out,
    )


async def hr_report(
    session: AsyncSession, company_id: uuid.UUID, application_id: uuid.UUID, user: User
) -> HrReport:
    app, vacancy = await _company_application(session, company_id, application_id, user)
    candidate = await session.get(User, app.candidate_id)
    assert candidate is not None
    report = await session.scalar(
        select(SessionReport).where(SessionReport.application_id == app.id)
    )
    sessions = await _sessions(session, app.id)
    signals = await _all_signals(session, sessions)
    stage2 = sessions.get(InterviewStage.stage2)
    turns = await _turns(session, stage2) if stage2 is not None else []
    overrides = await session.execute(
        select(HrOverride, User.full_name)
        .outerjoin(User, User.id == HrOverride.actor_id)
        .where(HrOverride.application_id == app.id)
        .order_by(HrOverride.created_at.desc())
    )
    stage1 = sessions.get(InterviewStage.stage1)
    return HrReport(
        application_id=app.id,
        candidate_name=candidate.full_name,
        vacancy_title=vacancy.title,
        status=app.status,
        state=report.state if report is not None else None,
        needs_review=report.needs_review if report is not None else False,
        stage1_score=report.stage1_score if report else (stage1.score_percent if stage1 else None),
        stage2_score=report.stage2_score if report else None,
        overall_score=report.overall_score if report else None,
        per_skill=[SkillScore(**x) for x in report.per_skill_scores] if report else [],
        reused_skills=[
            ReusedSkillOut(**e) for e in verified_skills.reused_entries([stage1, stage2])
        ],
        summary=report.summary_for_hr if report else "",
        strengths=[ReportPoint(**x) for x in report.strengths] if report else [],
        gaps=[ReportPoint(**x) for x in report.gaps] if report else [],
        recommendation=report.recommendation if report else None,
        suspicion_percent=app.suspicion_percent,
        suspicion_label=app.suspicion_label,
        disqualification_reason=app.disqualification_reason,
        reasons=[ExplainedSignal(**x) for x in _reasons(signals)],
        signals=[
            TimelineSignal(
                id=x.id,
                stage=x.stage.value,
                type=x.type,
                severity=x.severity,
                at_ms=x.evidence.get("at_ms"),
                evidence=x.evidence,
                created_at=x.created_at,
            )
            for x in signals
        ],
        stage2=await _hr_stage2(session, stage2, turns) if stage2 is not None else None,
        overrides=[
            OverrideOut(
                id=o.id,
                field=o.field,
                old_value=o.old_value,
                new_value=o.new_value,
                comment=o.comment,
                actor_name=name,
                created_at=o.created_at,
            )
            for o, name in overrides
        ],
        model=report.model if report else "",
        prompt_version=report.prompt_version if report else "",
    )


async def answer_audio(
    session: AsyncSession,
    company_id: uuid.UUID,
    application_id: uuid.UUID,
    turn_id: uuid.UUID,
    user: User,
    storage: Storage,
) -> tuple[bytes, str]:
    app, _ = await _company_application(session, company_id, application_id, user)
    stage2 = (await _sessions(session, app.id)).get(InterviewStage.stage2)
    turn = await session.get(InterviewTurn, turn_id)
    if (
        stage2 is None
        or turn is None
        or turn.session_id != stage2.id
        or turn.answer_audio_url is None
    ):
        raise NotFoundError("Answer audio not found")
    audit.record(
        session, user.id, "interview.answer_audio", "application", app.id, {"turn": turn.order}
    )
    await session.commit()
    kind = {"webm": "audio/webm", "ogg": "audio/ogg", "wav": "audio/wav", "mp4": "audio/mp4"}.get(
        turn.answer_audio_url.rsplit(".", 1)[-1], "application/octet-stream"
    )
    return await storage.read(turn.answer_audio_url), kind


def _as_text(value: float | None) -> str | None:
    return None if value is None else str(value)


async def override(
    session: AsyncSession,
    company_id: uuid.UUID,
    application_id: uuid.UUID,
    user: User,
    data: OverrideIn,
) -> HrReport:
    """Every change keeps the old value, the comment and who made it (spec §8)."""
    app, _ = await _company_application(session, company_id, application_id, user)
    report = await session.scalar(
        select(SessionReport).where(SessionReport.application_id == app.id).with_for_update()
    )
    if report is None or report.state is not EvaluationState.done:
        raise AppError("report_not_ready", "The report is not ready yet", 409)
    sessions = await _sessions(session, app.id)
    t = await _thresholds(session, app, sessions)
    old: str | None
    new: str | None
    if data.field in _SCORE_FIELDS:
        if not isinstance(data.value, int | float) or not 0 <= data.value <= 100:
            raise AppError("invalid_override", "A score must be a number from 0 to 100", 422)
        old, new = _as_text(getattr(report, data.field)), str(float(data.value))
    elif data.field == "recommendation":
        if data.value not in ("strong_yes", "yes", "maybe", "no"):
            raise AppError("invalid_override", "Unknown recommendation", 422)
        old, new = report.recommendation, str(data.value)
    else:
        if data.value is not None:
            raise AppError("invalid_override", "A disqualification can only be lifted", 422)
        if app.status not in (
            ApplicationStatus.stage1_disqualified,
            ApplicationStatus.stage2_disqualified,
        ):
            raise AppError("not_disqualified", "This application is not disqualified", 409)
        old, new = app.disqualification_reason, None
    session.add(
        HrOverride(
            application_id=app.id,
            field=data.field,
            old_value=old,
            new_value=new,
            comment=data.comment,
            actor_id=user.id,
        )
    )
    await session.flush()
    if data.field == "disqualification":
        # Stage 1 → the candidate goes on to Stage 2. Stage 2 → scored on what was answered.
        app.status = (
            ApplicationStatus.stage2_pending
            if app.status is ApplicationStatus.stage1_disqualified
            else ApplicationStatus.evaluated
        )
        app.disqualification_reason = None
    if (
        data.field == "stage1_score"
        and app.status is ApplicationStatus.stage1_failed
        and float(new or 0) >= t.stage1.pass_threshold
    ):
        app.status = ApplicationStatus.stage2_pending  # the gate follows HR's score
    _apply_score_overrides(report, app, await _latest_overrides(session, app.id), t)
    if data.field == "disqualification" and app.status is ApplicationStatus.evaluated:
        stage2 = sessions[InterviewStage.stage2]
        report.stage2_passed = (
            stage2.score_percent is not None and stage2.score_percent >= t.stage2.pass_threshold
        )
    audit.record(
        session,
        user.id,
        "application.override",
        "application",
        app.id,
        {"field": data.field, "from": old, "to": new},
    )
    await session.commit()
    return await hr_report(session, company_id, application_id, user)


async def list_notes(
    session: AsyncSession, company_id: uuid.UUID, application_id: uuid.UUID, user: User
) -> list[NoteOut]:
    app, _ = await _company_application(session, company_id, application_id, user)
    rows = await session.execute(
        select(ApplicationNote, User.full_name)
        .outerjoin(User, User.id == ApplicationNote.author_id)
        .where(ApplicationNote.application_id == app.id)
        .order_by(ApplicationNote.created_at.desc())
    )
    return [
        NoteOut(id=n.id, text=n.text, author_name=name, created_at=n.created_at) for n, name in rows
    ]


async def add_note(
    session: AsyncSession, company_id: uuid.UUID, application_id: uuid.UUID, user: User, text: str
) -> NoteOut:
    app, _ = await _company_application(session, company_id, application_id, user)
    note = ApplicationNote(application_id=app.id, author_id=user.id, text=text)
    session.add(note)
    await session.commit()
    return NoteOut(
        id=note.id, text=note.text, author_name=user.full_name, created_at=note.created_at
    )


# --- candidate ------------------------------------------------------------------------------------
async def candidate_results(
    session: AsyncSession, application_id: uuid.UUID, user: User
) -> CandidateResults:
    row = (
        await session.execute(
            select(Application, Vacancy)
            .join(Vacancy, Vacancy.id == Application.vacancy_id)
            .where(Application.id == application_id, Application.candidate_id == user.id)
        )
    ).first()
    if row is None:
        raise NotFoundError("Application not found")
    app, vacancy = row
    base = {
        "application_id": app.id,
        "vacancy_title": vacancy.title,
        "status": app.status,
        "disqualification_reason": app.disqualification_reason,
    }
    report = await session.scalar(
        select(SessionReport).where(SessionReport.application_id == app.id)
    )
    if report is None or report.state is EvaluationState.pending:
        # Waiting on the candidate (Stage 2 ahead) is not waiting on us: nothing to poll for.
        stage2 = (await _sessions(session, app.id)).get(InterviewStage.stage2)
        coming = app.status in _STOPPED or (stage2 is not None and stage2.status in _ENDED)
        return CandidateResults(**base, state="pending" if coming else "not_ready")
    if report.state is EvaluationState.failed:
        return CandidateResults(**base, state="failed")
    sessions = await _sessions(session, app.id)
    stage1, stage2 = sessions.get(InterviewStage.stage1), sessions.get(InterviewStage.stage2)
    result = await candidate_result(session, stage1) if stage1 is not None else None
    answers: list[CandidateAnswer] = []
    if stage2 is not None:
        turns = await _turns(session, stage2)
        percents = await _turn_percents(session, stage2, turns)
        answers = [
            CandidateAnswer(
                order=x.order,
                question_text=x.question_text,
                percent=round(percents[x.id], 1) if x.id in percents else None,
            )
            for x in turns
            if x.answered_at is not None
        ]
    feedback = report.candidate_feedback or {}
    return CandidateResults(
        **base,
        state="done",
        stage1_score=report.stage1_score,
        stage2_score=report.stage2_score,
        overall_score=report.overall_score,
        per_skill=[
            CandidateSkill(name=x["name"], percent=x["percent"], reused=bool(x.get("reused")))
            for x in report.per_skill_scores
        ],
        tasks=result.tasks if result is not None else [],
        answers=answers,
        mistakes=[CandidateMistake(**x) for x in feedback.get("mistakes", [])],
        learn_next=[CandidateLearnItem(**x) for x in feedback.get("learn_next", [])],
    )
