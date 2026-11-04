import uuid
from typing import Annotated, Literal
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query, Response, status

from app.api.deps import CurrentUser, DbSession, OptionalUser
from app.models.enums import (
    ApplicationStatus,
    EmploymentType,
    ExperienceLevel,
    RemoteType,
    VacancyStatus,
)
from app.schemas.vacancy import (
    ApplicationOut,
    ApplicationPage,
    ApplyIn,
    HrApplication,
    HrApplicationPage,
    HrApplicationUpdate,
    HrVacancyPage,
    ProfessionAreaOut,
    RegionOut,
    SkillOut,
    SortOrder,
    Suggestion,
    VacancyDetail,
    VacancyInput,
    VacancyPage,
    VacancyPatch,
)
from app.schemas.verified_skill import PublicProfile, TalentPage
from app.services import applications, vacancies, verified_skills
from app.services.storage import Storage, get_storage

router = APIRouter(tags=["job board"])
StorageDep = Annotated[Storage, Depends(get_storage)]
Page = Annotated[int, Query(ge=1, le=1000)]
PageSize = Annotated[int, Query(ge=1, le=50)]


# ---------------------------------------------------------------- catalog & search


@router.get("/regions", response_model=list[RegionOut])
async def list_regions(
    session: DbSession, country: Annotated[str | None, Query(max_length=2)] = None
) -> list[RegionOut]:
    rows = await vacancies.regions(session, country)
    return [RegionOut(code=r.code, country=r.country, names=r.names) for r in rows]


@router.get("/profession-areas", response_model=list[ProfessionAreaOut])
async def list_profession_areas(session: DbSession) -> list[ProfessionAreaOut]:
    rows = await vacancies.profession_areas(session)
    return [ProfessionAreaOut(slug=a.slug, names=a.names) for a in rows]


@router.get("/profiles/{candidate_id}", response_model=PublicProfile)
async def public_profile(candidate_id: uuid.UUID, session: DbSession) -> PublicProfile:
    return await verified_skills.public_profile(session, candidate_id)


@router.get("/companies/{company_id}/talent", response_model=TalentPage)
async def search_talent(
    company_id: uuid.UUID,
    user: CurrentUser,
    session: DbSession,
    skill_id: Annotated[list[uuid.UUID] | None, Query(max_length=10)] = None,
    min_score: Annotated[float | None, Query(ge=0, le=100)] = None,
    page: Page = 1,
    page_size: PageSize = 20,
) -> TalentPage:
    return await verified_skills.search_talent(
        session, company_id, user, skill_id or [], min_score, page, page_size
    )


