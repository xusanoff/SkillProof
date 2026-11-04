"""Stage 2: the oral interview (spec §6.2, §7.1b, §7.3). The session row is locked only for short
writes: speech and model calls run with no lock held, and `preparing_since` says who is building the
next turn (D-091). A crash between two steps leaves a state the next read simply continues from."""

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import interviewer
from app.ai.guardrails import has_thinking_phrase, is_help_request, is_injection
from app.ai.integrity.stage1 import Event, suspicion
from app.ai.integrity.stage2 import TurnInput, detect
from app.ai.interviewer import MachineState, Move, PastTurn, PlanQuestion
from app.ai.llm_client import LLMClient
from app.ai.speech import STTProvider, TTSProvider
from app.core.config import get_settings
from app.core.errors import AppError, NotFoundError
from app.core.thresholds import Stage2Thresholds, Thresholds
from app.models import (
    Application,
    Assessment,
    AssessmentQuestion,
    CodeSubmission,
    EditorEvent,
    Evaluation,
    IntegritySignal,
    InterviewSession,
    InterviewTurn,
    PracticalTask,
    Question,
    RulesAcceptance,
    Skill,
    VacancySkill,
)
from app.models.enums import (
    ApplicationStatus,
    EditorEventType,
    EvaluationStatus,
    InterviewStage,
    SessionStatus,
    SignalSeverity,
)
from app.models.interview import PAGE_SEQ
from app.models.user import User
from app.schemas.interview import EventBatch, Stage2SessionOut, TurnCodeOut, TurnOut
from app.services import audit, verified_skills
from app.services.assessments import effective_thresholds
from app.services.interview import (
    SocketUpdate,
    _application,
    _disqualify,
    _end,
    _limit,
    _now,
    _own_session,
    _update,
)
from app.services.storage import Storage

logger = logging.getLogger(__name__)

_EVENTS = {
    EditorEventType.question_played,
    EditorEventType.speech_activity,
    EditorEventType.typing_activity,
    EditorEventType.think,
    EditorEventType.focus_lost,
    EditorEventType.focus_gained,
    EditorEventType.fullscreen_exit,
    EditorEventType.visibility_hidden,
    EditorEventType.visibility_visible,
    EditorEventType.paste_external_blocked,
}
_ACTIVITY = {EditorEventType.speech_activity, EditorEventType.typing_activity}
_AUDIO_MAGIC: list[tuple[int, bytes, str]] = [
    (0, b"\x1a\x45\xdf\xa3", ".webm"),
    (0, b"OggS", ".ogg"),
    (4, b"ftyp", ".mp4"),
    (0, b"RIFF", ".wav"),
]
_TTS_EXTENSIONS = {"audio/wav": ".wav", "audio/mpeg": ".mp3", "audio/ogg": ".ogg"}
_AUDIO_TYPES = {v: k for k, v in _TTS_EXTENSIONS.items()}


@dataclass(frozen=True)
class AnswerIn:
    text: str | None
    audio: bytes | None
    transcript_hint: str | None
    silence_ms: int | None


def _thresholds(s: InterviewSession) -> Thresholds:
    return Thresholds.model_validate(s.config["thresholds"])


def _ms(a: datetime, b: datetime) -> int:
    return int((b - a).total_seconds() * 1000)


async def _own(
    session: AsyncSession, session_id: uuid.UUID, user: User, lock: bool = False
) -> InterviewSession:
    return await _own_session(session, session_id, user, lock, InterviewStage.stage2)


async def _turns(session: AsyncSession, s: InterviewSession) -> list[InterviewTurn]:
    rows = await session.scalars(
        select(InterviewTurn)
        .where(InterviewTurn.session_id == s.id)
        .order_by(InterviewTurn.order)
        .execution_options(populate_existing=True)
    )
    return list(rows)


async def _open_turn(session: AsyncSession, s: InterviewSession) -> InterviewTurn | None:
    turns = await _turns(session, s)
    return turns[-1] if turns and turns[-1].answered_at is None else None


def _deadline(s: InterviewSession, turn: InterviewTurn) -> datetime | None:
    if turn.asked_at is None:
        return None
    limit = _thresholds(s).stage2.answer_time_limit_s
    return turn.asked_at + timedelta(milliseconds=turn.paused_ms, seconds=limit)


def _mark_asked(s: InterviewSession, turn: InterviewTurn, at: datetime) -> None:
    if turn.asked_at is None:
        turn.asked_at = at
        s.last_activity_at = at


