"""Stage 1 of the interview: rules, session, timers and the paste / inactivity rules (spec §6, §7.1,
§7.1b). Every limit is enforced here; the browser only displays them."""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import AppError, NotFoundError
from app.models import (
    Application,
    Assessment,
    CodeSubmission,
    EditorEvent,
    Evaluation,
    IntegritySignal,
    InterviewSession,
    PracticalTask,
    RulesAcceptance,
    User,
    Vacancy,
)
from app.models.enums import (
    ApplicationStatus,
    EditorEventType,
    EvaluationState,
    InterviewStage,
    SessionStatus,
    SignalSeverity,
)
from app.models.interview import PAGE_SEQ
from app.sandbox.client import Limits, Sandbox, run_tests
from app.schemas.interview import (
    ClientEvent,
    CodeIn,
    EventBatch,
    IntegrityLimits,
    InterviewStateOut,
    RunOut,
    SessionOut,
    SessionTaskOut,
    Stage1Result,
    Stage1TaskResult,
    TestResult,
    VisibleTest,
    WarmupOut,
)
from app.services import audit
from app.services.assessments import effective_thresholds, to_out

_STARTABLE = {ApplicationStatus.applied, ApplicationStatus.interview_pending}
_ACTIVITY = {
    EditorEventType.insert,
    EditorEventType.delete,
    EditorEventType.replace,
    EditorEventType.run,
}
# Multi-character inserts the editor itself explains. Anything else counts as external (§7.1).
_TRUSTED_INSERT_SOURCES = {"keyboard", "auto_close", "undo", "redo", "internal_paste", "format"}

WARMUP_TESTS = [
    VisibleTest(name="1", input="2 3\n", output="5"),
    VisibleTest(name="2", input="10 -4\n", output="6"),
]
WARMUP_STARTER = {
    "python": "a, b = map(int, input().split())\n",
    "javascript": "const [a, b] = require('fs')\n"
    "  .readFileSync(0, 'utf8').trim().split(' ').map(Number);\n",
    "typescript": "declare const require: any;\n"
    "const [a, b] = require('fs').readFileSync(0, 'utf8').trim().split(' ').map(Number);\n",
    "go": 'package main\n\nimport "fmt"\n\nfunc main() {\n\tvar a, b int\n\tfmt.Scan(&a, &b)\n}\n',
    "java": "import java.util.Scanner;\n\npublic class Main {\n"
    "    public static void main(String[] args) {\n"
    "        Scanner in = new Scanner(System.in);\n"
    "        int a = in.nextInt(), b = in.nextInt();\n    }\n}\n",
}


@dataclass(frozen=True)
class SocketUpdate:
    status: SessionStatus
    reason: str | None
    current_task_index: int
    inactive_s: int
    warning_s: int
    limit_s: int
    ack_seq: int = 0


def _now() -> datetime:
    return datetime.now(UTC)


async def _application(session: AsyncSession, application_id: uuid.UUID, user: User) -> Application:
    app = await session.get(Application, application_id)
    if app is None or app.candidate_id != user.id:
        raise NotFoundError("Application not found")
    return app


async def _stage1(session: AsyncSession, application_id: uuid.UUID) -> InterviewSession | None:
    return await session.scalar(
        select(InterviewSession).where(
            InterviewSession.application_id == application_id,
            InterviewSession.stage == InterviewStage.stage1,
        )
    )


async def _own_session(
    session: AsyncSession, session_id: uuid.UUID, user: User, lock: bool = False
) -> InterviewSession:
    q = (
        select(InterviewSession)
        .join(Application, Application.id == InterviewSession.application_id)
        .where(InterviewSession.id == session_id, Application.candidate_id == user.id)
    )
    s = await session.scalar(q.with_for_update(of=InterviewSession) if lock else q)
    if s is None:
        raise NotFoundError("Interview session not found")
    return s


async def _submissions(session: AsyncSession, s: InterviewSession) -> dict[str, CodeSubmission]:
    rows = await session.scalars(select(CodeSubmission).where(CodeSubmission.session_id == s.id))
    return {str(r.task_id): r for r in rows}


def _limit(s: InterviewSession, key: str) -> int:
    return int(s.config["integrity"][key])


def _task_deadline(s: InterviewSession, index: int, shown_at: datetime) -> datetime:
    deadline = shown_at + timedelta(minutes=s.config["tasks"][index]["limit_minutes"])
    assert s.expires_at is not None
    return min(deadline, s.expires_at)


