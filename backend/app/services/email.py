"""Outgoing email. Locally the console backend logs the message (spec Phase 1)."""

import asyncio
import email.message
import logging
import smtplib
import ssl
from dataclasses import dataclass
from functools import lru_cache
from typing import Protocol

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_TEMPLATES: dict[str, dict[str, tuple[str, str]]] = {
    "verify_email": {
        "uz": ("Elektron pochtangizni tasdiqlang", "Tasdiqlash uchun havolani oching: {link}"),
        "ru": ("Подтвердите электронную почту", "Откройте ссылку для подтверждения: {link}"),
        "en": ("Confirm your email", "Open this link to confirm your email: {link}"),
    },
    "reset_password": {
        "uz": ("Parolni tiklash", "Yangi parol o'rnatish uchun havola: {link}"),
        "ru": ("Сброс пароля", "Ссылка для установки нового пароля: {link}"),
        "en": ("Reset your password", "Use this link to set a new password: {link}"),
    },
    "company_invitation": {
        "uz": ("{company} jamoasiga taklif", "{company} sizni HR sifatida taklif qildi: {link}"),
        "ru": ("Приглашение в {company}", "{company} приглашает вас как HR: {link}"),
        "en": ("Invitation to {company}", "{company} invited you to join as HR: {link}"),
    },
}


@dataclass(frozen=True)
class EmailMessage:
    to: str
    subject: str
    body: str
    template: str


class EmailSender(Protocol):
    async def send(self, message: EmailMessage) -> None: ...


class ConsoleEmailSender:
    def __init__(self) -> None:
        self.outbox: list[EmailMessage] = []

    async def send(self, message: EmailMessage) -> None:
        self.outbox.append(message)
        logger.info(
            "email_sent",
            extra={"to": message.to, "subject": message.subject, "body": message.body},
        )


def render(template: str, locale: str, to: str, **params: str) -> EmailMessage:
    variants = _TEMPLATES[template]
    subject, body = variants.get(locale, variants["uz"])
    return EmailMessage(to, subject.format(**params), body.format(**params), template)


class SmtpEmailSender:
    """Blocking smtplib in a thread: the volume is low and it needs no new dependency."""

    _TIMEOUT_S = 15

    def __init__(
        self, host: str, port: int, sender: str, username: str | None, password: str | None
    ) -> None:
        self._host, self._port, self._from = host, port, sender
        self._username, self._password = username, password

    def _deliver(self, message: EmailMessage) -> None:
        mail = email.message.EmailMessage()
        mail["From"], mail["To"] = self._from, message.to
        mail["Subject"] = message.subject  # raises on a line break, so no header injection
        mail.set_content(message.body)
        with smtplib.SMTP(self._host, self._port, timeout=self._TIMEOUT_S) as smtp:
            smtp.starttls(context=ssl.create_default_context())
            if self._username and self._password:
                smtp.login(self._username, self._password)
            smtp.send_message(mail)

    async def send(self, message: EmailMessage) -> None:
        await asyncio.to_thread(self._deliver, message)


async def send_best_effort(sender: EmailSender, message: EmailMessage) -> None:
    """For requests where the person can ask again: a mail outage must not become a 500."""
    try:
        await sender.send(message)
    except Exception as exc:
        logger.error(
            "email_failed", extra={"template": message.template, "error": type(exc).__name__}
        )


_console = ConsoleEmailSender()


@lru_cache
def _smtp() -> SmtpEmailSender:
    s = get_settings()
    assert s.smtp_host is not None and s.smtp_from is not None  # checked by Settings
    password = s.smtp_password.get_secret_value() if s.smtp_password else None
    return SmtpEmailSender(s.smtp_host, s.smtp_port, s.smtp_from, s.smtp_username, password)


def get_email_sender() -> EmailSender:
    return _smtp() if get_settings().email_backend == "smtp" else _console