def _close_turn(s: InterviewSession, turn: InterviewTurn, now: datetime, source: str) -> None:
    """Writes the timing fields. The inactivity timer rests until the next question is asked."""
    turn.answered_at = now
    turn.answer_source = source
    if turn.asked_at is not None and turn.speech_started_at is not None:
        turn.response_latency_ms = max(
            _ms(turn.asked_at, turn.speech_started_at) - turn.paused_ms, 0
        )
    s.last_activity_at = None


async def _signals(session: AsyncSession, s: InterviewSession) -> None:
    """Deterministic, so it runs right where the session ends, in the same transaction."""
    assert s.started_at is not None and s.completed_at is not None
    t = _thresholds(s)
    turns = [x for x in await _turns(session, s) if x.answered_at is not None]
    percents = await _percents(session, s)
    parents = {x.id: x for x in turns}
    inputs = []
    for x in turns:
        root = parents.get(x.parent_turn_id) if x.parent_turn_id else x
        spoken = (
            _ms(x.speech_started_at, x.answered_at) - (x.silence_ms or 0)
            if x.speech_started_at and x.answered_at
            else None
        )
        inputs.append(
            TurnInput(
                order=x.order,
                kind=root.kind if root is not None else x.kind,
                source=x.answer_source,
                transcript=x.answer_transcript or "",
                latency_ms=x.response_latency_ms,
                speech_ms=spoken,
                percent=percents.get(x.id),
                at_ms=_ms(s.started_at, x.asked_at) if x.asked_at else None,
                flags=x.flags,
                think_used=x.think_used_at is not None,
            )
        )
    rows = await session.scalars(
        select(EditorEvent)
        .where(EditorEvent.session_id == s.id)
        .order_by(EditorEvent.t_ms, EditorEvent.id)
    )
    events = [Event(e.t_ms, e.type, e.payload) for e in rows]
    stage1 = await session.scalar(
        select(InterviewSession.score_percent).where(
            InterviewSession.application_id == s.application_id,
            InterviewSession.stage == InterviewStage.stage1,
        )
    )
    end_ms = _ms(s.started_at, s.completed_at)
    for signal in detect(inputs, events, end_ms, stage1, t.integrity):
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
    s.suspicion_score, _ = suspicion([(x.type, x.severity) for x in stored], t.integrity)


async def _finish(
    session: AsyncSession,
    s: InterviewSession,
    status: SessionStatus,
    now: datetime,
    application_status: ApplicationStatus | None = None,
    reason: str | None = None,
) -> None:
    """The application keeps `stage2_in_progress` until the evaluator decides (Phase 7)."""
    await _end(session, s, status, now, application_status, reason)
    await _signals(session, s)


async def _sync(session: AsyncSession, s: InterviewSession, now: datetime) -> None:
    """Applies everything time-based that is due, so limits hold when the browser is gone."""
    if s.status is not SessionStatus.in_progress:
        return
    if s.disconnected_at is not None and (
        (now - s.disconnected_at).total_seconds() > _limit(s, "reconnect_window_s")
    ):
        await _finish(
            session,
            s,
            SessionStatus.abandoned,
            now,
            ApplicationStatus.stage2_disqualified,
            "abandoned",
        )
        return
    if s.expires_at is not None and now >= s.expires_at:
        # Time is up: the session completes with what was answered (§6.2).
        turn = await _open_turn(session, s)
        if turn is not None:
            _close_turn(s, turn, now, "timeout")
        await _finish(session, s, SessionStatus.expired, now)
        return
    if s.disconnected_at is not None:
        return
    turn = await _open_turn(session, s)
    if turn is None:
        return
    t = _thresholds(s).stage2
    if turn.asked_at is None:
        started = turn.shown_at + timedelta(
            milliseconds=turn.paused_ms, seconds=t.question_max_playback_s
        )
        if now < started:
            return
        _mark_asked(s, turn, started)
    assert s.last_activity_at is not None
    idle = (now - s.last_activity_at).total_seconds()
    if idle >= _limit(s, "inactivity_limit_s"):
        _close_turn(s, turn, now, "timeout")
        await _disqualify(session, s, "inactivity", now, {"idle_s": round(idle)})
        await session.flush()
        await _signals(session, s)
        return
    deadline = _deadline(s, turn)
    assert deadline is not None
    if now >= deadline + timedelta(seconds=t.answer_upload_grace_s):
        _close_turn(s, turn, now, "timeout")  # no answer arrived: the next read moves on


