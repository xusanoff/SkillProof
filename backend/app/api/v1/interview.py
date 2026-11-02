import asyncio
import json
import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, WebSocket, WebSocketDisconnect, status
from pydantic import ValidationError

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
)
from app.services import interview, stage1_report
from app.services.interview import SocketUpdate

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
    application_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> SessionOut:
    return await interview.start_stage1(session, application_id, user)


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


@router.websocket("/interview-sessions/{session_id}/events")
async def events_socket(ws: WebSocket, session_id: uuid.UUID) -> None:
    """Telemetry channel (spec §6.1). A cookie travels with any cross-site handshake, so the
    Origin check is what stops another site from opening this socket as the candidate."""
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
            update, page = await interview.connect(
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
                    if not await interview.is_current_connection(
                        session, session_id, connection_id
                    ):
                        await ws.close(code=4409)  # the session continued in a newer tab
                        return
                    update = await interview.tick(session, session_id, user)
                await ws.send_json(_message(update))
                continue
            try:
                reply = await _handle(session_id, user, raw, page)
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
            await interview.disconnect(session, session_id, connection_id)
