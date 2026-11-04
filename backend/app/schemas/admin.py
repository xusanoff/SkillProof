import uuid
from datetime import datetime
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, StringConstraints

from app.models.enums import UserRole, VacancyStatus

Reason = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]


class AdminOverview(BaseModel):
    candidates: int
    hr_users: int
    companies: int
    blocked_companies: int
    published_vacancies: int
    hidden_vacancies: int
    applications: int
    ai_calls_30d: int
    ai_cost_usd_30d: float
    ai_calls_unpriced_30d: int


class AdminUser(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    full_name: str
    role: UserRole
    is_active: bool
    is_email_verified: bool
    created_at: datetime


class AdminUserPage(BaseModel):
    items: list[AdminUser]
    total: int
    page: int
    page_size: int


class AdminUserUpdate(BaseModel):
    is_active: bool


class AdminCompany(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    is_verified: bool
    blocked_at: datetime | None
    block_reason: str | None
    members: int
    vacancies: int
    created_at: datetime


class AdminCompanyPage(BaseModel):
    items: list[AdminCompany]
    total: int
    page: int
    page_size: int


class AdminCompanyUpdate(BaseModel):
    is_verified: bool | None = None
    blocked: bool | None = None
    reason: Reason | None = None


class AdminVacancy(BaseModel):
    id: uuid.UUID
    title: str
    company_id: uuid.UUID
    company_name: str
    status: VacancyStatus
    hidden_at: datetime | None
    hidden_reason: str | None
    created_at: datetime


class AdminVacancyPage(BaseModel):
    items: list[AdminVacancy]
    total: int
    page: int
    page_size: int


class AdminVacancyUpdate(BaseModel):
    hidden: bool
    reason: Reason | None = None


class ThresholdsOut(BaseModel):
    defaults: dict[str, Any]
    overrides: dict[str, Any]
    effective: dict[str, Any]
    updated_at: datetime | None


class ThresholdsIn(BaseModel):
    overrides: dict[str, Any]


class UsageBucket(BaseModel):
    key: str
    calls: int
    input_tokens: int
    output_tokens: int
    seconds: float
    characters: int
    cost_usd: float
    unpriced_calls: int
    failed_calls: int


class AiUsageOut(BaseModel):
    days: int
    total: UsageBucket
    by_day: list[UsageBucket]
    by_kind: list[UsageBucket]
    by_model: list[UsageBucket]
    by_role: list[UsageBucket]