async def _percents(session: AsyncSession, s: InterviewSession) -> dict[uuid.UUID, float]:
    rows = await session.scalars(
        select(Evaluation).where(Evaluation.session_id == s.id, Evaluation.turn_id.is_not(None))
    )
    return {
        e.turn_id: 100 * e.score / e.max_score
        for e in rows
        if e.turn_id is not None and e.score is not None and e.max_score
    }


# --- building the next turn -----------------------------------------------------------------------
async def _skills(session: AsyncSession, app: Application) -> tuple[list[str], dict[str, int]]:
    rows = await session.execute(
        select(Skill.id, Skill.name, VacancySkill.weight)
        .join(VacancySkill, VacancySkill.skill_id == Skill.id)
        .where(VacancySkill.vacancy_id == app.vacancy_id)
    )
    pairs = list(rows)
    return [p.name for p in pairs], {str(p.id): p.weight for p in pairs}


async def _stage1_code(
    session: AsyncSession, application_id: uuid.UUID
) -> list[tuple[CodeSubmission, PracticalTask]]:
    rows = await session.execute(
        select(CodeSubmission, PracticalTask)
        .join(PracticalTask, PracticalTask.id == CodeSubmission.task_id)
        .join(InterviewSession, InterviewSession.id == CodeSubmission.session_id)
        .where(
            InterviewSession.application_id == application_id,
            InterviewSession.stage == InterviewStage.stage1,
        )
        .order_by(CodeSubmission.shown_at)
    )
    return [(sub, task) for sub, task in rows if sub.final_code.strip()]


async def _grade_last(
    session: AsyncSession, s: InterviewSession, turn: InterviewTurn, llm: LLMClient, lang: str
) -> None:
    existing = await session.scalar(select(Evaluation.id).where(Evaluation.turn_id == turn.id))
    answer = turn.answer_transcript or ""
    if existing is not None or turn.flags.get("stt_failed"):
        return
    source = turn
    if turn.parent_turn_id is not None:
        parent = await session.get(InterviewTurn, turn.parent_turn_id)
        source = parent or turn
    question = await session.get(Question, source.question_id) if source.question_id else None
    rubric = question.rubric if question is not None else interviewer.OWN_CODE_RUBRIC
    outcome = await interviewer.grade_answer(
        llm,
        lang,
        question=turn.question_text,
        rubric=rubric,
        reference=question.reference_answer if question is not None else None,
        answer=answer,
    )
    if outcome is None:
        return
    grade = outcome.grade
    if grade is not None and grade.injection_attempt:
        turn.flags = {**turn.flags, "injection_attempt": True}
    session.add(
        Evaluation(
            session_id=s.id,
            turn_id=turn.id,
            score=round(outcome.percent * outcome.max_score / 100, 2)
            if outcome.percent is not None
            else None,
            max_score=outcome.max_score,
            criteria_scores=[c.model_dump() for c in grade.criteria] if grade else [],
            rationale=grade.rationale if grade else "",
            confidence=grade.confidence if grade else None,
            model=outcome.model,
            prompt_version=outcome.prompt_version,
            status=EvaluationStatus.needs_review if outcome.needs_review else EvaluationStatus.ok,
        )
    )
    await session.flush()


def _machine_state(
    s: InterviewSession, turns: list[InterviewTurn], percents: dict[uuid.UUID, float]
) -> MachineState:
    plan = s.config["plan"]
    orders = {x.id: x.order for x in turns}
    return MachineState(
        turns=[
            PastTurn(
                order=x.order,
                kind=x.kind,
                question_id=str(x.question_id) if x.question_id else None,
                parent_order=orders.get(x.parent_turn_id) if x.parent_turn_id else None,
                percent=percents.get(x.id),
                answered_text=bool((x.answer_transcript or "").strip()),
                follow_up_allowed=not (
                    x.flags.get("help_request") or x.flags.get("injection_attempt")
                ),
            )
            for x in turns
        ],
        questions=[PlanQuestion(**q) for q in plan["questions"]],
        skill_weights=plan["skill_weights"],
        question_count=plan["question_count"],
        own_code_target=plan["own_code_target"],
        difficulty=s.current_difficulty or 3,
    )