@router.get("/skills", response_model=list[SkillOut])
async def list_skills(
    session: DbSession,
    q: Annotated[str | None, Query(max_length=100)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[SkillOut]:
    rows = await vacancies.skills(session, q, limit)
    return [SkillOut(id=s.id, name=s.name, slug=s.slug, category=s.category) for s in rows]


@router.get("/search/suggest", response_model=list[Suggestion])
async def suggest(
    session: DbSession, q: Annotated[str, Query(max_length=100)] = ""
) -> list[Suggestion]:
    return [Suggestion.model_validate(s) for s in await vacancies.suggest(session, q)]


@router.get("/vacancies", response_model=VacancyPage)
async def search_vacancies(
    session: DbSession,
    viewer: OptionalUser,
    q: Annotated[str | None, Query(max_length=200)] = None,
    region: Annotated[list[str], Query(max_length=30)] = [],  # noqa: B006
    remote_type: Annotated[list[RemoteType], Query()] = [],  # noqa: B006
    employment_type: Annotated[list[EmploymentType], Query()] = [],  # noqa: B006
    experience_level: Annotated[list[ExperienceLevel], Query()] = [],  # noqa: B006
    profession_area: Annotated[str | None, Query(max_length=60)] = None,
    skill: Annotated[list[str], Query(max_length=10)] = [],  # noqa: B006
    salary_from: Annotated[int | None, Query(ge=0)] = None,
    currency: Annotated[str | None, Query(min_length=3, max_length=3)] = None,
    only_with_salary: bool = False,
    company: Annotated[str | None, Query(max_length=120)] = None,
    sort: SortOrder | None = None,
    page: Page = 1,
    page_size: PageSize = 20,
) -> VacancyPage:
    params = vacancies.SearchParams(
        q=q,
        region=region,
        remote_type=[r.value for r in remote_type],
        employment_type=[e.value for e in employment_type],
        experience_level=[e.value for e in experience_level],
        profession_area=profession_area,
        skill=skill,
        salary_from=salary_from,
        currency=currency.upper() if currency else None,
        only_with_salary=only_with_salary,
        company=company,
        sort=sort,
        page=page,
        page_size=page_size,
    )
    return await vacancies.search(session, params, viewer)


@router.get("/vacancies/{vacancy_id}", response_model=VacancyDetail)
async def vacancy_detail(
    vacancy_id: uuid.UUID, session: DbSession, viewer: OptionalUser
) -> VacancyDetail:
    return await vacancies.public_detail(session, vacancy_id, viewer)


@router.get("/companies/by-slug/{slug}/vacancies", response_model=VacancyPage)
async def company_vacancies(
    slug: str, session: DbSession, viewer: OptionalUser, page: Page = 1, page_size: PageSize = 20
) -> VacancyPage:
    params = vacancies.SearchParams(company=slug, page=page, page_size=page_size)
    return await vacancies.search(session, params, viewer, with_facets=False)


# ---------------------------------------------------------------- candidate


@router.post(
    "/vacancies/{vacancy_id}/apply",
    response_model=ApplicationOut,
    status_code=status.HTTP_201_CREATED,
)
async def apply(
    vacancy_id: uuid.UUID, data: ApplyIn, user: CurrentUser, session: DbSession
) -> ApplicationOut:
    return await applications.apply(session, vacancy_id, user, data.cover_note)


@router.get("/candidate/applications", response_model=ApplicationPage)
async def my_applications(
    user: CurrentUser,
    session: DbSession,
    status: ApplicationStatus | None = None,
    page: Page = 1,
    page_size: PageSize = 20,
) -> ApplicationPage:
    return await applications.my_applications(session, user, status, page, page_size)


@router.post("/candidate/applications/{application_id}/withdraw", response_model=ApplicationOut)
async def withdraw(
    application_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> ApplicationOut:
    return await applications.withdraw(session, application_id, user)


@router.get("/candidate/saved-vacancies", response_model=VacancyPage)
async def saved_vacancies(
    user: CurrentUser, session: DbSession, page: Page = 1, page_size: PageSize = 20
) -> VacancyPage:
    return await applications.saved_list(session, user, page, page_size)


@router.put("/candidate/saved-vacancies/{vacancy_id}", status_code=status.HTTP_204_NO_CONTENT)
async def save_vacancy(vacancy_id: uuid.UUID, user: CurrentUser, session: DbSession) -> None:
    await applications.save(session, vacancy_id, user)


@router.delete("/candidate/saved-vacancies/{vacancy_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unsave_vacancy(vacancy_id: uuid.UUID, user: CurrentUser, session: DbSession) -> None:
    await applications.unsave(session, vacancy_id, user)


# ---------------------------------------------------------------- HR

HR = "/companies/{company_id}"


@router.get(f"{HR}/vacancies", response_model=HrVacancyPage)
async def hr_vacancies(
    company_id: uuid.UUID,
    user: CurrentUser,
    session: DbSession,
    status: VacancyStatus | None = None,
    q: Annotated[str | None, Query(max_length=200)] = None,
    page: Page = 1,
    page_size: PageSize = 20,
) -> HrVacancyPage:
    return await vacancies.hr_list(session, company_id, user, status, q, page, page_size)


@router.post(f"{HR}/vacancies", response_model=VacancyDetail, status_code=status.HTTP_201_CREATED)
async def create_vacancy(
    company_id: uuid.UUID, data: VacancyInput, user: CurrentUser, session: DbSession
) -> VacancyDetail:
    return await vacancies.create(session, company_id, user, data)


@router.get(f"{HR}/vacancies/{{vacancy_id}}", response_model=VacancyDetail)
async def hr_vacancy(
    company_id: uuid.UUID, vacancy_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> VacancyDetail:
    return await vacancies.hr_detail(session, company_id, vacancy_id, user)


@router.patch(f"{HR}/vacancies/{{vacancy_id}}", response_model=VacancyDetail)
async def update_vacancy(
    company_id: uuid.UUID,
    vacancy_id: uuid.UUID,
    data: VacancyPatch,
    user: CurrentUser,
    session: DbSession,
) -> VacancyDetail:
    return await vacancies.update(session, company_id, vacancy_id, user, data)


@router.delete(f"{HR}/vacancies/{{vacancy_id}}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vacancy(
    company_id: uuid.UUID, vacancy_id: uuid.UUID, user: CurrentUser, session: DbSession
) -> None:
    await vacancies.delete_draft(session, company_id, vacancy_id, user)


@router.get(f"{HR}/applications", response_model=HrApplicationPage)
async def hr_applications(
    company_id: uuid.UUID,
    user: CurrentUser,
    session: DbSession,
    vacancy_id: uuid.UUID | None = None,
    status: ApplicationStatus | None = None,
    tab: Literal["ranked", "excluded"] | None = None,
    min_score: Annotated[float | None, Query(ge=0, le=100)] = None,
    sort: Literal["recent", "score"] = "recent",
    page: Page = 1,
    page_size: PageSize = 20,
) -> HrApplicationPage:
    return await applications.hr_list(
        session, company_id, user, vacancy_id, status, page, page_size, tab, min_score, sort
    )


@router.patch(f"{HR}/applications/{{application_id}}", response_model=HrApplication)
async def hr_update_application(
    company_id: uuid.UUID,
    application_id: uuid.UUID,
    data: HrApplicationUpdate,
    user: CurrentUser,
    session: DbSession,
) -> HrApplication:
    return await applications.hr_update_status(
        session, company_id, application_id, user, data.status
    )


@router.get(f"{HR}/applications/{{application_id}}/resume", response_class=Response)
async def hr_application_resume(
    company_id: uuid.UUID,
    application_id: uuid.UUID,
    user: CurrentUser,
    session: DbSession,
    storage: StorageDep,
) -> Response:
    data, content_type, filename = await applications.hr_resume(
        session, company_id, application_id, user, storage
    )
    return Response(
        data,
        media_type=content_type,
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}",
            "X-Content-Type-Options": "nosniff",
        },
    )