async def _show_task(session: AsyncSession, s: InterviewSession, now: datetime) -> None:
    task = await session.get(
        PracticalTask, uuid.UUID(s.config["tasks"][s.current_task_index]["id"])
    )
    assert task is not None
    language = task.allowed_languages[0]
    session.add(
        CodeSubmission(
            session_id=s.id,
            task_id=task.id,
            language=language,
            final_code=task.starter_code.get(language, ""),
            shown_at=now,
        )
    )
    s.last_activity_at = now


async def _end(
    session: AsyncSession,
    s: InterviewSession,
    status: SessionStatus,
    now: datetime,
    application_status: ApplicationStatus | None = None,
    reason: str | None = None,
) -> None:
    s.status = status
    s.completed_at = now
    s.disqualification_reason = reason
    if application_status is not None:
        app = await session.get(Application, s.application_id)
        assert app is not None
        app.status = application_status
        if reason is not None:
            app.disqualification_reason = reason


async def _disqualify(
    session: AsyncSession, s: InterviewSession, reason: str, now: datetime, evidence: dict[str, Any]
) -> None:
    session.add(
        IntegritySignal(
            session_id=s.id,
            stage=s.stage,
            type=reason,
            severity=SignalSeverity.disqualifying,
            evidence=evidence,
        )
    )
    await _end(
        session, s, SessionStatus.disqualified, now, ApplicationStatus.stage1_disqualified, reason
    )


async def _advance(
    session: AsyncSession, s: InterviewSession, now: datetime, status: SessionStatus
) -> None:
    s.current_task_index += 1
    if s.current_task_index >= len(s.config["tasks"]):
        # The application keeps `stage1_in_progress` until scoring decides the gate (Phase 5).
        await _end(session, s, status, now)
    else:
        await _show_task(session, s, now)


async def sync_session(session: AsyncSession, s: InterviewSession) -> None:
    """For the sweep job: applies due limits when no browser is left to trigger them."""
    await _sync(session, s, _now())


async def _sync(session: AsyncSession, s: InterviewSession, now: datetime) -> None:
    """Applies everything time-based that is due. Called before every read or write of a session,
    so limits hold even when the candidate's browser is gone."""
    if s.status is not SessionStatus.in_progress:
        return
    if s.disconnected_at is not None:
        if (now - s.disconnected_at).total_seconds() > _limit(s, "reconnect_window_s"):
            await _end(
                session,
                s,
                SessionStatus.abandoned,
                now,
                ApplicationStatus.stage1_failed,
                "abandoned",
            )
            return
    elif s.last_activity_at is not None:
        idle = (now - s.last_activity_at).total_seconds()
        if idle >= _limit(s, "inactivity_limit_s"):
            await _disqualify(session, s, "inactivity", now, {"idle_s": round(idle)})
            return
    subs = await _submissions(session, s)
    while s.status is SessionStatus.in_progress:
        sub = subs.get(s.config["tasks"][s.current_task_index]["id"])
        if sub is None or now < _task_deadline(s, s.current_task_index, sub.shown_at):
            return
        sub.submitted_at = now  # time is up: the last draft is the answer
        await _advance(session, s, now, SessionStatus.expired)
        await session.flush()
        subs = await _submissions(session, s)


async def candidate_result(session: AsyncSession, s: InterviewSession) -> Stage1Result | None:
    """What the candidate may see: no hidden test names or inputs, no integrity data."""
    if s.status not in (SessionStatus.completed, SessionStatus.expired):
        return None
    if s.evaluation_state is not EvaluationState.done:
        return Stage1Result(state=s.evaluation_state.value)
    rows = await session.execute(
        select(CodeSubmission, Evaluation, PracticalTask)
        .join(PracticalTask, PracticalTask.id == CodeSubmission.task_id)
        .outerjoin(Evaluation, Evaluation.submission_id == CodeSubmission.id)
        .where(CodeSubmission.session_id == s.id)
    )
    order = [t["id"] for t in s.config["tasks"]]
    by_task = {str(sub.task_id): (sub, ev, t) for sub, ev, t in rows}
    tasks = []
    for task_id in order:
        if task_id not in by_task:
            continue
        sub, ev, t = by_task[task_id]
        hidden = sub.hidden_test_results or []
        tasks.append(
            Stage1TaskResult(
                title=t.title,
                hidden_passed=sum(1 for r in hidden if r.get("passed")),
                hidden_total=len(hidden),
                code_review_percent=ev.score if ev is not None else None,
                strengths=[x["text"] for x in ev.strengths] if ev is not None else [],
                weaknesses=[x["text"] for x in ev.weaknesses] if ev is not None else [],
            )
        )
    return Stage1Result(
        state=s.evaluation_state.value,
        score_percent=s.score_percent,
        pass_threshold=s.config.get("thresholds", {}).get("stage1", {}).get("pass_threshold"),
        passed=s.passed,
        tasks=tasks,
    )


