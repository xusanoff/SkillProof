"""Delivers the notification outbox by email and Telegram (spec Phase 9).

Messages name the vacancy and link to the app. They carry no score, suspicion level or
candidate name: mail and Telegram are outside our control, the app checks who is looking.
"""

import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.assessment import Assessment
from app.models.company import CompanyMember
from app.models.enums import NotificationChannel, NotificationEvent, NotificationStatus
from app.models.notification import Notification
from app.models.user import User
from app.models.vacancy import Application, Vacancy
from app.services.email import EmailMessage, EmailSender
from app.services.telegram import TelegramError, TelegramSender

logger = logging.getLogger(__name__)

_RETRY_DELAYS_S = (60, 300, 1800, 7200)  # a fifth failure is final
_HR_EVENTS = {NotificationEvent.new_applicant, NotificationEvent.report_ready}
_INVITES = {NotificationEvent.stage1_invite, NotificationEvent.stage2_invite}

_TEMPLATES: dict[NotificationEvent, dict[str, tuple[str, str]]] = {
    NotificationEvent.new_applicant: {
        "uz": ("Yangi ariza", '"{vacancy}" vakansiyasiga yangi nomzod ariza berdi.'),
        "ru": ("Новый отклик", 'На вакансию "{vacancy}" откликнулся новый кандидат.'),  # noqa: RUF001
        "en": ("New applicant", 'A new candidate applied to "{vacancy}".'),
    },
    NotificationEvent.report_ready: {
        "uz": ("Hisobot tayyor", '"{vacancy}" bo\'yicha nomzod hisoboti tayyor.'),
        "ru": ("Отчёт готов", 'Отчёт по кандидату на вакансию "{vacancy}" готов.'),
        "en": ("Report ready", 'A candidate report for "{vacancy}" is ready.'),
    },
    NotificationEvent.stage1_invite: {
        "uz": (
            "Amaliy topshiriqqa taklif",
            'Arizangiz qabul qilindi. "{vacancy}" uchun 1-bosqichni boshlashingiz mumkin.',
        ),
        "ru": (
            "Приглашение на практическое задание",
            'Отклик принят. Можно начинать этап 1 по вакансии "{vacancy}".',
        ),
        "en": (
            "Invitation to the practical task",
            'Your application is in. You can start Stage 1 for "{vacancy}".',
        ),
    },
    NotificationEvent.stage2_invite: {
        "uz": (
            "Og'zaki suhbatga taklif",
            "\"{vacancy}\" bo'yicha 1-bosqichdan o'tdingiz. 2-bosqichni boshlashingiz mumkin.",
        ),
        "ru": (
            "Приглашение на устное интервью",
            'Вы прошли этап 1 по вакансии "{vacancy}". Можно начинать этап 2.',
        ),
        "en": (
            "Invitation to the oral interview",
            'You passed Stage 1 for "{vacancy}". You can start Stage 2.',
        ),
    },
    NotificationEvent.stage1_failed: {
        "uz": ("1-bosqich natijasi", "\"{vacancy}\" bo'yicha 1-bosqichdan o'ta olmadingiz."),
        "ru": ("Результат этапа 1", 'Этап 1 по вакансии "{vacancy}" не пройден.'),
        "en": ("Stage 1 result", 'You did not pass Stage 1 for "{vacancy}".'),
    },
    NotificationEvent.disqualified: {
        "uz": (
            "Sessiya to'xtatildi",
            "\"{vacancy}\" bo'yicha sessiya qoidalarga ko'ra to'xtatildi.",
        ),
        "ru": ("Сессия остановлена", 'Сессия по вакансии "{vacancy}" остановлена по правилам.'),
        "en": ("Session stopped", 'Your session for "{vacancy}" was stopped under the rules.'),
    },
    NotificationEvent.results_ready: {
        "uz": (
            "Natijalaringiz tayyor",
            "\"{vacancy}\" bo'yicha natijalaringizni ko'rishingiz mumkin.",
        ),
        "ru": ("Результаты готовы", 'Результаты по вакансии "{vacancy}" можно посмотреть.'),
        "en": ("Your results are ready", 'You can now see your results for "{vacancy}".'),
    },
    NotificationEvent.shortlisted: {
        "uz": ("Saralandingiz", "\"{vacancy}\" bo'yicha qisqa ro'yxatga kiritildingiz."),
        "ru": ("Вы в шорт-листе", 'Вас включили в шорт-лист по вакансии "{vacancy}".'),  # noqa: RUF001
        "en": ("You are on the shortlist", 'You were shortlisted for "{vacancy}".'),
    },
    NotificationEvent.rejected: {
        "uz": ("Ariza holati", '"{vacancy}" bo\'yicha kompaniya boshqa nomzodlarni tanladi.'),
        "ru": ("Статус отклика", 'По вакансии "{vacancy}" компания выбрала других кандидатов.'),
        "en": ("Application status", 'The company chose other candidates for "{vacancy}".'),
    },
    NotificationEvent.hired: {
        "uz": (
            "Tabriklaymiz!",
            "\"{vacancy}\" bo'yicha sizni ishga olish to'g'risida qaror qilindi.",
        ),
        "ru": ("Поздравляем!", 'По вакансии "{vacancy}" принято решение нанять вас.'),
        "en": ("Congratulations!", 'The company decided to hire you for "{vacancy}".'),
    },
}


