import contextlib
import hmac
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Response, status

from app.api.deps import CurrentUser, DbSession
from app.core.config import get_settings
from app.core.errors import AppError
from app.schemas.auth import TelegramLink, TelegramUpdate
from app.services import auth as auth_service
from app.services.notifications import TELEGRAM_LINKED
from app.services.telegram import TelegramError, TelegramSender, get_telegram_sender

router = APIRouter(tags=["notifications"])

Telegram = Annotated[TelegramSender | None, Depends(get_telegram_sender)]


@router.post("/auth/me/telegram", response_model=TelegramLink)
async def create_link(user: CurrentUser, session: DbSession, telegram: Telegram) -> TelegramLink:
    if telegram is None:
        raise AppError("telegram_unavailable", "Telegram notifications are not set up", 503)
    return TelegramLink(url=await auth_service.telegram_link_url(session, user))


@router.delete("/auth/me/telegram", status_code=status.HTTP_204_NO_CONTENT)
async def unlink(user: CurrentUser, session: DbSession) -> Response:
    await auth_service.telegram_unlink(session, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/telegram/webhook", status_code=status.HTTP_204_NO_CONTENT)
async def webhook(
    update: TelegramUpdate,
    session: DbSession,
    telegram: Telegram,
    secret: Annotated[str, Header(alias="X-Telegram-Bot-Api-Secret-Token")] = "",
) -> Response:
    expected = get_settings().telegram_webhook_secret
    if (
        telegram is None
        or expected is None
        or not hmac.compare_digest(secret.encode(), expected.get_secret_value().encode())
    ):
        raise AppError("not_found", "Not found", 404)
    message = update.message
    parts = (message.text or "").split() if message is not None else []
    # Only private chats: a link used in a group would send one person's news to everyone there.
    if (
        message is not None
        and message.chat.type == "private"
        and len(parts) == 2
        and parts[0] == "/start"
    ):
        user = await auth_service.telegram_confirm(session, parts[1], message.chat.id)
        if user is not None:
            text = TELEGRAM_LINKED.get(user.locale, TELEGRAM_LINKED["uz"])
            # The link is made; the confirmation is only a courtesy.
            with contextlib.suppress(TelegramError):
                await telegram.send(message.chat.id, text)
    # Anything else gets a success too, or Telegram would keep redelivering it.
    return Response(status_code=status.HTTP_204_NO_CONTENT)