async def _session_out(session: AsyncSession, s: InterviewSession, now: datetime) -> SessionOut:
    subs = await _submissions(session, s)
    entries = s.config["tasks"]
    rows = await session.scalars(
        select(PracticalTask).where(PracticalTask.id.in_([uuid.UUID(e["id"]) for e in entries]))
    )
    by_id = {str(t.id): t for t in rows}
    tasks: list[SessionTaskOut] = []
    for i, entry in enumerate(entries):
        sub = subs.get(entry["id"])
        if sub is None:
            tasks.append(SessionTaskOut(id=entry["id"], state="pending"))
            continue
        t = by_id[entry["id"]]
        tasks.append(
            SessionTaskOut(
                id=t.id,
                state="submitted" if sub.submitted_at else "current",
                title=t.title,
                statement=t.statement,
                allowed_languages=t.allowed_languages,
                starter_code=t.starter_code,
                visible_tests=[
                    VisibleTest(
                        name=c.get("name") or f"#{n + 1}",
                        input=c.get("input", ""),
                        output=c["output"],
                    )
                    for n, c in enumerate(t.visible_tests)
                ],
                deadline_at=_task_deadline(s, i, sub.shown_at),
                language=sub.language,
                code=sub.final_code,
                run_count=sub.run_count,
                last_results=[TestResult(**r) for r in sub.visible_test_results]
                if sub.visible_test_results
                else None,
            )
        )
    return SessionOut(
        id=s.id,
        application_id=s.application_id,
        stage=s.stage,
        status=s.status,
        disqualification_reason=s.disqualification_reason,
        started_at=s.started_at,
        expires_at=s.expires_at,
        completed_at=s.completed_at,
        server_now=now,
        last_activity_at=s.last_activity_at,
        current_task_index=s.current_task_index,
        tasks=tasks,
        integrity=IntegrityLimits(**s.config["integrity"]),
        language_labels=get_settings().sandbox_language_labels,
        result=await candidate_result(session, s),
    )


async def _blocked_reason(
    session: AsyncSession, app: Application, assessment: Assessment | None
) -> str | None:
    if app.status not in _STARTABLE:
        return "application_closed"
    if assessment is None or not (await to_out(session, assessment)).ready:
        return "assessment_not_ready"
    return None


async def state(session: AsyncSession, application_id: uuid.UUID, user: User) -> InterviewStateOut:
    now = _now()
    app = await _application(session, application_id, user)
    vacancy = await session.get(Vacancy, app.vacancy_id)
    assert vacancy is not None
    assessment = await session.scalar(select(Assessment).where(Assessment.vacancy_id == vacancy.id))
    s = await _stage1(session, app.id)
    if s is not None:
        await _sync(session, s, now)
        await session.commit()
    settings = get_settings()
    accepted = await session.scalar(
        select(RulesAcceptance.id).where(
            RulesAcceptance.application_id == app.id,
            RulesAcceptance.rules_version == settings.rules_version,
        )
    )
    warmup = None
    if assessment is not None:
        out = await to_out(session, assessment)
        allowed = out.tasks[0].allowed_languages if out.tasks else []
        languages = [lang for lang in allowed if lang in WARMUP_STARTER]
        if languages:
            warmup = WarmupOut(
                minutes=effective_thresholds(assessment).stage1.warmup_minutes,
                languages=languages,
                language_labels=settings.sandbox_language_labels,
                starter_code={lang: WARMUP_STARTER[lang] for lang in languages},
                visible_tests=WARMUP_TESTS,
            )
    return InterviewStateOut(
        application_id=app.id,
        application_status=app.status,
        vacancy_id=vacancy.id,
        vacancy_title=vacancy.title,
        language=assessment.language if assessment else None,
        rules_version=settings.rules_version,
        rules_accepted=accepted is not None,
        blocked_reason=None if s is not None else await _blocked_reason(session, app, assessment),
        warmup=warmup,
        session=await _session_out(session, s, now) if s is not None else None,
    )


