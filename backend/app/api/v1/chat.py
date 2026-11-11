import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import CurrentUser, DbSession
from app.core.config import get_settings
from app.core.errors import AppError
from app.core.rate_limit import RateLimiter, get_rate_limiter
from app.schemas.chat import MessageIn, MessageOut, MessagePage, ReadIn, ThreadPage
from app.services import chat

router = APIRouter(prefix="/chat", tags=["chat"])


@router.get("/threads", response_model=ThreadPage)
async def threads(
    user: CurrentUser,
    session: DbSession,
    company_id: uuid.UUID | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 20,
) -> ThreadPage:
    return await chat.threads(session, user, company_id, page, page_size)


@router.get("/threads/{application_id}/messages", response_model=MessagePage)
async def messages(
    application_id: uuid.UUID,
    user: CurrentUser,
    session: DbSession,
    before: Annotated[int | None, Query(ge=1)] = None,
    after: Annotated[int | None, Query(ge=0)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> MessagePage:
    if before is not None and after is not None:
        raise AppError("validation_error", "Choose before or after", 422)
    return await chat.messages(session, user, application_id, before, after, limit)


@router.post("/threads/{application_id}/messages", response_model=MessageOut, status_code=201)
async def send(
    application_id: uuid.UUID,
    data: MessageIn,
    user: CurrentUser,
    session: DbSession,
    limiter: Annotated[RateLimiter, Depends(get_rate_limiter)],
) -> MessageOut:
    await limiter.check("chat-send", str(user.id), get_settings().rate_limit_chat)
    return await chat.send(session, user, application_id, data)


@router.post("/threads/{application_id}/read", status_code=204)
async def mark_read(
    application_id: uuid.UUID, data: ReadIn, user: CurrentUser, session: DbSession
) -> None:
    await chat.mark_read(session, user, application_id, data.through_sequence)
