"""Outgoing email. Locally the console backend logs the message (spec Phase 1)."""

import logging
from dataclasses import dataclass
from typing import Protocol

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


_sender = ConsoleEmailSender()


def get_email_sender() -> EmailSender:
    return _sender