async def accept_rules(
    session: AsyncSession,
    application_id: uuid.UUID,
    user: User,
    rules_version: str,
    ip: str | None,
    user_agent: str | None,
) -> InterviewStateOut:
    app = await _application(session, application_id, user)
    if rules_version != get_settings().rules_version:
        raise AppError("rules_version_mismatch", "The rules have changed, read them again", 409)
    await session.execute(
        insert(RulesAcceptance)
        .values(
            id=uuid.uuid4(),
            application_id=app.id,
            rules_version=rules_version,
            accepted_at=_now(),
            ip=ip,
            user_agent=(user_agent or "")[:500] or None,
        )
        .on_conflict_do_nothing()
    )
    audit.record(session, user.id, "interview.rules_accept", "application", app.id)
    await session.commit()
    return await state(session, application_id, user)


async def start_stage1(session: AsyncSession, application_id: uuid.UUID, user: User) -> SessionOut:
    now = _now()
    await _application(session, application_id, user)
    app = await session.scalar(
        select(Application).where(Application.id == application_id).with_for_update()
    )
    assert app is not None
    existing = await _stage1(session, app.id)
    if existing is not None:
        await _sync(session, existing, now)
        await session.commit()
        return await _session_out(session, existing, now)
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
    blocked = await _blocked_reason(session, app, assessment)
    if blocked is not None or assessment is None:
        raise AppError(blocked or "assessment_not_ready", "This interview cannot be started", 409)
    thresholds = effective_thresholds(assessment)
    override = assessment.stage1_config.get("duration_minutes")
    rows = await session.scalars(
        select(PracticalTask).where(
            PracticalTask.id.in_([uuid.UUID(str(i)) for i in assessment.stage1_config["task_ids"]])
        )
    )
    by_id = {str(t.id): t for t in rows}
    tasks = [
        {"id": str(i), "limit_minutes": override or by_id[str(i)].time_limit_minutes}
        for i in assessment.stage1_config["task_ids"]
    ]
    i = thresholds.integrity
    s = InterviewSession(
        application_id=app.id,
        stage=InterviewStage.stage1,
        status=SessionStatus.in_progress,
        started_at=now,
        expires_at=now + timedelta(minutes=sum(int(str(t["limit_minutes"])) for t in tasks)),
        # No socket yet: the inactivity timer waits and the reconnect window runs.
        disconnected_at=now,
        last_activity_at=now,
        config={
            "tasks": tasks,
            "rules_version": version,
            "thresholds": thresholds.model_dump(mode="json"),
            "integrity": IntegrityLimits(
                paste_max_lines=i.paste_max_lines,
                paste_max_chars=i.paste_max_chars,
                inactivity_warning_s=i.inactivity_warning_s,
                inactivity_limit_s=i.inactivity_limit_s,
                reconnect_window_s=i.reconnect_window_s,
            ).model_dump(),
        },
    )
    session.add(s)
    await session.flush()
    await _show_task(session, s, now)
    app.status = ApplicationStatus.stage1_in_progress
    audit.record(session, user.id, "interview.stage1_start", "interview_session", s.id)
    await session.commit()
    return await _session_out(session, s, now)


async def get_session(session: AsyncSession, session_id: uuid.UUID, user: User) -> SessionOut:
    now = _now()
    s = await _own_session(session, session_id, user, lock=True)
    await _sync(session, s, now)
    await session.commit()
    return await _session_out(session, s, now)


async def _current(
    session: AsyncSession, s: InterviewSession, task_id: uuid.UUID, language: str, now: datetime
) -> tuple[CodeSubmission, PracticalTask]:
    await _sync(session, s, now)
    if s.status is not SessionStatus.in_progress:
        await session.commit()
        raise AppError("session_not_active", "This interview stage has ended", 409)
    if s.config["tasks"][s.current_task_index]["id"] != str(task_id):
        await session.commit()
        raise AppError("task_not_current", "This task is not the current one", 409)
    sub = await session.scalar(
        select(CodeSubmission).where(
            CodeSubmission.session_id == s.id, CodeSubmission.task_id == task_id
        )
    )
    task = await session.get(PracticalTask, task_id)
    assert sub is not None and task is not None
    if language not in task.allowed_languages:
        raise AppError("language_not_allowed", "This language is not allowed for the task", 422)
    return sub, task


