"""Notifications: written with the status change, delivered per person and channel."""

import re
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import pytest
from httpx import AsyncClient
from pydantic import SecretStr
from sqlalchemy import select, update

from app.core.config import Settings, get_settings
from app.core.db import SessionLocal
from app.models import Application, Notification, User
from app.models.enums import (
    ApplicationStatus,
    NotificationChannel,
    NotificationEvent,
    NotificationStatus,
)
from app.services.email import (
    ConsoleEmailSender,
    EmailMessage,
    SmtpEmailSender,
    send_best_effort,
)
from app.services.notifications import _render, deliver_due
from app.services.telegram import TelegramError, get_telegram_sender
from app.workers.worker import WorkerSettings
from tests.conftest import SignUp
from tests.test_job_board import _company, _publish

WEBHOOK = "/api/v1/telegram/webhook"
SECRET = "webhook-secret-for-tests"


class FakeTelegram:
    def __init__(self, error: TelegramError | None = None) -> None:
        self.sent: list[tuple[int, str]] = []
        self.error = error

    async def send(self, chat_id: int, text: str) -> None:
        if self.error is not None:
            raise self.error
        self.sent.append((chat_id, text))


class BrokenEmail:
    async def send(self, message: EmailMessage) -> None:
        raise OSError("smtp.example.com refused")


async def _verify_all() -> None:
    async with SessionLocal() as db:
        await db.execute(update(User).values(is_email_verified=True))
        await db.commit()


async def _apply(signup: SignUp) -> tuple[AsyncClient, AsyncClient, str, str, dict[str, Any]]:
    hr = await signup("hr")
    cand = await signup("candidate")
    cid = await _company(hr, f"Acme {uuid.uuid4().hex[:6]}")
    vacancy = await _publish(hr, cid)
    r = await cand.post(f"/api/v1/vacancies/{vacancy['id']}/apply", json={})
    assert r.status_code in (200, 201), r.text
    return hr, cand, cid, r.json()["id"], vacancy


async def _deliver(email: Any = None, telegram: Any = None) -> ConsoleEmailSender:
    sender = email if email is not None else ConsoleEmailSender()
    async with SessionLocal() as db:
        await deliver_due(db, sender, telegram)
    return sender


async def _rows() -> list[Notification]:
    async with SessionLocal() as db:
        return list(await db.scalars(select(Notification)))


async def _set_status(aid: str, status: ApplicationStatus) -> None:
    async with SessionLocal() as db:
        app = await db.get(Application, uuid.UUID(aid))
        assert app is not None
        app.status = status
        await db.commit()


async def test_apply_tells_hr_and_skips_the_invite_without_an_assessment(signup: SignUp) -> None:
    hr, _, _, aid, vacancy = await _apply(signup)
    raw = await _rows()
    assert {r.event for r in raw} == {
        NotificationEvent.new_applicant,
        NotificationEvent.stage1_invite,
    }
    assert all(r.recipient_id is None for r in raw)

    await _verify_all()
    outbox = await _deliver()

    assert len(outbox.outbox) == 1  # no assessment here, so no invite to the candidate
    message = outbox.outbox[0]
    assert message.to == (await hr.get("/api/v1/auth/me")).json()["email"]
    assert vacancy["title"] in message.body
    assert f"/hr/candidates/{aid}" in message.body
    assert "Test Candidate" not in message.body


@pytest.mark.parametrize(
    ("status", "event"),
    [
        (ApplicationStatus.stage1_failed, NotificationEvent.stage1_failed),
        (ApplicationStatus.stage1_disqualified, NotificationEvent.disqualified),
        (ApplicationStatus.stage2_pending, NotificationEvent.stage2_invite),
        (ApplicationStatus.stage2_disqualified, NotificationEvent.disqualified),
        (ApplicationStatus.shortlisted, NotificationEvent.shortlisted),
        (ApplicationStatus.rejected, NotificationEvent.rejected),
        (ApplicationStatus.hired, NotificationEvent.hired),
    ],
)
async def test_each_status_change_is_written(
    signup: SignUp, status: ApplicationStatus, event: NotificationEvent
) -> None:
    _, _, _, aid, _ = await _apply(signup)
    await _set_status(aid, status)
    assert event in {r.event for r in await _rows()}


