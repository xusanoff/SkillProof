"""Vacancy search (public), detail and HR management."""

import re
import uuid
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from pydantic import ValidationError
from sqlalchemy import ColumnElement, case, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, NotFoundError
from app.models import (
    Application,
    Assessment,
    Company,
    CompanyMember,
    ProfessionArea,
    Region,
    SavedVacancy,
    Skill,
    User,
    Vacancy,
    VacancySkill,
)
from app.models.enums import ApplicationStatus, UserRole, VacancyStatus
from app.schemas.vacancy import (
    CompanyBrief,
    Facets,
    FacetValue,
    HrVacancy,
    HrVacancyPage,
    SkillTag,
    SortOrder,
    VacancyCard,
    VacancyDetail,
    VacancyInput,
    VacancyPage,
    VacancyPatch,
    VacancySkillOut,
    Viewer,
)
from app.services import audit
from app.services.companies import get_membership, logo_url

MAX_CARD_SKILLS = 6
_TOKEN = re.compile(r"\w+", re.UNICODE)
_ALLOWED_TRANSITIONS: dict[VacancyStatus, set[VacancyStatus]] = {
    VacancyStatus.draft: {VacancyStatus.published, VacancyStatus.archived},
    VacancyStatus.published: {VacancyStatus.closed, VacancyStatus.archived},
    VacancyStatus.closed: {VacancyStatus.published, VacancyStatus.archived},
    VacancyStatus.archived: set(),
}


def _now() -> datetime:
    return datetime.now(UTC)


# ---------------------------------------------------------------- search


@dataclass
class SearchParams:
    q: str | None = None
    region: list[str] = field(default_factory=list)
    remote_type: list[str] = field(default_factory=list)
    employment_type: list[str] = field(default_factory=list)
    experience_level: list[str] = field(default_factory=list)
    profession_area: str | None = None
    skill: list[str] = field(default_factory=list)
    salary_from: int | None = None
    currency: str | None = None
    only_with_salary: bool = False
    company: str | None = None
    sort: SortOrder | None = None
    page: int = 1
    page_size: int = 20


def tsquery_text(q: str) -> str | None:
    """User text → safe prefix tsquery ("pyth back" → "pyth:* & back:*"). Only word
    characters survive, so tsquery operators typed by users can't break the query."""
    tokens = [t.lower() for t in _TOKEN.findall(q)][:8]
    return " & ".join(f"{t}:*" for t in tokens) or None


def _filters(p: SearchParams) -> tuple[list[ColumnElement[bool]], dict[str, ColumnElement[bool]]]:
    """Returns (plain conditions, facet conditions keyed by facet name)."""
    plain: list[ColumnElement[bool]] = [Vacancy.status == VacancyStatus.published]
    if p.q and (tsq := tsquery_text(p.q)):
        company_match = exists().where(
            Company.id == Vacancy.company_id, Company.name.ilike(f"%{p.q.strip()}%")
        )
        plain.append(
            or_(Vacancy.search_vector.op("@@")(func.to_tsquery("simple", tsq)), company_match)
        )
    if p.profession_area:
        plain.append(Vacancy.profession_area == p.profession_area)
    for slug in p.skill:
        plain.append(
            exists().where(
                VacancySkill.vacancy_id == Vacancy.id,
                VacancySkill.skill_id == Skill.id,
                Skill.slug == slug,
            )
        )
    if p.only_with_salary or p.salary_from is not None:
        plain.append(or_(Vacancy.salary_min.is_not(None), Vacancy.salary_max.is_not(None)))
    if p.salary_from is not None:
        plain.append(Vacancy.currency == (p.currency or "UZS"))
        plain.append(func.coalesce(Vacancy.salary_max, Vacancy.salary_min) >= p.salary_from)
    elif p.currency:
        plain.append(Vacancy.currency == p.currency)
    if p.company:
        plain.append(exists().where(Company.id == Vacancy.company_id, Company.slug == p.company))
    facets: dict[str, ColumnElement[bool]] = {}
    for name, column in _FACET_COLUMNS.items():
        values = getattr(p, name)
        if values:
            facets[name] = column.in_(values)
    return plain, facets


_FACET_COLUMNS: dict[str, Any] = {
    "region": Vacancy.region_code,
    "remote_type": Vacancy.remote_type,
    "employment_type": Vacancy.employment_type,
    "experience_level": Vacancy.experience_level,
}