def _results(outcomes: list[Any]) -> list[TestResult]:
    return [
        TestResult(
            name=o.name,
            passed=o.passed,
            status=o.status,
            stdout=o.stdout,
            stderr=o.stderr,
            time_ms=o.time_ms,
        )
        for o in outcomes
    ]


async def run_visible(
    session: AsyncSession,
    session_id: uuid.UUID,
    task_id: uuid.UUID,
    user: User,
    data: CodeIn,
    sandbox: Sandbox,
) -> RunOut:
    now = _now()
    s = await _own_session(session, session_id, user, lock=True)
    sub, task = await _current(session, s, task_id, data.language, now)
    sub.language, sub.final_code = data.language, data.code
    sub.run_count += 1
    s.last_activity_at = now
    s.server_seq += 1
    assert s.started_at is not None
    session.add(
        EditorEvent(
            session_id=s.id,
            task_id=task_id,
            seq=-s.server_seq,
            t_ms=int((now - s.started_at).total_seconds() * 1000),
            type=EditorEventType.run,
            payload={"language": data.language, "run": sub.run_count},
        )
    )
    limits = Limits(task.cpu_time_limit_s, task.memory_limit_mb)
    tests = task.visible_tests
    sub_id = sub.id
    await session.commit()  # no row lock or transaction is held while the sandbox runs
    results = _results(await run_tests(sandbox, data.language, data.code, tests, limits))
    if any(r.status == "unavailable" for r in results):
        raise AppError("sandbox_unavailable", "Code execution is unavailable, try again", 503)
    stored = await session.get(CodeSubmission, sub_id)
    assert stored is not None
    stored.visible_test_results = [r.model_dump() for r in results]
    await session.commit()
    return RunOut(results=results)


async def submit_task(
    session: AsyncSession, session_id: uuid.UUID, task_id: uuid.UUID, user: User, data: CodeIn
) -> SessionOut:
    now = _now()
    s = await _own_session(session, session_id, user, lock=True)
    sub, _ = await _current(session, s, task_id, data.language, now)
    sub.language, sub.final_code, sub.submitted_at = data.language, data.code, now
    await _advance(session, s, now, SessionStatus.completed)
    audit.record(session, user.id, "interview.task_submit", "interview_session", s.id)
    await session.commit()
    return await _session_out(session, s, now)


async def run_warmup(
    session: AsyncSession, application_id: uuid.UUID, user: User, data: CodeIn, sandbox: Sandbox
) -> RunOut:
    """Not scored and not recorded."""
    await _application(session, application_id, user)
    if data.language not in WARMUP_STARTER:
        raise AppError("language_not_allowed", "This language is not available for warm-up", 422)
    tests = [t.model_dump() for t in WARMUP_TESTS]
    await session.commit()
    results = _results(await run_tests(sandbox, data.language, data.code, tests, Limits()))
    if any(r.status == "unavailable" for r in results):
        raise AppError("sandbox_unavailable", "Code execution is unavailable, try again", 503)
    return RunOut(results=results)


# ------------------------------------------------------------------ WebSocket side


def _update(s: InterviewSession, now: datetime, ack_seq: int = 0) -> SocketUpdate:
    inactive = (
        int((now - s.last_activity_at).total_seconds())
        if s.last_activity_at and s.status is SessionStatus.in_progress
        else 0
    )
    return SocketUpdate(
        s.status,
        s.disqualification_reason,
        s.current_task_index,
        inactive,
        _limit(s, "inactivity_warning_s"),
        _limit(s, "inactivity_limit_s"),
        ack_seq,
    )


async def connect(
    session: AsyncSession,
    session_id: uuid.UUID,
    user: User,
    connection_id: uuid.UUID,
    page: int | None,
) -> tuple[SocketUpdate, int]:
    """A reconnect names its page; a freshly loaded page gets the next number (D-090)."""
    now = _now()
    s = await _own_session(session, session_id, user, lock=True)
    await _sync(session, s, now)
    if s.status is SessionStatus.in_progress and s.disconnected_at is not None:
        # A disconnect never counts as inactivity: the timer resumes where it stopped.
        assert s.last_activity_at is not None
        s.last_activity_at += now - s.disconnected_at
        s.disconnected_at = None
    s.connection_id = connection_id  # the newest tab wins; older sockets see this and close
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
    s = await _own_session(session, session_id, user, lock=True)
    await _sync(session, s, now)
    await session.commit()
    return _update(s, now)