async def test_evaluated_tells_both_sides(signup: SignUp) -> None:
    _, cand, _, aid, _ = await _apply(signup)
    await _verify_all()
    await _deliver()
    await _set_status(aid, ApplicationStatus.evaluated)
    outbox = await _deliver()
    assert len(outbox.outbox) == 2
    cand_mail = (await cand.get("/api/v1/auth/me")).json()["email"]
    to_candidate = next(m for m in outbox.outbox if m.to == cand_mail)
    assert f"/candidate/applications/{aid}/results" in to_candidate.body


async def test_setting_the_same_status_writes_nothing(signup: SignUp) -> None:
    _, _, _, aid, _ = await _apply(signup)
    before = len(await _rows())
    await _set_status(aid, ApplicationStatus.applied)
    assert len(await _rows()) == before


async def test_a_rolled_back_change_announces_nothing(signup: SignUp) -> None:
    _, _, _, aid, _ = await _apply(signup)
    before = len(await _rows())
    async with SessionLocal() as db:
        app = await db.get(Application, uuid.UUID(aid))
        assert app is not None
        app.status = ApplicationStatus.hired
        await db.flush()
        await db.rollback()
    assert len(await _rows()) == before


async def test_messages_follow_the_recipients_language(signup: SignUp) -> None:
    hr, _, _, _, _ = await _apply(signup)
    assert (await hr.patch("/api/v1/auth/me", json={"locale": "ru"})).status_code == 200
    await _verify_all()
    outbox = await _deliver()
    assert outbox.outbox[0].subject == "Новый отклик"
    assert "/ru/hr/candidates/" in outbox.outbox[0].body


async def test_unverified_addresses_get_no_email(signup: SignUp) -> None:
    await _apply(signup)
    assert not (await _deliver()).outbox


async def test_opted_out_addresses_get_no_email(signup: SignUp) -> None:
    hr = await signup("hr")
    r = await hr.patch("/api/v1/auth/me", json={"notify_email": False})
    assert r.json()["notify_email"] is False
    cand = await signup("candidate")
    cid = await _company(hr, f"Acme {uuid.uuid4().hex[:6]}")
    vacancy = await _publish(hr, cid)
    await cand.post(f"/api/v1/vacancies/{vacancy['id']}/apply", json={})
    await _verify_all()
    assert not (await _deliver()).outbox


async def test_opting_out_after_the_event_skips_the_message(signup: SignUp) -> None:
    hr, _, _, _, _ = await _apply(signup)
    await _verify_all()
    # Expand only: one call handles rows in order, so stop right after the raw events.
    async with SessionLocal() as db:
        await deliver_due(db, ConsoleEmailSender(), None, limit=2)
    await hr.patch("/api/v1/auth/me", json={"notify_email": False})
    outbox = await _deliver()
    assert not outbox.outbox
    assert {r.status for r in await _rows()} == {NotificationStatus.skipped}


async def test_a_failed_send_retries_then_gives_up(signup: SignUp) -> None:
    await _apply(signup)
    await _verify_all()
    await _deliver(email=BrokenEmail())
    row = (await _rows())[0]
    assert row.status is NotificationStatus.pending
    assert row.attempts == 1
    assert row.last_error == "OSError"  # the class only, never the message
    assert row.next_attempt_at > datetime.now(UTC)

    for _ in range(4):
        async with SessionLocal() as db:
            await db.execute(
                update(Notification).values(next_attempt_at=datetime.now(UTC) - timedelta(1))
            )
            await db.commit()
        await _deliver(email=BrokenEmail())
    row = (await _rows())[0]
    assert row.status is NotificationStatus.failed
    assert row.attempts == 5
    assert not (await _deliver()).outbox


async def test_a_sent_message_is_not_sent_again(signup: SignUp) -> None:
    await _apply(signup)
    await _verify_all()
    assert len((await _deliver()).outbox) == 1
    assert not (await _deliver()).outbox