async def _facets(
    session: AsyncSession,
    plain: list[ColumnElement[bool]],
    facet_conds: dict[str, ColumnElement[bool]],
) -> Facets:
    """Counts per facet value, each computed without that facet's own filter (hh.uz style)."""
    result: dict[str, list[FacetValue]] = {}
    for name, column in _FACET_COLUMNS.items():
        others = [c for k, c in facet_conds.items() if k != name]
        rows = await session.execute(
            select(column, func.count())
            .where(*plain, *others, column.is_not(None))
            .group_by(column)
            .order_by(func.count().desc())
        )
        result[name] = [
            FacetValue(value=v.value if hasattr(v, "value") else v, count=c) for v, c in rows
        ]
    return Facets(**result)


async def search(
    session: AsyncSession,
    p: SearchParams,
    viewer: User | None,
    *,
    with_facets: bool = True,
) -> VacancyPage:
    plain, facet_conds = _filters(p)
    where = [*plain, *facet_conds.values()]
    total = await session.scalar(select(func.count()).select_from(Vacancy).where(*where)) or 0

    sort = p.sort or ("relevance" if p.q else "date")
    order: list[Any]
    tsq = tsquery_text(p.q) if p.q else None
    if sort == "relevance" and tsq:
        rank = func.ts_rank(Vacancy.search_vector, func.to_tsquery("simple", tsq))
        order = [rank.desc(), Vacancy.published_at.desc()]
    elif sort == "salary_desc":
        salary = func.coalesce(Vacancy.salary_max, Vacancy.salary_min)
        order = [salary.desc().nulls_last(), Vacancy.published_at.desc()]
    elif sort == "salary_asc":
        salary = func.coalesce(Vacancy.salary_min, Vacancy.salary_max)
        order = [salary.asc().nulls_last(), Vacancy.published_at.desc()]
    else:
        order = [Vacancy.published_at.desc()]

    ids = list(
        await session.scalars(
            select(Vacancy.id)
            .where(*where)
            .order_by(*order, Vacancy.id)
            .limit(p.page_size)
            .offset((p.page - 1) * p.page_size)
        )
    )
    facets = await _facets(session, plain, facet_conds) if with_facets else None
    return VacancyPage(
        items=await cards(session, ids, viewer),
        total=total,
        page=p.page,
        page_size=p.page_size,
        facets=facets,
    )


# ---------------------------------------------------------------- cards


async def _skill_tags(
    session: AsyncSession, ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, list[tuple[Skill, VacancySkill]]]:
    rows = await session.execute(
        select(Skill, VacancySkill)
        .join(VacancySkill, VacancySkill.skill_id == Skill.id)
        .where(VacancySkill.vacancy_id.in_(ids))
        .order_by(VacancySkill.is_required.desc(), VacancySkill.weight.desc(), Skill.name)
    )
    by_vacancy: dict[uuid.UUID, list[tuple[Skill, VacancySkill]]] = defaultdict(list)
    for skill, link in rows.all():
        by_vacancy[link.vacancy_id].append((skill, link))
    return by_vacancy


async def _viewer_state(
    session: AsyncSession, ids: Sequence[uuid.UUID], viewer: User | None
) -> dict[uuid.UUID, Viewer] | None:
    if viewer is None or viewer.role is not UserRole.candidate:
        return None
    saved = set(
        await session.scalars(
            select(SavedVacancy.vacancy_id).where(
                SavedVacancy.candidate_id == viewer.id, SavedVacancy.vacancy_id.in_(ids)
            )
        )
    )
    rows = await session.execute(
        select(Application.vacancy_id, Application.status).where(
            Application.candidate_id == viewer.id, Application.vacancy_id.in_(ids)
        )
    )
    statuses = {vacancy_id: status for vacancy_id, status in rows}
    return {i: Viewer(is_saved=i in saved, application_status=statuses.get(i)) for i in ids}


def _brief(company: Company) -> CompanyBrief:
    return CompanyBrief(
        id=company.id,
        name=company.name,
        slug=company.slug,
        logo_url=logo_url(company),
        is_verified=company.is_verified,
    )


def _card_fields(v: Vacancy, company: Company) -> dict[str, Any]:
    return {
        "id": v.id,
        "title": v.title,
        "company": _brief(company),
        "region_code": v.region_code,
        "city": v.city,
        "remote_type": v.remote_type,
        "employment_type": v.employment_type,
        "experience_level": v.experience_level,
        "salary_min": v.salary_min,
        "salary_max": v.salary_max,
        "currency": v.currency,
        "published_at": v.published_at,
    }