def _over_limit(s: InterviewSession, lines: int, chars: int) -> bool:
    return lines > _limit(s, "paste_max_lines") or chars > _limit(s, "paste_max_chars")


def _size(text: str) -> tuple[int, int]:
    return text.count("\n") + 1, len(text)


def _int(value: Any) -> int:
    return value if isinstance(value, int) and value >= 0 else 0


async def _external_text(
    session: AsyncSession, s: InterviewSession, e: ClientEvent, now: datetime
) -> bool:
    """True when this event ended the stage. The rule (§7.1) lives here, not in the browser."""
    if e.type is EditorEventType.paste_external_blocked:
        lines, chars = _int(e.payload.get("lines")), _int(e.payload.get("length"))
        kind = "paste_external"
    elif e.type in (EditorEventType.insert, EditorEventType.replace):
        if e.payload.get("source") in _TRUSTED_INSERT_SOURCES:
            return False
        lines, chars = _size(str(e.payload.get("text", "")))
        if not _over_limit(s, lines, chars):
            return False
        kind = "external_insertion"
    elif e.type is EditorEventType.paste_internal:
        # "Internal" must match something copied in this session, or the client is wrong about it.
        text = str(e.payload.get("text", ""))
        copied = await session.scalar(
            select(EditorEvent.id)
            .where(
                EditorEvent.session_id == s.id,
                EditorEvent.type == EditorEventType.copy,
                EditorEvent.payload["text"].astext == text,
            )
            .limit(1)
        )
        if copied is not None:
            return False
        lines, chars = _size(text)
        kind = "unverified_internal_paste"
    else:
        return False
    evidence = {"lines": lines, "chars": chars, "kind": kind}
    if _over_limit(s, lines, chars):
        await _disqualify(session, s, "external_paste", now, evidence)
        return True
    session.add(
        IntegritySignal(
            session_id=s.id,
            stage=s.stage,
            type=kind,
            severity=SignalSeverity.low,
            evidence=evidence,
        )
    )
    return False


async def apply_events(
    session: AsyncSession, session_id: uuid.UUID, user: User, batch: EventBatch, page: int
) -> SocketUpdate:
    now = _now()
    s = await _own_session(session, session_id, user, lock=True)
    await _sync(session, s, now)
    ack = max((e.seq for e in batch.events), default=0)
    if s.status is not SessionStatus.in_progress:
        await session.commit()
        return _update(s, now, ack)
    assert s.started_at is not None
    elapsed = int((now - s.started_at).total_seconds() * 1000)
    task_ids = {t["id"] for t in s.config["tasks"]}
    for e in sorted(batch.events, key=lambda e: e.seq):
        if e.task_id is not None and str(e.task_id) not in task_ids:
            continue
        if e.type is EditorEventType.run:
            continue  # `run` is written by the server when the run really happens
        # Keep the client's spacing between events, on the server's clock (§6.1).
        t_ms = min(max(elapsed - max(batch.sent_t_ms - e.t_ms, 0), 0), elapsed)
        inserted = await session.scalar(
            insert(EditorEvent)
            .values(
                session_id=s.id,
                task_id=e.task_id,
                seq=page * PAGE_SEQ + e.seq,
                t_ms=t_ms,
                type=e.type,
                payload=e.payload,
            )
            .on_conflict_do_nothing()
            .returning(EditorEvent.id)
        )
        if inserted is None:
            continue  # resent after a reconnect
        if e.type in _ACTIVITY:
            s.last_activity_at = now
        if await _external_text(session, s, e, now):
            break
    await session.commit()
    return _update(s, now, ack)


async def save_draft(
    session: AsyncSession, session_id: uuid.UUID, user: User, task_id: uuid.UUID, data: CodeIn
) -> None:
    now = _now()
    s = await _own_session(session, session_id, user, lock=True)
    try:
        sub, _ = await _current(session, s, task_id, data.language, now)
    except AppError:
        await session.rollback()
        return  # a late draft for a finished task is simply dropped
    sub.language, sub.final_code = data.language, data.code
    await session.commit()