def _now() -> datetime:
    return datetime.now(UTC)


def _channel_open(
    user: User, channel: NotificationChannel, telegram: TelegramSender | None
) -> bool:
    if not user.is_active:
        return False
    if channel is NotificationChannel.email:
        # Unverified addresses get nothing: anyone can register with someone else's email.
        return user.notify_email and user.is_email_verified
    return telegram is not None and user.notify_telegram and user.telegram_chat_id is not None


def _render(
    event: NotificationEvent, user: User, application_id: uuid.UUID, vacancy_title: str
) -> tuple[str, str]:
    variants = _TEMPLATES[event]
    subject, body = variants.get(user.locale, variants["uz"])
    if event in _HR_EVENTS:
        path = f"hr/candidates/{application_id}"
    elif event in _INVITES:
        path = f"candidate/interview/{application_id}"
    else:
        path = f"candidate/applications/{application_id}/results"
    link = f"{get_settings().frontend_url}/{user.locale}/{path}"
    title = " ".join(vacancy_title.split())
    return subject, f"{body.format(vacancy=title)}\n\n{link}"


async def _expand(
    session: AsyncSession, row: Notification, telegram: TelegramSender | None
) -> None:
    """Turns a raw event into one row per recipient and channel, so retries stay separate."""
    app = await session.get(Application, row.application_id)
    assert app is not None  # the foreign key cascades
    vacancy = await session.get(Vacancy, app.vacancy_id)
    assert vacancy is not None
    users: list[User] = []
    if row.event in _HR_EVENTS:
        users = list(
            await session.scalars(
                select(User)
                .join(CompanyMember, CompanyMember.user_id == User.id)
                .where(CompanyMember.company_id == vacancy.company_id)
            )
        )
    elif row.event is not NotificationEvent.stage1_invite or await session.scalar(
        select(Assessment.id).where(Assessment.vacancy_id == vacancy.id)
    ):
        candidate = await session.get(User, app.candidate_id)
        users = [candidate] if candidate is not None else []
    for user in users:
        for channel in NotificationChannel:
            if _channel_open(user, channel, telegram):
                session.add(
                    Notification(
                        application_id=row.application_id,
                        event=row.event,
                        recipient_id=user.id,
                        channel=channel,
                    )
                )
    await session.delete(row)


async def _send(
    session: AsyncSession,
    row: Notification,
    email: EmailSender,
    telegram: TelegramSender | None,
) -> None:
    assert row.recipient_id is not None and row.channel is not None
    user = await session.get(User, row.recipient_id)
    app = await session.get(Application, row.application_id)
    assert user is not None and app is not None  # both foreign keys cascade
    if not _channel_open(user, row.channel, telegram):
        # Switched off or unlinked after the event was written.
        row.status = NotificationStatus.skipped
        return
    vacancy = await session.get(Vacancy, app.vacancy_id)
    assert vacancy is not None
    subject, body = _render(row.event, user, app.id, vacancy.title)
    row.attempts += 1
    try:
        if row.channel is NotificationChannel.email:
            await email.send(EmailMessage(user.email, subject, body, row.event.value))
        else:
            assert telegram is not None and user.telegram_chat_id is not None
            await telegram.send(user.telegram_chat_id, f"{subject}\n\n{body}")
    except Exception as exc:
        row.last_error = type(exc).__name__
        permanent = isinstance(exc, TelegramError) and exc.permanent
        if isinstance(exc, TelegramError) and exc.blocked:
            user.telegram_chat_id = None
        if permanent or row.attempts > len(_RETRY_DELAYS_S):
            row.status = NotificationStatus.failed
            logger.warning("notification_failed", extra={"notification_id": str(row.id)})
        else:
            delay = _RETRY_DELAYS_S[row.attempts - 1]
            row.next_attempt_at = _now() + timedelta(seconds=delay)
        return
    row.status = NotificationStatus.sent
    row.sent_at = _now()
    row.last_error = None


async def deliver_due(
    session: AsyncSession,
    email: EmailSender,
    telegram: TelegramSender | None,
    limit: int = 50,
) -> int:
    """Handles rows one by one, each in its own transaction, so a crash repeats one message."""
    handled = 0
    while handled < limit:
        row = await session.scalar(
            select(Notification)
            .where(
                Notification.status == NotificationStatus.pending,
                Notification.next_attempt_at <= _now(),
            )
            .order_by(Notification.created_at, Notification.id)
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        if row is None:
            break
        if row.recipient_id is None:
            await _expand(session, row, telegram)
        else:
            await _send(session, row, email, telegram)
        await session.commit()
        handled += 1
    return handled


TELEGRAM_LINKED: dict[str, str] = {
    "uz": "Telegram ulandi. Bildirishnomalar shu yerga keladi.",
    "ru": "Telegram подключён. Уведомления будут приходить сюда.",
    "en": "Telegram is connected. Notifications will arrive here.",
}
