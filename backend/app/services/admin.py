"""Platform admin: moderation, users, global thresholds, AI usage (spec §2, Phase 10)."""

import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

from pydantic import ValidationError
from sqlalchemy import ColumnElement, Date, cast, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import AppError, NotFoundError
from app.core.live_thresholds import SETTING_KEY, apply_overrides, current_thresholds
from app.models import (
    Application,
    AuthToken,
    Company,
    CompanyMember,
    User,
    Vacancy,
)
from app.models.enums import TokenPurpose, UserRole, VacancyStatus
from app.models.platform import AiUsage, PlatformSetting
from app.schemas.admin import (
    AdminCompany,
    AdminCompanyPage,
    AdminCompanyUpdate,
    AdminOverview,
    AdminUser,
    AdminUserPage,
    AdminVacancy,
    AdminVacancyPage,
    AdminVacancyUpdate,
    AiUsageOut,
    ThresholdsOut,
    UsageBucket,
)
from app.services import audit


def _now() -> datetime:
    return datetime.now(UTC)


def _like(q: str) -> str:
    escaped = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


async def overview(session: AsyncSession) -> AdminOverview:
    since = _now() - timedelta(days=30)

    async def count(*where: ColumnElement[bool], of: Any) -> int:
        return await session.scalar(select(func.count()).select_from(of).where(*where)) or 0

    calls, cost, unpriced = (
        await session.execute(
            select(
                func.count(),
                func.coalesce(func.sum(AiUsage.cost_usd), 0.0),
                func.count().filter(AiUsage.cost_usd.is_(None)),
            ).where(AiUsage.created_at >= since)
        )
    ).one()
    return AdminOverview(
        candidates=await count(User.role == UserRole.candidate, of=User),
        hr_users=await count(User.role == UserRole.hr, of=User),
        companies=await count(of=Company),
        blocked_companies=await count(Company.blocked_at.is_not(None), of=Company),
        published_vacancies=await count(Vacancy.status == VacancyStatus.published, of=Vacancy),
        hidden_vacancies=await count(Vacancy.hidden_at.is_not(None), of=Vacancy),
        applications=await count(of=Application),
        ai_calls_30d=calls,
        ai_cost_usd_30d=round(float(cost or 0), 4),
        ai_calls_unpriced_30d=unpriced,
    )


async def list_users(
    session: AsyncSession, q: str | None, role: UserRole | None, page: int, size: int
) -> AdminUserPage:
    where: list[ColumnElement[bool]] = []
    if q and q.strip():
        where.append(or_(User.email.ilike(_like(q)), User.full_name.ilike(_like(q))))
    if role is not None:
        where.append(User.role == role)
    total = await session.scalar(select(func.count()).select_from(User).where(*where)) or 0
    rows = await session.scalars(
        select(User)
        .where(*where)
        .order_by(User.created_at.desc(), User.id)
        .offset((page - 1) * size)
        .limit(size)
    )
    return AdminUserPage(
        items=[AdminUser.model_validate(u) for u in rows], total=total, page=page, page_size=size
    )


async def set_user_active(
    session: AsyncSession, admin: User, user_id: uuid.UUID, is_active: bool
) -> AdminUser:
    user = await session.get(User, user_id)
    if user is None:
        raise NotFoundError("User not found")
    if user.id == admin.id:
        raise AppError("cannot_change_self", "You cannot deactivate your own account", 409)
    if user.is_active != is_active:
        user.is_active = is_active
        if not is_active:
            # The refresh check already refuses them; this also ends what is outstanding.
            await session.execute(
                update(AuthToken)
                .where(
                    AuthToken.user_id == user.id,
                    AuthToken.purpose == TokenPurpose.refresh,
                    AuthToken.used_at.is_(None),
                )
                .values(used_at=_now())
            )
        audit.record(
            session, admin.id, "admin.user_active", "user", user.id, {"is_active": is_active}
        )
    await session.commit()
    return AdminUser.model_validate(user)