async def _word_move(
    session: AsyncSession,
    s: InterviewSession,
    app: Application,
    turns: list[InterviewTurn],
    move: Move,
    llm: LLMClient,
    t: Stage2Thresholds,
) -> dict[str, Any] | None:
    """The new turn's fields, or None when this move has to be dropped."""
    lang = s.config["language"]
    names, _ = await _skills(session, app)
    if move.kind == "bank":
        question = await session.get(Question, uuid.UUID(str(move.question_id)))
        assert question is not None
        text = question.text
        if question.options:
            text += " " + " ".join(f"{i}) {o}." for i, o in enumerate(question.options, 1))
        return {
            "question_id": question.id,
            "question_text": text,
            "difficulty": question.difficulty,
        }
    if move.kind == "own_code":
        code = await _stage1_code(session, app.id)
        if not code:
            return None
        own = [x for x in turns if x.kind == "own_code"]
        sub, task = code[len(own) % len(code)]
        used = {n for x in own for n in (x.refers_to or {}).get("lines", [])}
        text, lines = await interviewer.own_code_question(
            llm,
            lang,
            title=task.title,
            statement=task.statement,
            code=sub.final_code,
            skills=names,
            used_lines=used,
            t=t,
        )
        return {
            "question_text": text,
            "refers_to": {"submission_id": str(sub.id), "lines": lines},
        }
    parent = next(x for x in turns if x.order == move.parent_order)
    last = turns[-1]
    question = await session.get(Question, parent.question_id) if parent.question_id else None
    secrets = []
    if question is not None:
        secrets = [question.reference_answer or "", str(question.rubric)]
    worded = await interviewer.follow_up_question(
        llm,
        lang,
        parent_question=last.question_text,
        answer=last.answer_transcript or "",
        skills=names,
        secrets=secrets,
        t=t,
    )
    if worded is None:
        return None
    return {
        "question_text": worded,
        "is_follow_up": True,
        "parent_turn_id": parent.id,
        "refers_to": parent.refers_to,
    }


async def _plan_next(
    session: AsyncSession, s: InterviewSession, llm: LLMClient
) -> tuple[dict[str, Any] | None, int | None]:
    """Grades the last answer and works out the next turn. Touches no locked state."""
    t = _thresholds(s).stage2
    lang = s.config["language"]
    turns = await _turns(session, s)
    difficulty = s.current_difficulty
    if turns:
        await _grade_last(session, s, turns[-1], llm, lang)
        percents = await _percents(session, s)
        if s.config["plan"]["adaptive"]:
            difficulty = interviewer.next_difficulty(difficulty or 3, percents.get(turns[-1].id), t)
    else:
        percents = {}
    app = await session.get(Application, s.application_id)
    assert app is not None
    state = _machine_state(s, turns, percents)
    state = MachineState(**{**state.__dict__, "difficulty": difficulty or 3})
    dropped = 0
    while True:
        move = interviewer.next_move(state, t)
        if move is None:
            return None, difficulty
        fields = await _word_move(session, s, app, turns, move, llm, t)
        if fields is not None:
            fields["kind"] = move.kind
            if fields.get("difficulty") is None:
                fields["difficulty"] = difficulty
            if turns and turns[-1].flags.get("help_request"):
                fields["question_text"] = f"{interviewer.DECLINE[lang]} {fields['question_text']}"
            return fields, difficulty
        # A dropped follow-up must not be tried again; own-code with no code ends that branch.
        dropped += 1
        if move.kind == "follow_up":
            past = list(state.turns)
            past[-1] = PastTurn(**{**past[-1].__dict__, "follow_up_allowed": False})
            state = MachineState(**{**state.__dict__, "turns": past})
        else:
            state = MachineState(**{**state.__dict__, "own_code_target": 0})
        assert dropped < 3


async def _synthesize(
    tts: TTSProvider, storage: Storage, s: InterviewSession, text: str
) -> str | None:
    """No audio is not an error: the question is on screen and the client skips playback."""
    if s.config["mode"] != "voice":
        return None
    try:
        speech = await tts.synthesize(text, s.config["language"])
        extension = _TTS_EXTENSIONS.get(speech.content_type, ".wav")
        return await storage.save(f"interviews/{s.id}/questions", extension, speech.audio)
    except Exception:
        logger.exception("tts_failed", extra={"session_id": str(s.id)})
        return None


