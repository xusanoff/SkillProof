"""Personal data: retention, export and account deletion (spec §9)."""

import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.question_cache import AUDIO_PREFIX
from app.core.errors import AppError
from app.core.live_thresholds import current_thresholds
from app.core.security import verify_password
from app.models import (
    Application,
    AuthToken,
    CandidateProfile,
    CodeSubmission,
    CompanyMember,
    EditorEvent,
    InterviewSession,
    InterviewTurn,
    Notification,
    QuestionCache,
    RulesAcceptance,
    SessionReport,
    User,
    Vacancy,
    VerifiedSkill,
)
from app.models.enums import EvaluationState, MemberRole, NotificationStatus, UserRole
from app.services import audit
from app.services.storage import Storage

logger = logging.getLogger(__name__)

_PURGE_BATCH = 200
_NOTIFICATION_DAYS = 90
_CACHE_DAYS = 90


def _now() -> datetime:
    return datetime.now(UTC)


async def _delete_files(storage: Storage, keys: list[str]) -> None:
    """After the commit: an orphaned file is a smaller problem than a row pointing at nothing."""
    for key in keys:
        if key.startswith(f"{AUDIO_PREFIX}/"):
            continue  # a spoken bank question, shared between interviews and about nobody
        try:
            await storage.delete(key)
        except Exception as exc:
            logger.error("file_not_deleted", extra={"error": type(exc).__name__})


async def purge_expired(session: AsyncSession, storage: Storage) -> int:
    """Removes editing telemetry and recordings past the retention period.

    Scores, reports, final code and transcripts stay: they are the hiring record, and HR
    opened those knowing the rules. Replay and audio of a purged session are gone for good.
    """
    cutoff = _now() - timedelta(days=current_thresholds().privacy.retention_days)
    purged = 0
    while True:
        rows = list(
            await session.scalars(
                select(InterviewSession)
                .where(
                    InterviewSession.data_purged_at.is_(None),
                    InterviewSession.completed_at < cutoff,
                    InterviewSession.evaluation_state != EvaluationState.pending,
                )
                .limit(_PURGE_BATCH)
                .with_for_update(skip_locked=True)
            )
        )
        if not rows:
            break
        ids = [s.id for s in rows]
        turns = await session.execute(
            select(InterviewTurn.question_audio_url, InterviewTurn.answer_audio_url).where(
                InterviewTurn.session_id.in_(ids)
            )
        )
        keys = [key for row in turns for key in row if key]
        await session.execute(delete(EditorEvent).where(EditorEvent.session_id.in_(ids)))
        await session.execute(
            update(InterviewTurn)
            .where(InterviewTurn.session_id.in_(ids))
            .values(question_audio_url=None, answer_audio_url=None)
        )
        now = _now()
        for s in rows:
            s.data_purged_at = now
        await session.commit()
        await _delete_files(storage, keys)
        purged += len(rows)

    stale = QuestionCache.last_used_at < _now() - timedelta(days=_CACHE_DAYS)
    audio = await session.scalars(delete(QuestionCache).where(stale).returning(QuestionCache.value))
    cached_files = [str(v["storage_key"]) for v in audio if "storage_key" in v]
    await session.execute(
        delete(Notification).where(
            Notification.created_at < _now() - timedelta(days=_NOTIFICATION_DAYS),
            Notification.status != NotificationStatus.pending,
        )
    )
    await session.execute(
        delete(AuthToken).where(
            or_(AuthToken.expires_at < _now() - timedelta(days=30), AuthToken.used_at.is_not(None)),
            AuthToken.created_at < _now() - timedelta(days=30),
        )
    )
    await session.commit()
    for key in cached_files:
        try:
            await storage.delete(key)
        except Exception as exc:
            logger.error("file_not_deleted", extra={"error": type(exc).__name__})
    return purged


