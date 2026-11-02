"""Apply / withdraw, saved vacancies, and the HR applicant list (no AI yet — Phase 2)."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import AppError, NotFoundError, PermissionDeniedError
from app.models import Application, CandidateProfile, SavedVacancy, User, Vacancy
from app.models.enums import ApplicationStatus, UserRole, VacancyStatus
from app.schemas.vacancy import (
    ApplicationOut,
    ApplicationPage,
    HrApplication,
    HrApplicationPage,
    HrCandidate,
    VacancyPage,
    VacancyRef,
)
from app.services import audit, vacancies
from app.services.companies import get_membership
from app.services.storage import Storage

# Statuses a candidate may still withdraw from (before the interview has started).
_WITHDRAWABLE = {
    ApplicationStatus.applied,
    ApplicationStatus.interview_pending,
    ApplicationStatus.shortlisted,
}


def _now() -> datetime:
    return datetime.now(UTC)


def _require_candidate(user: User) -> None:
    if user.role is not UserRole.candidate:
        raise PermissionDeniedError("Only candidate accounts can do this")


async def _application_out(
    session: AsyncSession, apps: list[Application], user: User
) -> list[ApplicationOut]:
    card_list = await vacancies.cards(session, [a.vacancy_id for a in apps], user)
    by_id = {c.id: c for c in card_list}
    return [
        ApplicationOut(
            id=a.id,
            status=a.status,
            cover_note=a.cover_note,
            created_at=a.created_at,
            updated_at=a.updated_at,
            vacancy=by_id[a.vacancy_id],
        )
        for a in apps
        if a.vacancy_id in by_id
    ]


async def apply(
    session: AsyncSession, vacancy_id: uuid.UUID, user: User, cover_note: str | None
) -> ApplicationOut:
    _require_candidate(user)
    if get_settings().require_verified_email_to_apply and not user.is_email_verified:
        raise AppError("email_not_verified", "Confirm your email before applying", 403)
    v = await session.get(Vacancy, vacancy_id)
    if v is None or v.status in (VacancyStatus.draft, VacancyStatus.archived):
        raise NotFoundError("Vacancy not found")
    if v.status is not VacancyStatus.published:
        raise AppError("vacancy_not_open", "This vacancy is no longer accepting applications", 409)
    app = await session.scalar(
        select(Application)
        .where(Application.vacancy_id == vacancy_id, Application.candidate_id == user.id)
        .with_for_update()
    )
    if app is not None and app.status is not ApplicationStatus.withdrawn:
        raise AppError("already_applied", "You have already applied to this vacancy", 409)
    if app is None:
        app = Application(vacancy_id=vacancy_id, candidate_id=user.id)
        session.add(app)
    app.status = ApplicationStatus.applied
    app.cover_note = cover_note or None
    app.seen_by_hr_at = None
    await session.flush()
    audit.record(session, user.id, "application.create", "application", app.id)
    await session.commit()
    await session.refresh(app)
    return (await _application_out(session, [app], user))[0]


async def my_applications(
    session: AsyncSession, user: User, status: ApplicationStatus | None, page: int, size: int
) -> ApplicationPage:
    _require_candidate(user)
    where: list[ColumnElement[bool]] = [Application.candidate_id == user.id]
    if status:
        where.append(Application.status == status)
    total = await session.scalar(select(func.count()).select_from(Application).where(*where))
    apps = list(
        await session.scalars(
            select(Application)
            .where(*where)
            .order_by(Application.updated_at.desc(), Application.id)
            .limit(size)
            .offset((page - 1) * size)
        )
    )
    return ApplicationPage(
        items=await _application_out(session, apps, user),
        total=total or 0,
        page=page,
        page_size=size,
    )


async def withdraw(session: AsyncSession, application_id: uuid.UUID, user: User) -> ApplicationOut:
    _require_candidate(user)
    app = await session.get(Application, application_id)
    if app is None or app.candidate_id != user.id:
        raise NotFoundError("Application not found")
    if app.status not in _WITHDRAWABLE:
        raise AppError("cannot_withdraw", "This application can no longer be withdrawn", 409)
    app.status = ApplicationStatus.withdrawn
    audit.record(session, user.id, "application.withdraw", "application", app.id)
    await session.commit()
    await session.refresh(app)
    return (await _application_out(session, [app], user))[0]


async def save(session: AsyncSession, vacancy_id: uuid.UUID, user: User) -> None:
    _require_candidate(user)
    v = await session.get(Vacancy, vacancy_id)
    if v is None or v.status in (VacancyStatus.draft, VacancyStatus.archived):
        raise NotFoundError("Vacancy not found")
    await session.execute(
        insert(SavedVacancy)
        .values(candidate_id=user.id, vacancy_id=vacancy_id)
        .on_conflict_do_nothing()
    )
    await session.commit()


async def unsave(session: AsyncSession, vacancy_id: uuid.UUID, user: User) -> None:
    _require_candidate(user)
    saved = await session.get(SavedVacancy, (user.id, vacancy_id))
    if saved is not None:
        await session.delete(saved)
        await session.commit()


async def saved_list(session: AsyncSession, user: User, page: int, size: int) -> VacancyPage:
    _require_candidate(user)
    visible = Vacancy.status.in_([VacancyStatus.published, VacancyStatus.closed])
    base = (
        select(SavedVacancy.vacancy_id)
        .join(Vacancy, Vacancy.id == SavedVacancy.vacancy_id)
        .where(SavedVacancy.candidate_id == user.id, visible)
    )
    total = await session.scalar(select(func.count()).select_from(base.subquery()))
    ids = list(
        await session.scalars(
            base.order_by(SavedVacancy.created_at.desc()).limit(size).offset((page - 1) * size)
        )
    )
    return VacancyPage(
        items=await vacancies.cards(session, ids, user),
        total=total or 0,
        page=page,
        page_size=size,
    )


# ---------------------------------------------------------------- HR


async def hr_list(
    session: AsyncSession,
    company_id: uuid.UUID,
    user: User,
    vacancy_id: uuid.UUID | None,
    status: ApplicationStatus | None,
    page: int,
    size: int,
) -> HrApplicationPage:
    await get_membership(session, company_id, user)
    where: list[ColumnElement[bool]] = [
        Vacancy.company_id == company_id,
        Application.status != ApplicationStatus.withdrawn,
    ]
    if vacancy_id:
        where.append(Application.vacancy_id == vacancy_id)
    if status:
        where.append(Application.status == status)
    base = select(Application).join(Vacancy, Vacancy.id == Application.vacancy_id).where(*where)
    total = await session.scalar(select(func.count()).select_from(base.subquery()))
    rows = await session.execute(
        select(Application, Vacancy, User, CandidateProfile)
        .join(Vacancy, Vacancy.id == Application.vacancy_id)
        .join(User, User.id == Application.candidate_id)
        .outerjoin(CandidateProfile, CandidateProfile.user_id == User.id)
        .where(*where)
        .order_by(Application.created_at.desc(), Application.id)
        .limit(size)
        .offset((page - 1) * size)
    )
    items = []
    seen: list[Application] = []
    for app, vacancy, cand, profile in rows.all():
        items.append(_hr_application(app, vacancy, cand, profile))
        if app.seen_by_hr_at is None:
            seen.append(app)
    # Listing applications marks them as seen, which clears the "+N new" badge.
    for app in seen:
        app.seen_by_hr_at = _now()
    if seen:
        await session.commit()
    return HrApplicationPage(items=items, total=total or 0, page=page, page_size=size)


def _hr_application(
    app: Application, vacancy: Vacancy, cand: User, profile: CandidateProfile | None
) -> HrApplication:
    return HrApplication(
        id=app.id,
        status=app.status,
        suspicion_percent=app.suspicion_percent,
        suspicion_label=app.suspicion_label,
        disqualification_reason=app.disqualification_reason,
        cover_note=app.cover_note,
        created_at=app.created_at,
        updated_at=app.updated_at,
        vacancy=VacancyRef(id=vacancy.id, title=vacancy.title),
        candidate=HrCandidate(
            user_id=cand.id,
            full_name=cand.full_name,
            email=cand.email,
            headline=profile.headline if profile else None,
            country=profile.country if profile else None,
            city=profile.city if profile else None,
            experience_years=profile.experience_years if profile else None,
            desired_salary_min=profile.desired_salary_min if profile else None,
            desired_salary_max=profile.desired_salary_max if profile else None,
            currency=profile.currency if profile else None,
            has_resume=bool(profile and profile.resume_key),
        ),
    )


async def _company_application(
    session: AsyncSession, company_id: uuid.UUID, application_id: uuid.UUID, user: User
) -> tuple[Application, Vacancy]:
    await get_membership(session, company_id, user)
    row = (
        await session.execute(
            select(Application, Vacancy)
            .join(Vacancy, Vacancy.id == Application.vacancy_id)
            .where(Application.id == application_id, Vacancy.company_id == company_id)
        )
    ).first()
    if row is None:
        raise NotFoundError("Application not found")
    return row[0], row[1]


async def hr_update_status(
    session: AsyncSession,
    company_id: uuid.UUID,
    application_id: uuid.UUID,
    user: User,
    status: str,
) -> HrApplication:
    app, vacancy = await _company_application(session, company_id, application_id, user)
    if app.status is ApplicationStatus.withdrawn:
        raise AppError("application_withdrawn", "The candidate withdrew this application", 409)
    old = app.status
    app.status = ApplicationStatus(status)
    app.seen_by_hr_at = app.seen_by_hr_at or _now()
    audit.record(
        session,
        user.id,
        "application.status",
        "application",
        app.id,
        {"from": old.value, "to": status},
    )
    await session.commit()
    await session.refresh(app)
    cand = await session.get(User, app.candidate_id)
    profile = await session.get(CandidateProfile, app.candidate_id)
    assert cand is not None
    return _hr_application(app, vacancy, cand, profile)


async def hr_resume(
    session: AsyncSession,
    company_id: uuid.UUID,
    application_id: uuid.UUID,
    user: User,
    storage: Storage,
) -> tuple[bytes, str, str]:
    app, _ = await _company_application(session, company_id, application_id, user)
    profile = await session.get(CandidateProfile, app.candidate_id)
    if profile is None or not profile.resume_key:
        raise NotFoundError("Resume not found")
    audit.record(session, user.id, "application.resume_view", "application", app.id)
    await session.commit()
    data = await storage.read(profile.resume_key)
    return (
        data,
        profile.resume_content_type or "application/octet-stream",
        (profile.resume_filename or "resume"),
    )
