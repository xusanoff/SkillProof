"""Telegram Bot API client. No token configured means the channel is off."""

import logging
from functools import lru_cache
from typing import Protocol

import httpx

from app.core.config import get_settings

# httpx logs each request URL at INFO, and a Bot API URL contains the token.
logging.getLogger("httpx").setLevel(logging.WARNING)

_TIMEOUT_S = 10.0


class TelegramError(Exception):
    """`permanent`: retrying cannot help. `blocked`: the person stopped the bot."""

    def __init__(self, *, permanent: bool, blocked: bool = False) -> None:
        super().__init__(f"telegram error (permanent={permanent}, blocked={blocked})")
        self.permanent = permanent
        self.blocked = blocked


class TelegramSender(Protocol):
    async def send(self, chat_id: int, text: str) -> None: ...


class TelegramBot:
    def __init__(self, token: str) -> None:
        self._url = f"https://api.telegram.org/bot{token}/sendMessage"

    async def send(self, chat_id: int, text: str) -> None:
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT_S) as client:
                r = await client.post(
                    self._url,
                    # Plain text, no parse_mode: vacancy titles are written by users.
                    json={"chat_id": chat_id, "text": text, "disable_web_page_preview": True},
                )
        except httpx.HTTPError:
            # `from None`: the original exception can quote the URL, and so the token.
            raise TelegramError(permanent=False) from None
        if r.status_code == 403:
            raise TelegramError(permanent=True, blocked=True)
        if r.status_code == 429 or r.status_code >= 500:
            raise TelegramError(permanent=False)
        if r.status_code >= 400:
            raise TelegramError(permanent=True)


@lru_cache
def _bot(token: str) -> TelegramBot:
    return TelegramBot(token)


def get_telegram_sender() -> TelegramSender | None:
    token = get_settings().telegram_bot_token
    return _bot(token.get_secret_value()) if token is not None else None