async def export_account(session: AsyncSession, user: User) -> dict[str, Any]:
    """What we hold about this person and what they gave us.

    Left out: integrity signals and HR's notes. Those are a company's assessment of the
    person, and showing the signals would teach how to get around them (D-160).
    """
    profile = await session.get(CandidateProfile, user.id)
    applications = list(
        await session.execute(
            select(Application, Vacancy.title)
            .join(Vacancy, Vacancy.id == Application.vacancy_id)
            .where(Application.candidate_id == user.id)
            .order_by(Application.created_at)
        )
    )
    out_apps: list[dict[str, Any]] = []
    for app, title in applications:
        sessions = list(
            await session.scalars(
                select(InterviewSession)
                .where(InterviewSession.application_id == app.id)
                .order_by(InterviewSession.created_at)
            )
        )
        ids = [s.id for s in sessions]
        code = await session.scalars(
            select(CodeSubmission).where(CodeSubmission.session_id.in_(ids))
        )
        turns = await session.scalars(
            select(InterviewTurn)
            .where(InterviewTurn.session_id.in_(ids))
            .order_by(InterviewTurn.order)
        )
        report = await session.scalar(
            select(SessionReport).where(SessionReport.application_id == app.id)
        )
        out_apps.append(
            {
                "vacancy": title,
                "status": app.status.value,
                "cover_note": app.cover_note,
                "applied_at": app.created_at.isoformat(),
                "stages": [
                    {
                        "stage": s.stage.value,
                        "status": s.status.value,
                        "score_percent": s.score_percent,
                        "started_at": s.started_at.isoformat() if s.started_at else None,
                        "completed_at": s.completed_at.isoformat() if s.completed_at else None,
                    }
                    for s in sessions
                ],
                "code": [{"language": c.language, "final_code": c.final_code} for c in code],
                "answers": [
                    {
                        "question": t.question_text,
                        "answer": t.answer_transcript,
                        "source": t.answer_source,
                    }
                    for t in turns
                ],
                "overall_score": report.overall_score if report else None,
            }
        )
    skills = await session.scalars(
        select(VerifiedSkill).where(VerifiedSkill.candidate_id == user.id)
    )
    rules = await session.scalars(
        select(RulesAcceptance)
        .join(Application, Application.id == RulesAcceptance.application_id)
        .where(Application.candidate_id == user.id)
    )
    audit.record(session, user.id, "user.export", "user", user.id)
    await session.commit()
    return {
        "exported_at": _now().isoformat(),
        "account": {
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role.value,
            "locale": user.locale,
            "timezone": user.timezone,
            "created_at": user.created_at.isoformat(),
        },
        "profile": (
            {
                "country": profile.country,
                "city": profile.city,
                "experience_years": profile.experience_years,
                "about": profile.about,
                "desired_salary_min": profile.desired_salary_min,
                "desired_salary_max": profile.desired_salary_max,
                "currency": profile.currency,
                "resume_filename": profile.resume_filename,
            }
            if profile is not None
            else None
        ),
        "applications": out_apps,
        "verified_skills": [
            {
                "skill_id": str(s.skill_id),
                "score": s.score,
                "is_public": s.is_public,
                "valid_until": s.valid_until.isoformat(),
            }
            for s in skills
        ],
        "rules_accepted": [r.accepted_at.isoformat() for r in rules],
    }


async def delete_account(
    session: AsyncSession, storage: Storage, user: User, password: str
) -> None:
    """Deletes the person and, through foreign keys, their applications and results."""
    if not verify_password(password, user.password_hash):
        raise AppError("invalid_password", "The password is not correct", 403)
    if user.role is UserRole.admin:
        others = await session.scalar(
            select(func.count())
            .select_from(User)
            .where(User.role == UserRole.admin, User.is_active.is_(True), User.id != user.id)
        )
        if not others:
            raise AppError("last_admin", "The platform needs at least one admin", 409)
    owned = list(
        await session.scalars(
            select(CompanyMember.company_id).where(
                CompanyMember.user_id == user.id, CompanyMember.member_role == MemberRole.owner
            )
        )
    )
    for company_id in owned:
        others = await session.scalar(
            select(func.count())
            .select_from(CompanyMember)
            .where(
                CompanyMember.company_id == company_id,
                CompanyMember.member_role == MemberRole.owner,
                CompanyMember.user_id != user.id,
            )
        )
        if not others:
            raise AppError(
                "sole_company_owner", "Hand the company over to another owner first", 409
            )

    keys: list[str] = []
    profile = await session.get(CandidateProfile, user.id)
    if profile is not None and profile.resume_key:
        keys.append(profile.resume_key)
    turns = await session.execute(
        select(InterviewTurn.question_audio_url, InterviewTurn.answer_audio_url)
        .join(InterviewSession, InterviewSession.id == InterviewTurn.session_id)
        .join(Application, Application.id == InterviewSession.application_id)
        .where(Application.candidate_id == user.id)
    )
    keys += [key for row in turns for key in row if key]

    user_id: uuid.UUID = user.id
    # The audit row keeps the id only: it proves the deletion without keeping the person.
    audit.record(session, None, "user.delete", "user", user_id)
    await session.execute(delete(User).where(User.id == user_id))
    await session.commit()
    await _delete_files(storage, keys)