async def test_best_effort_email_swallows_an_outage() -> None:
    await send_best_effort(BrokenEmail(), EmailMessage("a@example.com", "s", "b", "t"))


@pytest.fixture
def telegram_on(monkeypatch: pytest.MonkeyPatch, app: Any) -> FakeTelegram:
    settings = get_settings()
    monkeypatch.setattr(settings, "telegram_bot_token", SecretStr("123:token"))
    monkeypatch.setattr(settings, "telegram_bot_username", "skillproof_test_bot")
    monkeypatch.setattr(settings, "telegram_webhook_secret", SecretStr(SECRET))
    fake = FakeTelegram()
    app.dependency_overrides[get_telegram_sender] = lambda: fake
    return fake


def _update(text: str, chat_id: int = 555, chat_type: str = "private") -> dict[str, Any]:
    return {"update_id": 1, "message": {"text": text, "chat": {"id": chat_id, "type": chat_type}}}


async def _link(client: AsyncClient, chat_id: int = 555) -> str:
    r = await client.post("/api/v1/auth/me/telegram")
    assert r.status_code == 200, r.text
    url = r.json()["url"]
    assert url.startswith("https://t.me/skillproof_test_bot?start=")
    token = url.split("=", 1)[1]
    assert len(token) <= 64  # the deep link limit
    r = await client.post(
        WEBHOOK,
        json=_update(f"/start {token}", chat_id),
        headers={"X-Telegram-Bot-Api-Secret-Token": SECRET},
    )
    assert r.status_code == 204, r.text
    return token


async def test_linking_telegram_and_receiving_a_message(
    signup: SignUp, telegram_on: FakeTelegram
) -> None:
    hr, _, _, aid, _ = await _apply(signup)
    await _link(hr)
    assert telegram_on.sent[0][0] == 555  # the confirmation
    me = (await hr.get("/api/v1/auth/me")).json()
    assert me["telegram_linked"] is True
    assert me["telegram_available"] is True

    await _deliver(telegram=telegram_on)
    assert any(chat == 555 and f"/hr/candidates/{aid}" in text for chat, text in telegram_on.sent)
    telegram_rows = [r for r in await _rows() if r.channel is NotificationChannel.telegram]
    assert [r.status for r in telegram_rows] == [NotificationStatus.sent]


async def test_a_link_token_works_once(signup: SignUp, telegram_on: FakeTelegram) -> None:
    first = await signup("hr")
    token = await _link(first, 555)
    await first.delete("/api/v1/auth/me/telegram")
    r = await first.post(
        WEBHOOK,
        json=_update(f"/start {token}", 777),
        headers={"X-Telegram-Bot-Api-Secret-Token": SECRET},
    )
    assert r.status_code == 204
    assert (await first.get("/api/v1/auth/me")).json()["telegram_linked"] is False


async def test_the_webhook_rejects_a_wrong_secret(
    signup: SignUp, telegram_on: FakeTelegram
) -> None:
    client = await signup("hr")
    token = (await client.post("/api/v1/auth/me/telegram")).json()["url"].split("=", 1)[1]
    for headers in ({}, {"X-Telegram-Bot-Api-Secret-Token": "wrong"}):
        r = await client.post(WEBHOOK, json=_update(f"/start {token}"), headers=headers)
        assert r.status_code == 404
    assert (await client.get("/api/v1/auth/me")).json()["telegram_linked"] is False


async def test_a_group_chat_cannot_be_linked(signup: SignUp, telegram_on: FakeTelegram) -> None:
    client = await signup("hr")
    token = (await client.post("/api/v1/auth/me/telegram")).json()["url"].split("=", 1)[1]
    r = await client.post(
        WEBHOOK,
        json=_update(f"/start {token}", chat_type="group"),
        headers={"X-Telegram-Bot-Api-Secret-Token": SECRET},
    )
    assert r.status_code == 204
    assert (await client.get("/api/v1/auth/me")).json()["telegram_linked"] is False