async def cards(
    session: AsyncSession, ids: Sequence[uuid.UUID], viewer: User | None
) -> list[VacancyCard]:
    if not ids:
        return []
    rows = await session.execute(
        select(Vacancy, Company)
        .join(Company, Company.id == Vacancy.company_id)
        .where(Vacancy.id.in_(ids))
    )
    by_id = {v.id: (v, c) for v, c in rows.all()}
    skills = await _skill_tags(session, ids)
    viewer_state = await _viewer_state(session, ids, viewer)
    with_assessment = set(
        await session.scalars(select(Assessment.vacancy_id).where(Assessment.vacancy_id.in_(ids)))
    )
    out = []
    for i in ids:
        if i not in by_id:
            continue
        v, c = by_id[i]
        tags = [SkillTag(name=s.name, slug=s.slug) for s, _ in skills[i][:MAX_CARD_SKILLS]]
        out.append(
            VacancyCard(
                **_card_fields(v, c),
                skills=tags,
                has_assessment=i in with_assessment,
                viewer=viewer_state[i] if viewer_state else None,
            )
        )
    return out


async def _detail(
    session: AsyncSession, v: Vacancy, viewer: User | None, *, with_count: bool
) -> VacancyDetail:
    company = await session.get(Company, v.company_id)
    assert company is not None
    skills = (await _skill_tags(session, [v.id]))[v.id]
    viewer_state = await _viewer_state(session, [v.id], viewer)
    count = None
    if with_count:
        count = await session.scalar(
            select(func.count()).where(
                Application.vacancy_id == v.id,
                Application.status != ApplicationStatus.withdrawn,
            )
        )
    return VacancyDetail(
        **_card_fields(v, company),
        skills=[
            VacancySkillOut(
                id=s.id, name=s.name, slug=s.slug, weight=link.weight, is_required=link.is_required
            )
            for s, link in skills
        ],
        viewer=viewer_state[v.id] if viewer_state else None,
        description=v.description,
        requirements=v.requirements,
        profession_area=v.profession_area,
        country=v.country,
        status=v.status,
        applications_count=count,
    )


async def _is_member(session: AsyncSession, company_id: uuid.UUID, user: User | None) -> bool:
    if user is None:
        return False
    return (await session.get(CompanyMember, (company_id, user.id))) is not None


async def public_detail(
    session: AsyncSession, vacancy_id: uuid.UUID, viewer: User | None
) -> VacancyDetail:
    v = await session.get(Vacancy, vacancy_id)
    if v is None:
        raise NotFoundError("Vacancy not found")
    member = await _is_member(session, v.company_id, viewer)
    # Closed vacancies stay readable (links in old applications keep working); drafts and
    # archived ones only for the company's own HR.
    if v.status not in (VacancyStatus.published, VacancyStatus.closed) and not member:
        raise NotFoundError("Vacancy not found")
    return await _detail(session, v, viewer, with_count=member)


# ---------------------------------------------------------------- catalog


async def regions(session: AsyncSession, country: str | None) -> list[Region]:
    stmt = select(Region).order_by(Region.sort_order)
    if country:
        stmt = stmt.where(Region.country == country.upper())
    return list(await session.scalars(stmt))


async def profession_areas(session: AsyncSession) -> list[ProfessionArea]:
    return list(await session.scalars(select(ProfessionArea).order_by(ProfessionArea.sort_order)))


async def skills(session: AsyncSession, q: str | None, limit: int) -> list[Skill]:
    stmt = select(Skill).order_by(Skill.name).limit(limit)
    if q:
        stmt = stmt.where(Skill.name.ilike(f"%{_escape_like(q.strip())}%"))
    return list(await session.scalars(stmt))