async def _prepare(
    session: AsyncSession,
    session_id: uuid.UUID,
    user: User,
    llm: LLMClient,
    tts: TTSProvider,
    storage: Storage,
) -> None:
    """Puts the next question in place if the last one is closed, unless someone else is on it."""
    now = _now()
    s = await _own(session, session_id, user, lock=True)
    await _sync(session, s, now)
    if s.status is not SessionStatus.in_progress or await _open_turn(session, s) is not None:
        await session.commit()
        return
    stale = _thresholds(s).stage2.preparing_stale_s
    if s.preparing_since is not None and (now - s.preparing_since).total_seconds() < stale:
        await session.commit()
        return
    s.preparing_since = now
    await session.commit()
    try:
        fields, difficulty = await _plan_next(session, s, llm)
        audio = await _synthesize(tts, storage, s, fields["question_text"]) if fields else None
        await session.commit()  # the grade stands whatever happens to the rest
        now = _now()
        s = await _own(session, session_id, user, lock=True)
        await session.refresh(s)
        await _sync(session, s, now)
        if s.status is SessionStatus.in_progress:
            if fields is None:
                await _finish(session, s, SessionStatus.completed, now)
            else:
                order = len(await _turns(session, s)) + 1
                session.add(
                    InterviewTurn(
                        session_id=s.id,
                        order=order,
                        shown_at=now,
                        question_audio_url=audio,
                        **fields,
                    )
                )
                s.current_task_index = order
                s.current_difficulty = difficulty
        s.preparing_since = None
        await session.commit()
    except IntegrityError:
        await session.rollback()  # another request placed this turn first
    except Exception:
        await session.rollback()
        await session.execute(
            InterviewSession.__table__.update()  # type: ignore[attr-defined]
            .where(InterviewSession.id == session_id)
            .values(preparing_since=None)
        )
        await session.commit()
        raise


# --- reading --------------------------------------------------------------------------------------
async def _out(session: AsyncSession, s: InterviewSession, now: datetime) -> Stage2SessionOut:
    await session.refresh(s)
    t = _thresholds(s)
    settings = get_settings()
    turns = await _turns(session, s)
    current = (
        turns[-1]
        if turns and turns[-1].answered_at is None and s.status is SessionStatus.in_progress
        else None
    )
    turn_out = None
    if current is not None:
        code = None
        refers = current.refers_to or {}
        if refers.get("submission_id"):
            sub = await session.get(CodeSubmission, uuid.UUID(refers["submission_id"]))
            if sub is not None:
                code = TurnCodeOut(
                    language=sub.language, code=sub.final_code, lines=refers.get("lines", [])
                )
        turn_out = TurnOut(
            id=current.id,
            order=current.order,
            kind=current.kind,
            is_follow_up=current.is_follow_up,
            text=current.question_text,
            has_audio=current.question_audio_url is not None,
            code=code,
            asked=current.asked_at is not None,
            answer_deadline=_deadline(s, current),
            think_available=current.think_used_at is None,
        )
    mode = s.config["mode"]
    return Stage2SessionOut(
        id=s.id,
        application_id=s.application_id,
        status=s.status,
        reason=s.disqualification_reason,
        mode=mode,
        can_fall_back_to_text=mode == "voice" and s.status is SessionStatus.in_progress,
        transcript_hint_needed=mode == "voice" and settings.stt_provider == "mock",
        language=s.config["language"],
        started_at=s.started_at,
        expires_at=s.expires_at,
        server_now=now,
        question_count=s.config["plan"]["question_count"],
        answered_count=sum(x.answered_at is not None and not x.is_follow_up for x in turns),
        answer_limit_s=t.stage2.answer_time_limit_s,
        warning_s=_limit(s, "inactivity_warning_s"),
        limit_s=_limit(s, "inactivity_limit_s"),
        audio_max_bytes=settings.interview_audio_max_bytes,
        answer_max_chars=settings.interview_answer_max_chars,
        preparing=current is None and s.status is SessionStatus.in_progress,
        current_turn=turn_out,
    )


async def get_state(
    session: AsyncSession,
    session_id: uuid.UUID,
    user: User,
    llm: LLMClient,
    tts: TTSProvider,
    storage: Storage,
) -> Stage2SessionOut:
    await _prepare(session, session_id, user, llm, tts, storage)
    s = await _own(session, session_id, user)
    return await _out(session, s, _now())


async def question_audio(
    session: AsyncSession, session_id: uuid.UUID, turn_id: uuid.UUID, user: User, storage: Storage
) -> tuple[bytes, str]:
    s = await _own(session, session_id, user)
    turn = await session.get(InterviewTurn, turn_id)
    if turn is None or turn.session_id != s.id or turn.question_audio_url is None:
        raise NotFoundError("Question audio not found")
    kind = _AUDIO_TYPES.get(Path(turn.question_audio_url).suffix, "audio/wav")
    return await storage.read(turn.question_audio_url), kind