async def _company_out(session: AsyncSession, company: Company) -> AdminCompany:
    members = await session.scalar(
        select(func.count())
        .select_from(CompanyMember)
        .where(CompanyMember.company_id == company.id)
    )
    vacancies = await session.scalar(
        select(func.count()).select_from(Vacancy).where(Vacancy.company_id == company.id)
    )
    return AdminCompany(
        id=company.id,
        name=company.name,
        slug=company.slug,
        is_verified=company.is_verified,
        blocked_at=company.blocked_at,
        block_reason=company.block_reason,
        members=members or 0,
        vacancies=vacancies or 0,
        created_at=company.created_at,
    )


async def list_companies(
    session: AsyncSession, q: str | None, blocked: bool | None, page: int, size: int
) -> AdminCompanyPage:
    where: list[ColumnElement[bool]] = []
    if q and q.strip():
        where.append(Company.name.ilike(_like(q)))
    if blocked is not None:
        where.append(Company.blocked_at.is_not(None) if blocked else Company.blocked_at.is_(None))
    total = await session.scalar(select(func.count()).select_from(Company).where(*where)) or 0
    rows = await session.scalars(
        select(Company)
        .where(*where)
        .order_by(Company.created_at.desc(), Company.id)
        .offset((page - 1) * size)
        .limit(size)
    )
    return AdminCompanyPage(
        items=[await _company_out(session, c) for c in rows],
        total=total,
        page=page,
        page_size=size,
    )


async def update_company(
    session: AsyncSession, admin: User, company_id: uuid.UUID, data: AdminCompanyUpdate
) -> AdminCompany:
    company = await session.get(Company, company_id)
    if company is None:
        raise NotFoundError("Company not found")
    diff: dict[str, Any] = {}
    if data.is_verified is not None and data.is_verified != company.is_verified:
        company.is_verified = data.is_verified
        diff["is_verified"] = data.is_verified
    if data.blocked is True and company.blocked_at is None:
        company.blocked_at, company.block_reason = _now(), data.reason or None
        diff.update(blocked=True, reason=company.block_reason)
    elif data.blocked is False and company.blocked_at is not None:
        company.blocked_at, company.block_reason = None, None
        diff["blocked"] = False
    if diff:
        audit.record(session, admin.id, "admin.company", "company", company.id, diff)
    await session.commit()
    return await _company_out(session, company)


def _vacancy_out(v: Vacancy, company_name: str) -> AdminVacancy:
    return AdminVacancy(
        id=v.id,
        title=v.title,
        company_id=v.company_id,
        company_name=company_name,
        status=v.status,
        hidden_at=v.hidden_at,
        hidden_reason=v.hidden_reason,
        created_at=v.created_at,
    )


async def list_vacancies(
    session: AsyncSession, q: str | None, hidden: bool | None, page: int, size: int
) -> AdminVacancyPage:
    # Drafts are the company's own work in progress; nobody outside has seen them.
    where: list[ColumnElement[bool]] = [Vacancy.status != VacancyStatus.draft]
    if q and q.strip():
        where.append(or_(Vacancy.title.ilike(_like(q)), Company.name.ilike(_like(q))))
    if hidden is not None:
        where.append(Vacancy.hidden_at.is_not(None) if hidden else Vacancy.hidden_at.is_(None))
    joined = select(Vacancy, Company.name).join(Company, Company.id == Vacancy.company_id)
    total = await session.scalar(
        select(func.count())
        .select_from(Vacancy)
        .join(Company, Company.id == Vacancy.company_id)
        .where(*where)
    )
    rows = await session.execute(
        joined.where(*where)
        .order_by(Vacancy.created_at.desc(), Vacancy.id)
        .offset((page - 1) * size)
        .limit(size)
    )
    return AdminVacancyPage(
        items=[_vacancy_out(v, name) for v, name in rows],
        total=total or 0,
        page=page,
        page_size=size,
    )


