"""Company hiring analytics (spec Phase 10). Counts and averages only, no individual data."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import ColumnElement, String, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models import Application, AuditLog, InterviewSession, SessionReport, User, Vacancy
from app.models.enums import ApplicationStatus, InterviewStage
from app.schemas.analytics import CompanyAnalytics, FunnelRow, VacancyAnalytics
from app.services.companies import get_membership

_S1 = aliased(InterviewSession)
_S2 = aliased(InterviewSession)
_PAST_SHORTLIST = (ApplicationStatus.shortlisted, ApplicationStatus.hired)


def _columns() -> list[Any]:
    return [
        func.count(Application.id).label("applied"),
        func.count(_S1.started_at).label("stage1_started"),
        func.count().filter(_S1.passed.is_(True)).label("stage1_passed"),
        func.count(_S2.started_at).label("stage2_started"),
        func.count().filter(_S2.passed.is_(True)).label("stage2_passed"),
        func.count().filter(Application.status.in_(_PAST_SHORTLIST)).label("shortlisted"),
        func.count().filter(Application.status == ApplicationStatus.hired).label("hired"),
        func.avg(_S1.score_percent).label("avg_stage1"),
        func.avg(_S2.score_percent).label("avg_stage2"),
        func.avg(SessionReport.overall_score).label("avg_overall"),
    ]


def _joined(query: Any) -> Any:
    return (
        query.select_from(Application)
        .join(Vacancy, Vacancy.id == Application.vacancy_id)
        .outerjoin(
            _S1, (_S1.application_id == Application.id) & (_S1.stage == InterviewStage.stage1)
        )
        .outerjoin(
            _S2, (_S2.application_id == Application.id) & (_S2.stage == InterviewStage.stage2)
        )
        .outerjoin(SessionReport, SessionReport.application_id == Application.id)
    )


def _rate(part: int, whole: int) -> float | None:
    return round(part / whole * 100, 1) if whole else None


def _rounded(value: float | None) -> float | None:
    return round(value, 1) if value is not None else None


def _funnel(r: Any) -> FunnelRow:
    return FunnelRow(
        applied=r.applied,
        stage1_started=r.stage1_started,
        stage1_passed=r.stage1_passed,
        stage2_started=r.stage2_started,
        stage2_passed=r.stage2_passed,
        shortlisted=r.shortlisted,
        hired=r.hired,
        stage1_pass_rate=_rate(r.stage1_passed, r.stage1_started),
        stage2_pass_rate=_rate(r.stage2_passed, r.stage2_started),
        avg_stage1_score=_rounded(r.avg_stage1),
        avg_stage2_score=_rounded(r.avg_stage2),
        avg_overall_score=_rounded(r.avg_overall),
    )


async def company_analytics(
    session: AsyncSession,
    company_id: uuid.UUID,
    user: User,
    days: int,
    vacancy_id: uuid.UUID | None,
) -> CompanyAnalytics:
    await get_membership(session, company_id, user)
    since = datetime.now(UTC) - timedelta(days=days)
    # Withdrawn applications say nothing about the assessment or the candidates' level.
    where: list[ColumnElement[bool]] = [
        Vacancy.company_id == company_id,
        Application.created_at >= since,
        Application.status != ApplicationStatus.withdrawn,
    ]
    if vacancy_id is not None:
        where.append(Vacancy.id == vacancy_id)

    total = (await session.execute(_joined(select(*_columns())).where(*where))).one()
    rows = await session.execute(
        _joined(select(Vacancy.id.label("vid"), Vacancy.title.label("title"), *_columns()))
        .where(*where)
        .group_by(Vacancy.id, Vacancy.title)
        .order_by(func.count(Application.id).desc(), Vacancy.title)
        .limit(20)
    )

    # Status changes are in the audit log; the first move to the shortlist is what counts.
    first = (
        select(AuditLog.entity_id.label("aid"), func.min(AuditLog.created_at).label("at"))
        .where(AuditLog.action == "application.status", AuditLog.diff["to"].astext == "shortlisted")
        .group_by(AuditLog.entity_id)
        .subquery()
    )
    median = await session.scalar(
        select(
            func.percentile_cont(0.5).within_group(
                func.extract("epoch", first.c.at - Application.created_at) / 3600.0
            )
        )
        .select_from(Application)
        .join(Vacancy, Vacancy.id == Application.vacancy_id)
        .join(first, first.c.aid == cast(Application.id, String))
        .where(*where)
    )
    return CompanyAnalytics(
        days=days,
        total=_funnel(total),
        median_hours_to_shortlist=_rounded(median),
        vacancies=[
            VacancyAnalytics(vacancy_id=r.vid, title=r.title, funnel=_funnel(r)) for r in rows
        ],
    )