# --- writing --------------------------------------------------------------------------------------
async def start(
    session: AsyncSession,
    application_id: uuid.UUID,
    user: User,
    llm: LLMClient,
    tts: TTSProvider,
    storage: Storage,
) -> Stage2SessionOut:
    now = _now()
    await _application(session, application_id, user)
    app = await session.scalar(
        select(Application).where(Application.id == application_id).with_for_update()
    )
    assert app is not None
    s = await session.scalar(
        select(InterviewSession).where(
            InterviewSession.application_id == app.id,
            InterviewSession.stage == InterviewStage.stage2,
        )
    )
    if s is None:
        s = await _create(session, app, user, now)
    await session.commit()
    return await get_state(session, s.id, user, llm, tts, storage)


async def _create(
    session: AsyncSession, app: Application, user: User, now: datetime
) -> InterviewSession:
    if app.status is not ApplicationStatus.stage2_pending:
        raise AppError("stage2_not_available", "Stage 2 is not available for this application", 409)
    version = get_settings().rules_version
    accepted = await session.scalar(
        select(RulesAcceptance.id).where(
            RulesAcceptance.application_id == app.id, RulesAcceptance.rules_version == version
        )
    )
    if accepted is None:
        raise AppError("rules_not_accepted", "Accept the rules first", 409)
    assessment = await session.scalar(
        select(Assessment).where(Assessment.vacancy_id == app.vacancy_id)
    )
    assert assessment is not None
    thresholds = effective_thresholds(assessment)
    rows = await session.execute(
        select(Question, AssessmentQuestion.is_mandatory)
        .join(AssessmentQuestion, AssessmentQuestion.question_id == Question.id)
        .where(AssessmentQuestion.assessment_id == assessment.id, Question.is_approved.is_(True))
        .order_by(AssessmentQuestion.order)
    )
    pairs = list(rows)
    # Chosen when Stage 1 started. A mandatory question is asked whatever the candidate holds.
    offered = await verified_skills.stage2_offer(session, app.id)
    reused_ids = {e["skill_id"] for e in offered}
    kept = [
        (q, is_mandatory)
        for q, is_mandatory in pairs
        if is_mandatory or str(q.skill_id) not in reused_ids
    ]
    questions = [
        PlanQuestion(
            str(q.id), str(q.skill_id) if q.skill_id else None, q.difficulty, is_mandatory
        ).__dict__
        for q, is_mandatory in kept
    ]
    _, weights = await _skills(session, app)
    weights = {k: v for k, v in weights.items() if k not in reused_ids}
    full_count = thresholds.stage2.question_count
    has_code = bool(await _stage1_code(session, app.id))
    own_code = min(thresholds.stage2.min_own_code_questions, full_count) if has_code else 0
    count = verified_skills.stage2_size(full_count, len(pairs), len(kept), own_code)
    reused = None
    if len(kept) < len(pairs) and offered:
        reused = {
            "skills": offered,
            "percent": round(sum(e["percent"] for e in offered) / len(offered), 1),
            "weight": max(1, full_count - count),
        }
    cfg = assessment.stage2_config
    i = thresholds.integrity
    s = InterviewSession(
        application_id=app.id,
        stage=InterviewStage.stage2,
        status=SessionStatus.in_progress,
        started_at=now,
        expires_at=now + timedelta(minutes=thresholds.stage2.session_minutes),
        disconnected_at=now,  # no socket yet: the reconnect window runs
        current_difficulty=3,
        current_task_index=0,
        config={
            "mode": cfg.get("mode", "voice"),
            "language": assessment.language,
            "rules_version": version,
            "reused": reused,
            "thresholds": thresholds.model_dump(mode="json"),
            "integrity": {
                "inactivity_warning_s": i.inactivity_warning_s,
                "inactivity_limit_s": i.inactivity_limit_s,
                "reconnect_window_s": i.reconnect_window_s,
            },
            "plan": {
                "questions": questions,
                "skill_weights": weights,
                "question_count": count,
                "own_code_target": min(own_code, count),
                "adaptive": cfg.get("adaptive", True),
            },
        },
    )
    session.add(s)
    await session.flush()
    app.status = ApplicationStatus.stage2_in_progress
    if count == 0:
        # Every question is covered by a verified skill: the sweep scores it and writes the report.
        s.status = SessionStatus.completed
        s.completed_at = now
        s.disconnected_at = None
    audit.record(session, user.id, "interview.stage2_start", "interview_session", s.id)
    return s


def _audio_extension(data: bytes) -> str:
    """Never trust the client's content type: only known containers are stored."""
    for offset, magic, extension in _AUDIO_MAGIC:
        if data[offset : offset + len(magic)] == magic:
            return extension
    raise AppError("invalid_audio", "This audio format is not supported", 422)