async def update_vacancy(
    session: AsyncSession, admin: User, vacancy_id: uuid.UUID, data: AdminVacancyUpdate
) -> AdminVacancy:
    v = await session.get(Vacancy, vacancy_id)
    if v is None:
        raise NotFoundError("Vacancy not found")
    if data.hidden and v.hidden_at is None:
        v.hidden_at, v.hidden_reason = _now(), data.reason or None
        audit.record(
            session,
            admin.id,
            "admin.vacancy",
            "vacancy",
            v.id,
            {"hidden": True, "reason": v.hidden_reason},
        )
    elif not data.hidden and v.hidden_at is not None:
        v.hidden_at, v.hidden_reason = None, None
        audit.record(session, admin.id, "admin.vacancy", "vacancy", v.id, {"hidden": False})
    await session.commit()
    company = await session.get(Company, v.company_id)
    assert company is not None  # the foreign key cascades
    return _vacancy_out(v, company.name)


async def get_thresholds(session: AsyncSession) -> ThresholdsOut:
    row = await session.get(PlatformSetting, SETTING_KEY)
    return ThresholdsOut(
        defaults=get_settings().thresholds.model_dump(),
        overrides=row.value if row is not None else {},
        effective=current_thresholds().model_dump(),
        updated_at=row.updated_at if row is not None else None,
    )


async def save_thresholds(
    session: AsyncSession, admin: User, overrides: dict[str, Any]
) -> ThresholdsOut:
    try:
        get_settings().thresholds.with_overrides(overrides)
    except ValidationError as exc:
        fields = [".".join(str(p) for p in e["loc"]) for e in exc.errors()]
        raise AppError(
            "invalid_thresholds", "A threshold is unknown or out of range", 422, {"fields": fields}
        ) from None
    row = await session.get(PlatformSetting, SETTING_KEY)
    before = row.value if row is not None else {}
    if row is None:
        row = PlatformSetting(key=SETTING_KEY)
        session.add(row)
    row.value, row.updated_by = overrides, admin.id
    audit.record(
        session,
        admin.id,
        "admin.thresholds",
        "platform_setting",
        SETTING_KEY,
        {"from": before, "to": overrides},
    )
    await session.commit()
    apply_overrides(overrides)
    await session.refresh(row)
    return await get_thresholds(session)


def _bucket_columns() -> list[Any]:
    return [
        func.count().label("calls"),
        func.coalesce(func.sum(AiUsage.input_tokens), 0).label("input_tokens"),
        func.coalesce(func.sum(AiUsage.output_tokens), 0).label("output_tokens"),
        func.coalesce(func.sum(AiUsage.seconds), 0.0).label("seconds"),
        func.coalesce(func.sum(AiUsage.characters), 0).label("characters"),
        func.coalesce(func.sum(AiUsage.cost_usd), 0.0).label("cost_usd"),
        func.count().filter(AiUsage.cost_usd.is_(None)).label("unpriced_calls"),
        func.count().filter(AiUsage.outcome != "ok").label("failed_calls"),
    ]


def _bucket(key: str, row: Any) -> UsageBucket:
    return UsageBucket(
        key=key,
        calls=row.calls,
        input_tokens=row.input_tokens,
        output_tokens=row.output_tokens,
        seconds=round(row.seconds, 1),
        characters=row.characters,
        cost_usd=round(row.cost_usd, 4),
        unpriced_calls=row.unpriced_calls,
        failed_calls=row.failed_calls,
    )


async def ai_usage(session: AsyncSession, days: int) -> AiUsageOut:
    since = _now() - timedelta(days=days)
    window = AiUsage.created_at >= since

    async def grouped(column: Any, *, newest_first: bool = False) -> list[UsageBucket]:
        order = column if newest_first else func.count().desc()
        rows = await session.execute(
            select(column.label("key"), *_bucket_columns())
            .where(window)
            .group_by(column)
            .order_by(order)
        )
        out = []
        for r in rows:
            key = r.key.isoformat() if isinstance(r.key, date) else (r.key or "-")
            out.append(_bucket(key, r))
        return out

    total = (await session.execute(select(*_bucket_columns()).where(window))).one()
    return AiUsageOut(
        days=days,
        total=_bucket("total", total),
        by_day=await grouped(cast(AiUsage.created_at, Date), newest_first=True),
        by_kind=await grouped(AiUsage.kind),
        by_model=await grouped(AiUsage.model),
        by_role=await grouped(AiUsage.role),
    )
