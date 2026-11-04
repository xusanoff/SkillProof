import uuid
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession, require_role
from app.models.enums import UserRole
from app.schemas.admin import (
    AdminCompany,
    AdminCompanyPage,
    AdminCompanyUpdate,
    AdminOverview,
    AdminUser,
    AdminUserPage,
    AdminUserUpdate,
    AdminVacancy,
    AdminVacancyPage,
    AdminVacancyUpdate,
    AiUsageOut,
    ThresholdsIn,
    ThresholdsOut,
)
from app.services import admin as admin_service

# On the router, so a route added here later cannot forget the check.
router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[require_role(UserRole.admin)])

Page = Annotated[int, Query(ge=1)]
Size = Annotated[int, Query(ge=1, le=100)]
Search = Annotated[str | None, Query(max_length=200)]


@router.get("/overview", response_model=AdminOverview)
async def overview(session: DbSession) -> AdminOverview:
    return await admin_service.overview(session)


@router.get("/users", response_model=AdminUserPage)
async def users(
    session: DbSession,
    q: Search = None,
    role: UserRole | None = None,
    page: Page = 1,
    size: Size = 20,
) -> AdminUserPage:
    return await admin_service.list_users(session, q, role, page, size)


@router.patch("/users/{user_id}", response_model=AdminUser)
async def update_user(
    user_id: uuid.UUID, data: AdminUserUpdate, admin: CurrentUser, session: DbSession
) -> AdminUser:
    return await admin_service.set_user_active(session, admin, user_id, data.is_active)


@router.get("/companies", response_model=AdminCompanyPage)
async def companies(
    session: DbSession,
    q: Search = None,
    blocked: bool | None = None,
    page: Page = 1,
    size: Size = 20,
) -> AdminCompanyPage:
    return await admin_service.list_companies(session, q, blocked, page, size)


@router.patch("/companies/{company_id}", response_model=AdminCompany)
async def update_company(
    company_id: uuid.UUID, data: AdminCompanyUpdate, admin: CurrentUser, session: DbSession
) -> AdminCompany:
    return await admin_service.update_company(session, admin, company_id, data)


@router.get("/vacancies", response_model=AdminVacancyPage)
async def vacancies(
    session: DbSession,
    q: Search = None,
    hidden: bool | None = None,
    page: Page = 1,
    size: Size = 20,
) -> AdminVacancyPage:
    return await admin_service.list_vacancies(session, q, hidden, page, size)


@router.patch("/vacancies/{vacancy_id}", response_model=AdminVacancy)
async def update_vacancy(
    vacancy_id: uuid.UUID, data: AdminVacancyUpdate, admin: CurrentUser, session: DbSession
) -> AdminVacancy:
    return await admin_service.update_vacancy(session, admin, vacancy_id, data)


@router.get("/thresholds", response_model=ThresholdsOut)
async def thresholds(session: DbSession) -> ThresholdsOut:
    return await admin_service.get_thresholds(session)


@router.put("/thresholds", response_model=ThresholdsOut)
async def save_thresholds(
    data: ThresholdsIn, admin: CurrentUser, session: DbSession
) -> ThresholdsOut:
    return await admin_service.save_thresholds(session, admin, data.overrides)


@router.get("/ai-usage", response_model=AiUsageOut)
async def ai_usage(
    session: DbSession, days: Annotated[int, Query(ge=1, le=365)] = 30
) -> AiUsageOut:
    return await admin_service.ai_usage(session, days)