async def answer(
    session: AsyncSession,
    session_id: uuid.UUID,
    turn_id: uuid.UUID,
    user: User,
    data: AnswerIn,
    llm: LLMClient,
    stt: STTProvider,
    tts: TTSProvider,
    storage: Storage,
) -> Stage2SessionOut:
    """Idempotent: a retried upload of a closed turn just returns the current state."""
    settings = get_settings()
    if data.text is not None and len(data.text) > settings.interview_answer_max_chars:
        raise AppError("answer_too_long", "The answer is too long", 422)
    if data.audio is not None and len(data.audio) > settings.interview_audio_max_bytes:
        raise AppError("audio_too_large", "The recording is too large", 413)
    now = _now()
    s = await _own(session, session_id, user, lock=True)
    await _sync(session, s, now)
    turn = await session.get(InterviewTurn, turn_id, populate_existing=True)
    if turn is None or turn.session_id != s.id:
        raise NotFoundError("Turn not found")
    open_turn = s.status is SessionStatus.in_progress and turn.answered_at is None
    if open_turn and s.config["mode"] == "voice" and not data.audio:
        raise AppError("audio_required", "This interview is answered by voice", 422)
    extension = _audio_extension(data.audio) if open_turn and data.audio else None
    await session.commit()
    if open_turn:
        await _store_answer(session, s, turn_id, user, data, extension, stt, storage)
    await _prepare(session, session_id, user, llm, tts, storage)
    s = await _own(session, session_id, user)
    return await _out(session, s, _now())


async def _store_answer(
    session: AsyncSession,
    s: InterviewSession,
    turn_id: uuid.UUID,
    user: User,
    data: AnswerIn,
    extension: str | None,
    stt: STTProvider,
    storage: Storage,
) -> None:
    mode, language = s.config["mode"], s.config["language"]
    transcript = data.text or ""
    key = None
    failed = False
    if mode == "voice" and data.audio is not None and extension is not None:
        key = await storage.save(f"interviews/{s.id}/answers", extension, data.audio)
        try:
            result = await stt.transcribe(data.audio, language, data.transcript_hint)
            transcript = result.text
        except Exception:
            logger.exception("stt_failed", extra={"session_id": str(s.id)})
            failed = True
    now = _now()
    s = await _own(session, s.id, user, lock=True)
    await session.refresh(s)
    await _sync(session, s, now)
    turn = await session.get(InterviewTurn, turn_id, populate_existing=True)
    assert turn is not None
    if s.status is not SessionStatus.in_progress or turn.answered_at is not None:
        await session.commit()  # the clock or a parallel retry closed this turn while we worked
        if key is not None:
            await storage.delete(key)
        return
    _mark_asked(s, turn, now)
    turn.answer_transcript = transcript
    turn.answer_audio_url = key
    limit = _ms(turn.asked_at, now) if turn.asked_at else 0
    if data.silence_ms is not None:
        turn.silence_ms = min(data.silence_ms, limit)
    elif turn.asked_at is not None and turn.speech_started_at is not None:
        turn.silence_ms = max(_ms(turn.asked_at, turn.speech_started_at) - turn.paused_ms, 0)
    flags = {
        "help_request": is_help_request(transcript),
        "injection_attempt": is_injection(transcript),
        "thinking_phrase": has_thinking_phrase(transcript),
        "stt_failed": failed,
    }
    turn.flags = {k: v for k, v in flags.items() if v}
    _close_turn(s, turn, now, mode)
    await session.commit()


async def fall_back_to_text(
    session: AsyncSession,
    session_id: uuid.UUID,
    user: User,
    llm: LLMClient,
    tts: TTSProvider,
    storage: Storage,
) -> Stage2SessionOut:
    """When voice fails (spec §6.2). HR sees that it happened."""
    now = _now()
    s = await _own(session, session_id, user, lock=True)
    await _sync(session, s, now)
    if s.status is SessionStatus.in_progress and s.config["mode"] == "voice":
        s.config = {**s.config, "mode": "text"}
        turn = await _open_turn(session, s)
        session.add(
            IntegritySignal(
                session_id=s.id,
                stage=s.stage,
                type="voice_fallback",
                severity=SignalSeverity.info,
                evidence={"turn": turn.order if turn else None},
            )
        )
    await session.commit()
    return await get_state(session, session_id, user, llm, tts, storage)


