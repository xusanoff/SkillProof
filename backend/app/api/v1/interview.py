import asyncio
import json
import uuid
from collections.abc import Awaitable, Callable
from typing import Annotated, Any, Protocol, cast

from fastapi import (
    APIRouter,
    Depends,
    Form,
    Request,
    Response,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.llm_client import LLMClient, get_llm_client
from app.ai.speech import STTProvider, TTSProvider, get_stt, get_tts
from app.api.deps import ACCESS_COOKIE, CurrentUser, DbSession, client_ip
from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.errors import NotFoundError
from app.core.rate_limit import RateLimiter, get_rate_limiter
from app.core.security import decode_access_token
from app.models import User
from app.models.enums import SessionStatus
from app.sandbox.client import Sandbox, get_sandbox
from app.schemas.interview import (
    CodeIn,
    EventBatch,
    HrStage1Report,
    InterviewStateOut,
    ReplayOut,
    RulesAcceptIn,
    RunOut,
    SessionOut,
    Stage2SessionOut,
)
from app.schemas.report import CandidateResults, HrReport, NoteIn, NoteOut, OverrideIn
from app.schemas.verified_skill import StartStage1In
from app.services import interview, reports, stage1_report, stage2
from app.services.interview import SocketUpdate
from app.services.storage import Storage, get_storage

router = APIRouter(tags=["interview"])


def sandbox_dep() -> Sandbox:
    return get_sandbox()


SandboxDep = Annotated[Sandbox, Depends(sandbox_dep)]
LimiterDep = Annotated[RateLimiter, Depends(get_rate_limiter)]


@router.get("/applications/{application_id}/interview", response_model=InterviewStateOut)
async def get_state(
    application_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> InterviewStateOut:
    return await interview.state(session, application_id, user)


@router.post("/applications/{application_id}/interview/rules", response_model=InterviewStateOut)
async def accept_rules(
    application_id: uuid.UUID,
    data: RulesAcceptIn,
    request: Request,
    user: CurrentUser,
    session: DbSession,
) -> InterviewStateOut:
    return await interview.accept_rules(
        session,
        application_id,
        user,
        data.rules_version,
        client_ip(request),
        request.headers.get("user-agent"),
    )


@router.post("/applications/{application_id}/interview/warmup/run", response_model=RunOut)
async def run_warmup(
    application_id: uuid.UUID,
    data: CodeIn,
    user: CurrentUser,
    session: DbSession,
    sandbox: SandboxDep,
    limiter: LimiterDep,
) -> RunOut:
    await limiter.check("sandbox-run", str(user.id), get_settings().rate_limit_sandbox_run)
    return await interview.run_warmup(session, application_id, user, data, sandbox)


@router.post(
    "/applications/{application_id}/interview/stage1",
    response_model=SessionOut,
    status_code=status.HTTP_201_CREATED,
)
async def start_stage1(
    application_id: uuid.UUID,
    user: CurrentUser,
    session: DbSession,
    data: StartStage1In | None = None,
) -> SessionOut:
    return await interview.start_stage1(session, application_id, user, bool(data and data.reuse))


@router.get("/interview-sessions/{session_id}", response_model=SessionOut)
async def get_session(session_id: uuid.UUID, user: CurrentUser, session: DbSession) -> SessionOut:
    return await interview.get_session(session, session_id, user)


@router.post("/interview-sessions/{session_id}/tasks/{task_id}/run", response_model=RunOut)
async def run_visible(
    session_id: uuid.UUID,
    task_id: uuid.UUID,
    data: CodeIn,
    user: CurrentUser,
    session: DbSession,
    sandbox: SandboxDep,
    limiter: LimiterDep,
) -> RunOut:
    await limiter.check("sandbox-run", str(user.id), get_settings().rate_limit_sandbox_run)
    return await interview.run_visible(session, session_id, task_id, user, data, sandbox)


@router.post("/interview-sessions/{session_id}/tasks/{task_id}/submit", response_model=SessionOut)
async def submit_task(
    session_id: uuid.UUID, task_id: uuid.UUID, data: CodeIn, user: CurrentUser, session: DbSession
) -> SessionOut:
    return await interview.submit_task(session, session_id, task_id, user, data)


@router.get(
    "/companies/{company_id}/applications/{application_id}/stage1", response_model=HrStage1Report
)
async def hr_stage1_report(
    company_id: uuid.UUID, application_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> HrStage1Report:
    return await stage1_report.report(session, company_id, application_id, user)


@router.get(
    "/companies/{company_id}/applications/{application_id}/stage1/replay/{task_id}",
    response_model=ReplayOut,
)
async def hr_stage1_replay(
    company_id: uuid.UUID,
    application_id: uuid.UUID,
    task_id: uuid.UUID,
    user: CurrentUser,
    session: DbSession,
) -> ReplayOut:
    return await stage1_report.replay(session, company_id, application_id, task_id, user)


@router.get("/companies/{company_id}/applications/{application_id}/report", response_model=HrReport)
async def hr_report(
    company_id: uuid.UUID, application_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> HrReport:
    return await reports.hr_report(session, company_id, application_id, user)


@router.post(
    "/companies/{company_id}/applications/{application_id}/overrides", response_model=HrReport
)
async def hr_override(
    company_id: uuid.UUID,
    application_id: uuid.UUID,
    data: OverrideIn,
    user: CurrentUser,
    session: DbSession,
) -> HrReport:
    return await reports.override(session, company_id, application_id, user, data)


@router.get(
    "/companies/{company_id}/applications/{application_id}/notes", response_model=list[NoteOut]
)
async def hr_notes(
    company_id: uuid.UUID, application_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> list[NoteOut]:
    return await reports.list_notes(session, company_id, application_id, user)


@router.post(
    "/companies/{company_id}/applications/{application_id}/notes",
    response_model=NoteOut,
    status_code=201,
)
async def hr_add_note(
    company_id: uuid.UUID,
    application_id: uuid.UUID,
    data: NoteIn,
    user: CurrentUser,
    session: DbSession,
) -> NoteOut:
    return await reports.add_note(session, company_id, application_id, user, data.text)


@router.get("/applications/{application_id}/results", response_model=CandidateResults)
async def candidate_results(
    application_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> CandidateResults:
    return await reports.candidate_results(session, application_id, user)


def llm_dep() -> LLMClient:
    return get_llm_client()


def stt_dep() -> STTProvider:
    return get_stt()


def tts_dep() -> TTSProvider:
    return get_tts()


LlmDep = Annotated[LLMClient, Depends(llm_dep)]
SttDep = Annotated[STTProvider, Depends(stt_dep)]
TtsDep = Annotated[TTSProvider, Depends(tts_dep)]
StorageDep = Annotated[Storage, Depends(get_storage)]


@router.post(
    "/applications/{application_id}/interview/stage2/start",
    response_model=Stage2SessionOut,
    status_code=status.HTTP_201_CREATED,
)
async def start_stage2(
    application_id: uuid.UUID,
    user: CurrentUser,
    session: DbSession,
    llm: LlmDep,
    tts: TtsDep,
    storage: StorageDep,
) -> Stage2SessionOut:
    return await stage2.start(session, application_id, user, llm, tts, storage)


@router.get("/interview-sessions/{session_id}/stage2", response_model=Stage2SessionOut)
async def get_stage2(
    session_id: uuid.UUID,
    user: CurrentUser,
    session: DbSession,
    llm: LlmDep,
    tts: TtsDep,
    storage: StorageDep,
) -> Stage2SessionOut:
    """Also resumes: if the last answer has no next question yet, this builds it."""
    return await stage2.get_state(session, session_id, user, llm, tts, storage)


@router.post(
    "/interview-sessions/{session_id}/stage2/turns/{turn_id}/answer",
    response_model=Stage2SessionOut,
)
async def answer_turn(
    session_id: uuid.UUID,
    turn_id: uuid.UUID,
    user: CurrentUser,
    session: DbSession,
    llm: LlmDep,
    stt: SttDep,
    tts: TtsDep,
    storage: StorageDep,
    text: Annotated[str | None, Form()] = None,
    transcript_hint: Annotated[str | None, Form()] = None,
    silence_ms: Annotated[int | None, Form(ge=0)] = None,
    audio: UploadFile | None = None,
) -> Stage2SessionOut:
    # Read one byte past the limit so oversize files are rejected without buffering them fully.
    data = await audio.read(get_settings().interview_audio_max_bytes + 1) if audio else None
    return await stage2.answer(
        session,
        session_id,
        turn_id,
        user,
        stage2.AnswerIn(text, data, transcript_hint, silence_ms),
        llm,
        stt,
        tts,
        storage,
    )


@router.get(
    "/interview-sessions/{session_id}/stage2/turns/{turn_id}/question-audio",
    response_class=Response,
)
async def question_audio(
    session_id: uuid.UUID,
    turn_id: uuid.UUID,
    user: CurrentUser,
    session: DbSession,
    storage: StorageDep,
) -> Response:
    data, kind = await stage2.question_audio(session, session_id, turn_id, user, storage)
    return Response(data, media_type=kind, headers={"Cache-Control": "private, no-store"})


@router.get(
    "/companies/{company_id}/applications/{application_id}/stage2/turns/{turn_id}/answer-audio",
    response_class=Response,
)
async def hr_answer_audio(
    company_id: uuid.UUID,
    application_id: uuid.UUID,
    turn_id: uuid.UUID,
    user: CurrentUser,
    session: DbSession,
    storage: StorageDep,
) -> Response:
    data, kind = await reports.answer_audio(
        session, company_id, application_id, turn_id, user, storage
    )
    return Response(data, media_type=kind, headers={"Cache-Control": "private, no-store"})


@router.post(
    "/interview-sessions/{session_id}/stage2/fallback-text", response_model=Stage2SessionOut
)
async def fall_back_to_text(
    session_id: uuid.UUID,
    user: CurrentUser,
    session: DbSession,
    llm: LlmDep,
    tts: TtsDep,
    storage: StorageDep,
) -> Stage2SessionOut:
    return await stage2.fall_back_to_text(session, session_id, user, llm, tts, storage)


def _message(update: SocketUpdate) -> dict[str, Any]:
    return {
        "type": "state",
        "status": update.status.value,
        "reason": update.reason,
        "current_task_index": update.current_task_index,
        "inactive_s": update.inactive_s,
        "warning_s": update.warning_s,
        "limit_s": update.limit_s,
        "ack_seq": update.ack_seq,
    }


def _page_param(ws: WebSocket) -> int | None:
    raw = ws.query_params.get("page", "")
    return int(raw) if raw.isdecimal() else None


async def _socket_user(ws: WebSocket) -> User | None:
    token = ws.cookies.get(ACCESS_COOKIE)
    user_id = decode_access_token(token) if token else None
    if user_id is None:
        return None
    async with SessionLocal() as session:
        user = await session.get(User, user_id)
    return user if user is not None and user.is_active else None


async def _handle(session_id: uuid.UUID, user: User, raw: str, page: int) -> dict[str, Any]:
    message = json.loads(raw)
    kind = message.get("type") if isinstance(message, dict) else None
    async with SessionLocal() as session:
        if kind == "events":
            batch = EventBatch.model_validate(message)
            return _message(await interview.apply_events(session, session_id, user, batch, page))
        if kind == "draft":
            await interview.save_draft(
                session,
                session_id,
                user,
                uuid.UUID(str(message.get("task_id"))),
                CodeIn.model_validate(message),
            )
            return _message(await interview.tick(session, session_id, user))
    raise ValueError("unknown message type")


class _SocketOps(Protocol):
    async def connect(
        self,
        session: AsyncSession,
        session_id: uuid.UUID,
        user: User,
        connection_id: uuid.UUID,
        page: int | None,
    ) -> tuple[SocketUpdate, int]: ...

    async def disconnect(
        self, session: AsyncSession, session_id: uuid.UUID, connection_id: uuid.UUID
    ) -> None: ...

    async def is_current_connection(
        self, session: AsyncSession, session_id: uuid.UUID, connection_id: uuid.UUID
    ) -> bool: ...

    async def tick(
        self, session: AsyncSession, session_id: uuid.UUID, user: User
    ) -> SocketUpdate: ...


async def _serve_socket(
    ws: WebSocket,
    session_id: uuid.UUID,
    ops: _SocketOps,
    handle: Callable[[uuid.UUID, User, str, int], Awaitable[dict[str, Any]]],
) -> None:
    """A cookie travels with any cross-site handshake, so the Origin check is what stops another
    site from opening this socket as the candidate."""
    settings = get_settings()
    if ws.headers.get("origin") not in settings.cors_origins:
        await ws.close(code=4403)
        return
    user = await _socket_user(ws)
    if user is None:
        await ws.close(code=4401)
        return
    connection_id = uuid.uuid4()
    try:
        async with SessionLocal() as session:
            update, page = await ops.connect(
                session, session_id, user, connection_id, _page_param(ws)
            )
    except NotFoundError:
        await ws.close(code=4404)
        return
    await ws.accept()
    try:
        await ws.send_json({**_message(update), "page": page})
        while update.status is SessionStatus.in_progress:
            try:
                raw = await asyncio.wait_for(ws.receive_text(), settings.interview_ws_tick_s)
            except TimeoutError:
                raw = None
            if raw is not None and len(raw) > settings.interview_ws_max_message_bytes:
                await ws.close(code=1009)
                return
            if raw is None:
                async with SessionLocal() as session:
                    if not await ops.is_current_connection(session, session_id, connection_id):
                        await ws.close(code=4409)  # the session continued in a newer tab
                        return
                    update = await ops.tick(session, session_id, user)
                await ws.send_json(_message(update))
                continue
            try:
                reply = await handle(session_id, user, raw, page)
            except (ValueError, ValidationError):
                await ws.send_json({"type": "error", "code": "invalid_message"})
                continue
            update = SocketUpdate(
                SessionStatus(reply["status"]),
                reply["reason"],
                reply["current_task_index"],
                reply["inactive_s"],
                reply["warning_s"],
                reply["limit_s"],
                reply["ack_seq"],
            )
            await ws.send_json(reply)
        await ws.close(code=1000)
    except WebSocketDisconnect:
        pass
    finally:
        async with SessionLocal() as session:
            await ops.disconnect(session, session_id, connection_id)


@router.websocket("/interview-sessions/{session_id}/events")
async def events_socket(ws: WebSocket, session_id: uuid.UUID) -> None:
    """Stage 1 telemetry channel (spec §6.1)."""
    await _serve_socket(ws, session_id, cast(_SocketOps, interview), _handle)


async def _handle_stage2(session_id: uuid.UUID, user: User, raw: str, page: int) -> dict[str, Any]:
    message = json.loads(raw)
    if not isinstance(message, dict) or message.get("type") != "events":
        raise ValueError("unknown message type")
    batch = EventBatch.model_validate(message)
    async with SessionLocal() as session:
        return _message(await stage2.apply_events(session, session_id, user, batch, page))


@router.websocket("/interview-sessions/{session_id}/stage2/events")
async def stage2_events_socket(ws: WebSocket, session_id: uuid.UUID) -> None:
    """Stage 2 channel: activity (VAD, typing), playback end, focus events (spec §7.1b, §7.3)."""
    await _serve_socket(ws, session_id, cast(_SocketOps, stage2), _handle_stage2)