async def test_blocking_the_bot_unlinks_the_chat(signup: SignUp, telegram_on: FakeTelegram) -> None:
    hr, _, _, _, _ = await _apply(signup)
    await _link(hr)
    telegram_on.error = TelegramError(permanent=True, blocked=True)
    await _deliver(telegram=telegram_on)
    assert (await hr.get("/api/v1/auth/me")).json()["telegram_linked"] is False
    failed = [r for r in await _rows() if r.channel is NotificationChannel.telegram]
    assert [r.status for r in failed] == [NotificationStatus.failed]


async def test_telegram_is_refused_when_not_set_up(signup: SignUp) -> None:
    client = await signup("hr")
    assert (await client.post("/api/v1/auth/me/telegram")).status_code == 503
    me = (await client.get("/api/v1/auth/me")).json()
    assert me["telegram_available"] is False
    r = await client.post(WEBHOOK, json=_update("/start abcdefghijkl"))
    assert r.status_code == 404


async def test_smtp_uses_tls_before_the_password(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []
    sent: list[Any] = []

    class FakeSmtp:
        def __init__(self, host: str, port: int, timeout: int) -> None:
            calls.append(f"connect {host}:{port}")

        def __enter__(self) -> "FakeSmtp":
            return self

        def __exit__(self, *_: object) -> None:
            calls.append("quit")

        def starttls(self, context: Any) -> None:
            calls.append("starttls")

        def login(self, username: str, password: str) -> None:
            calls.append(f"login {username}")

        def send_message(self, mail: Any) -> None:
            calls.append("send")
            sent.append(mail)

    monkeypatch.setattr("app.services.email.smtplib.SMTP", FakeSmtp)
    sender = SmtpEmailSender("smtp.example.com", 587, "no-reply@example.com", "bot", "pw")
    await sender.send(EmailMessage("a@example.com", "Salom", "Matn", "t"))
    assert calls == ["connect smtp.example.com:587", "starttls", "login bot", "send", "quit"]
    assert sent[0]["To"] == "a@example.com"
    assert sent[0]["From"] == "no-reply@example.com"


async def test_a_line_break_in_a_subject_cannot_add_a_header(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sender = SmtpEmailSender("smtp.example.com", 587, "no-reply@example.com", None, None)
    with pytest.raises(ValueError):
        await sender.send(EmailMessage("a@example.com", "x\nBcc: b@example.com", "Matn", "t"))


def test_the_worker_runs_delivery() -> None:
    names = {job.coroutine.__name__ for job in WorkerSettings.cron_jobs}
    assert "deliver_notifications" in names


def test_empty_compose_values_leave_telegram_off(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ("TELEGRAM_BOT_TOKEN", "TELEGRAM_BOT_USERNAME", "TELEGRAM_WEBHOOK_SECRET"):
        monkeypatch.setenv(name, "")
    assert Settings(_env_file=None).telegram_bot_token is None  # type: ignore[call-arg]


def test_half_configured_channels_stop_the_start(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "123:token")
    with pytest.raises(ValueError, match="TELEGRAM"):
        Settings(_env_file=None)  # type: ignore[call-arg]
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN")
    monkeypatch.setenv("EMAIL_BACKEND", "smtp")
    with pytest.raises(ValueError, match="SMTP_HOST"):
        Settings(_env_file=None)  # type: ignore[call-arg]


@pytest.mark.parametrize("event", list(NotificationEvent))
def test_every_link_opens_a_real_page(event: NotificationEvent) -> None:
    _, body = _render(event, User(locale="uz"), uuid.uuid4(), "Backend")
    path = urlsplit(body.rsplit("\n", 1)[1]).path.removeprefix("/uz/")
    route = re.sub(r"[0-9a-f]{8}-[0-9a-f-]{27}", "[applicationId]", path)
    pages = Path(__file__).parents[2] / "frontend/src/app/[locale]"
    assert (pages / route / "page.tsx").exists(), route


def test_production_refuses_stand_in_services(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("JWT_SECRET", "x" * 40)
    with pytest.raises(ValueError, match=r"LLM_PROVIDER.*STT_PROVIDER.*EMAIL_BACKEND"):
        Settings(_env_file=None)  # type: ignore[call-arg]