# --- socket ---------------------------------------------------------------------------------------
async def connect(
    session: AsyncSession,
    session_id: uuid.UUID,
    user: User,
    connection_id: uuid.UUID,
    page: int | None,
) -> tuple[SocketUpdate, int]:
    now = _now()
    s = await _own(session, session_id, user, lock=True)
    await _sync(session, s, now)
    if s.status is SessionStatus.in_progress and s.disconnected_at is not None:
        # A disconnect never counts as inactivity, nor against the answer limit (§7.1b).
        gap = now - s.disconnected_at
        if s.last_activity_at is not None:
            s.last_activity_at += gap
        turn = await _open_turn(session, s)
        if turn is not None:
            turn.paused_ms += int(gap.total_seconds() * 1000)
        s.disconnected_at = None
    s.connection_id = connection_id
    if page is None or not 1 <= page <= s.telemetry_pages:
        s.telemetry_pages += 1
        page = s.telemetry_pages
    await session.commit()
    return _update(s, now), page


async def disconnect(
    session: AsyncSession, session_id: uuid.UUID, connection_id: uuid.UUID
) -> None:
    s = await session.scalar(
        select(InterviewSession).where(InterviewSession.id == session_id).with_for_update()
    )
    if s is not None and s.connection_id == connection_id and s.disconnected_at is None:
        s.connection_id = None
        s.disconnected_at = _now()
    await session.commit()


async def is_current_connection(
    session: AsyncSession, session_id: uuid.UUID, connection_id: uuid.UUID
) -> bool:
    current = await session.scalar(
        select(InterviewSession.connection_id).where(InterviewSession.id == session_id)
    )
    return current == connection_id


async def tick(session: AsyncSession, session_id: uuid.UUID, user: User) -> SocketUpdate:
    now = _now()
    s = await _own(session, session_id, user, lock=True)
    await _sync(session, s, now)
    await session.commit()
    return _update(s, now)


async def apply_events(
    session: AsyncSession, session_id: uuid.UUID, user: User, batch: EventBatch, page: int
) -> SocketUpdate:
    now = _now()
    s = await _own(session, session_id, user, lock=True)
    await _sync(session, s, now)
    ack = max((e.seq for e in batch.events), default=0)
    if s.status is not SessionStatus.in_progress:
        await session.commit()
        return _update(s, now, ack)
    assert s.started_at is not None
    elapsed = _ms(s.started_at, now)
    turn = await _open_turn(session, s)
    for e in sorted(batch.events, key=lambda e: e.seq):
        if e.type not in _EVENTS:
            continue
        lag = max(batch.sent_t_ms - e.t_ms, 0)
        inserted = await session.scalar(
            insert(EditorEvent)
            .values(
                session_id=s.id,
                task_id=None,
                seq=page * PAGE_SEQ + e.seq,
                t_ms=min(max(elapsed - lag, 0), elapsed),
                type=e.type,
                payload=e.payload,
            )
            .on_conflict_do_nothing()
            .returning(EditorEvent.id)
        )
        # Resent batches, and events about a turn that has closed, change no clock.
        if inserted is None or turn is None or str(e.payload.get("turn_id")) != str(turn.id):
            continue
        at = now - timedelta(milliseconds=lag)
        if at < turn.shown_at:
            at = turn.shown_at
        if e.type is EditorEventType.question_played:
            _mark_asked(s, turn, now)
        elif e.type in _ACTIVITY:
            _mark_asked(s, turn, at)  # speaking over the question ends the wait for playback
            if turn.speech_started_at is None:
                turn.speech_started_at = at
            s.last_activity_at = now
        elif e.type is EditorEventType.think and turn.think_used_at is None:
            # Once per question (§7.1b): it gives time, and never counts as speech.
            _mark_asked(s, turn, at)
            turn.think_used_at = at
            s.last_activity_at = now
    await session.commit()
    return _update(s, now, ack)


async def sweep(session: AsyncSession) -> None:
    """Closes sessions whose browser is gone: the socket's tick can't do it for them."""
    rows = await session.scalars(
        select(InterviewSession)
        .where(
            InterviewSession.stage == InterviewStage.stage2,
            InterviewSession.status == SessionStatus.in_progress,
            or_(
                InterviewSession.disconnected_at.is_not(None),
                InterviewSession.expires_at <= func.now(),
            ),
        )
        .limit(get_settings().evaluation_sweep_batch)
        .with_for_update(skip_locked=True)
    )
    now = _now()
    for s in rows:
        await _sync(session, s, now)
    await session.commit()