def _escape_like(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


async def suggest(session: AsyncSession, q: str) -> list[dict[str, str | None]]:
    q = q.strip()
    if len(q) < 2:
        return []
    pattern = f"%{_escape_like(q)}%"
    starts_first = case((Vacancy.title.ilike(f"{_escape_like(q)}%"), 0), else_=1)
    titles = await session.execute(
        select(Vacancy.title, func.min(starts_first))
        .where(Vacancy.status == VacancyStatus.published, Vacancy.title.ilike(pattern))
        .group_by(Vacancy.title)
        .order_by(func.min(starts_first), func.count().desc())
        .limit(5)
    )
    skill_rows = await session.scalars(
        select(Skill).where(Skill.name.ilike(pattern)).order_by(Skill.name).limit(3)
    )
    company_rows = await session.scalars(
        select(Company)
        .where(
            Company.name.ilike(pattern),
            exists().where(
                Vacancy.company_id == Company.id, Vacancy.status == VacancyStatus.published
            ),
        )
        .order_by(Company.name)
        .limit(3)
    )
    out: list[dict[str, str | None]] = [
        {"type": "vacancy", "text": t, "slug": None} for t, _ in titles
    ]
    out += [{"type": "skill", "text": s.name, "slug": s.slug} for s in skill_rows]
    out += [{"type": "company", "text": c.name, "slug": c.slug} for c in company_rows]
    return out[:10]


# ---------------------------------------------------------------- HR management


async def _validate_refs(session: AsyncSession, data: VacancyInput) -> None:
    if await session.get(ProfessionArea, data.profession_area) is None:
        raise AppError(
            "validation_error",
            "Unknown profession area",
            422,
            {"fields": [{"loc": ["body", "profession_area"], "msg": "unknown", "type": "value"}]},
        )
    if data.region_code:
        region = await session.get(Region, data.region_code)
        if region is None or region.country != data.country:
            raise AppError(
                "validation_error",
                "Unknown region",
                422,
                {"fields": [{"loc": ["body", "region_code"], "msg": "unknown", "type": "value"}]},
            )
    if data.skills:
        ids = [s.skill_id for s in data.skills]
        found = await session.scalar(select(func.count()).where(Skill.id.in_(ids)))
        if found != len(ids):
            raise AppError(
                "validation_error",
                "Unknown skill",
                422,
                {"fields": [{"loc": ["body", "skills"], "msg": "unknown skill", "type": "value"}]},
            )


async def _set_skills(session: AsyncSession, v: Vacancy, data: VacancyInput) -> None:
    existing = await session.scalars(select(VacancySkill).where(VacancySkill.vacancy_id == v.id))
    for link in existing:
        await session.delete(link)
    await session.flush()
    for s in data.skills:
        session.add(
            VacancySkill(
                vacancy_id=v.id, skill_id=s.skill_id, weight=s.weight, is_required=s.is_required
            )
        )
    names = await session.scalars(
        select(Skill.name).where(Skill.id.in_([s.skill_id for s in data.skills]))
    )
    v.skills_text = " ".join(names)


_SCALAR_FIELDS = (
    "title",
    "description",
    "requirements",
    "profession_area",
    "country",
    "region_code",
    "city",
    "remote_type",
    "employment_type",
    "experience_level",
    "salary_min",
    "salary_max",
    "currency",
)


async def create(
    session: AsyncSession, company_id: uuid.UUID, user: User, data: VacancyInput
) -> VacancyDetail:
    await get_membership(session, company_id, user)
    await _validate_refs(session, data)
    v = Vacancy(company_id=company_id, created_by=user.id, status=VacancyStatus.draft)
    for f in _SCALAR_FIELDS:
        setattr(v, f, getattr(data, f))
    session.add(v)
    await session.flush()
    await _set_skills(session, v, data)
    audit.record(session, user.id, "vacancy.create", "vacancy", v.id, {"title": v.title})
    await session.commit()
    await session.refresh(v)
    return await _detail(session, v, user, with_count=True)


async def _own_vacancy(
    session: AsyncSession, company_id: uuid.UUID, vacancy_id: uuid.UUID, user: User
) -> Vacancy:
    await get_membership(session, company_id, user)
    v = await session.get(Vacancy, vacancy_id)
    if v is None or v.company_id != company_id:
        raise NotFoundError("Vacancy not found")
    return v


async def hr_detail(
    session: AsyncSession, company_id: uuid.UUID, vacancy_id: uuid.UUID, user: User
) -> VacancyDetail:
    v = await _own_vacancy(session, company_id, vacancy_id, user)
    return await _detail(session, v, user, with_count=True)


async def _current_input(session: AsyncSession, v: Vacancy) -> dict[str, Any]:
    links = await session.scalars(select(VacancySkill).where(VacancySkill.vacancy_id == v.id))
    data = {f: getattr(v, f) for f in _SCALAR_FIELDS}
    data["skills"] = [
        {"skill_id": link.skill_id, "weight": link.weight, "is_required": link.is_required}
        for link in links
    ]
    return data


async def update(
    session: AsyncSession,
    company_id: uuid.UUID,
    vacancy_id: uuid.UUID,
    user: User,
    patch: VacancyPatch,
) -> VacancyDetail:
    v = await _own_vacancy(session, company_id, vacancy_id, user)
    changes = patch.model_dump(exclude_unset=True)
    new_status = changes.pop("status", None)
    if changes:
        try:
            merged = VacancyInput.model_validate({**await _current_input(session, v), **changes})
        except ValidationError as exc:
            fields = [
                {"loc": ["body", *map(str, e["loc"])], "msg": e["msg"], "type": e["type"]}
                for e in exc.errors()
            ]
            raise AppError(
                "validation_error", "Request validation failed", 422, {"fields": fields}
            ) from exc
        await _validate_refs(session, merged)
        for f in _SCALAR_FIELDS:
            setattr(v, f, getattr(merged, f))
        if "skills" in changes:
            await _set_skills(session, v, merged)
    if new_status is not None and new_status != v.status:
        if new_status not in _ALLOWED_TRANSITIONS[v.status]:
            raise AppError(
                "invalid_status_transition",
                f"Cannot change status from {v.status.value} to {new_status.value}",
                409,
            )
        if new_status is VacancyStatus.published:
            if not v.description.strip():
                raise AppError("description_required", "Add a description before publishing", 409)
            v.published_at = v.published_at or _now()
        v.status = new_status
    audit.record(
        session,
        user.id,
        "vacancy.update",
        "vacancy",
        v.id,
        {
            **{k: str(val) for k, val in changes.items() if k != "skills"},
            **({"status": new_status.value} if new_status else {}),
        },
    )
    await session.commit()
    await session.refresh(v)
    return await _detail(session, v, user, with_count=True)


async def delete_draft(
    session: AsyncSession, company_id: uuid.UUID, vacancy_id: uuid.UUID, user: User
) -> None:
    v = await _own_vacancy(session, company_id, vacancy_id, user)
    if v.status is not VacancyStatus.draft:
        raise AppError("not_draft", "Only drafts can be deleted; archive it instead", 409)
    await session.delete(v)
    audit.record(session, user.id, "vacancy.delete", "vacancy", vacancy_id)
    await session.commit()


async def hr_list(
    session: AsyncSession,
    company_id: uuid.UUID,
    user: User,
    status: VacancyStatus | None,
    q: str | None,
    page: int,
    page_size: int,
) -> HrVacancyPage:
    await get_membership(session, company_id, user)
    where: list[ColumnElement[bool]] = [Vacancy.company_id == company_id]
    if status:
        where.append(Vacancy.status == status)
    if q:
        where.append(Vacancy.title.ilike(f"%{_escape_like(q.strip())}%"))
    total = await session.scalar(select(func.count()).select_from(Vacancy).where(*where)) or 0
    active = Application.status != ApplicationStatus.withdrawn
    apps = (
        select(
            Application.vacancy_id,
            func.count().label("total"),
            func.count().filter(Application.seen_by_hr_at.is_(None)).label("new"),
        )
        .where(active)
        .group_by(Application.vacancy_id)
        .subquery()
    )
    rows = await session.execute(
        select(Vacancy, func.coalesce(apps.c.total, 0), func.coalesce(apps.c.new, 0))
        .outerjoin(apps, apps.c.vacancy_id == Vacancy.id)
        .where(*where)
        .order_by(Vacancy.updated_at.desc(), Vacancy.id)
        .limit(page_size)
        .offset((page - 1) * page_size)
    )
    vacancies = rows.all()
    card_list = await cards(session, [v.id for v, _, _ in vacancies], None)
    by_id = {c.id: c for c in card_list}
    items = [
        HrVacancy(
            **by_id[v.id].model_dump(),
            status=v.status,
            applications_count=total_apps,
            new_applications_count=new_apps,
            updated_at=v.updated_at,
        )
        for v, total_apps, new_apps in vacancies
    ]
    count_rows = await session.execute(
        select(Vacancy.status, func.count())
        .where(Vacancy.company_id == company_id)
        .group_by(Vacancy.status)
    )
    counts = {s: 0 for s in VacancyStatus} | {s: c for s, c in count_rows}
    return HrVacancyPage(
        items=items, total=total, page=page, page_size=page_size, counts_by_status=counts
    )
