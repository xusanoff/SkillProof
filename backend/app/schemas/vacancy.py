import uuid
from datetime import datetime
from typing import Annotated, Literal, Self

from pydantic import BaseModel, Field, StringConstraints, model_validator

from app.models.enums import (
    ApplicationStatus,
    EmploymentType,
    ExperienceLevel,
    RemoteType,
    VacancyStatus,
)
from app.schemas.common import CountryCode, CurrencyCode

LocalizedNames = dict[str, str]


class RegionOut(BaseModel):
    code: str
    country: str
    names: LocalizedNames


class ProfessionAreaOut(BaseModel):
    slug: str
    names: LocalizedNames


class SkillOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    category: str


class Suggestion(BaseModel):
    type: Literal["vacancy", "skill", "company"]
    text: str
    slug: str | None


class CompanyBrief(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    logo_url: str | None
    is_verified: bool


class SkillTag(BaseModel):
    name: str
    slug: str


class Viewer(BaseModel):
    is_saved: bool
    application_status: ApplicationStatus | None


class VacancyCard(BaseModel):
    id: uuid.UUID
    title: str
    company: CompanyBrief
    region_code: str | None
    city: str | None
    remote_type: RemoteType
    employment_type: EmploymentType
    experience_level: ExperienceLevel
    salary_min: int | None
    salary_max: int | None
    currency: str
    skills: list[SkillTag]
    published_at: datetime | None
    has_assessment: bool = False
    viewer: Viewer | None = None


class VacancySkillOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    weight: int
    is_required: bool


class VacancyDetail(VacancyCard):
    description: str
    requirements: str | None
    profession_area: str
    country: str
    status: VacancyStatus
    skills: list[VacancySkillOut]  # type: ignore[assignment]
    applications_count: int | None = None


class FacetValue(BaseModel):
    value: str
    count: int


class Facets(BaseModel):
    region: list[FacetValue] = []
    remote_type: list[FacetValue] = []
    employment_type: list[FacetValue] = []
    experience_level: list[FacetValue] = []


class VacancyPage(BaseModel):
    items: list[VacancyCard]
    total: int
    page: int
    page_size: int
    facets: Facets | None = None


SortOrder = Literal["relevance", "date", "salary_desc", "salary_asc"]


class VacancySkillIn(BaseModel):
    skill_id: uuid.UUID
    weight: Annotated[int, Field(ge=1, le=5)] = 3
    is_required: bool = False


class VacancyInput(BaseModel):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=200)]
    description: Annotated[str, StringConstraints(max_length=20000)] = ""
    requirements: Annotated[str, StringConstraints(max_length=10000)] | None = None
    profession_area: str = "it"
    country: CountryCode = "UZ"
    region_code: Annotated[str, StringConstraints(max_length=10)] | None = None
    city: Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] | None = None
    remote_type: RemoteType
    employment_type: EmploymentType
    experience_level: ExperienceLevel
    salary_min: Annotated[int, Field(ge=0)] | None = None
    salary_max: Annotated[int, Field(ge=0)] | None = None
    currency: CurrencyCode = "UZS"
    skills: Annotated[list[VacancySkillIn], Field(max_length=20)] = []

    @model_validator(mode="after")
    def _check(self) -> Self:
        if (
            self.salary_min is not None
            and self.salary_max is not None
            and self.salary_min > self.salary_max
        ):
            raise ValueError("salary_min must not exceed salary_max")
        if len({s.skill_id for s in self.skills}) != len(self.skills):
            raise ValueError("duplicate skills")
        return self


class VacancyPatch(BaseModel):
    """Partial update; omitted fields stay unchanged. Merged with the current values and
    re-validated as a full VacancyInput."""

    model_config = {"extra": "forbid"}

    title: str | None = None
    description: str | None = None
    requirements: str | None = None
    profession_area: str | None = None
    country: str | None = None
    region_code: str | None = None
    city: str | None = None
    remote_type: RemoteType | None = None
    employment_type: EmploymentType | None = None
    experience_level: ExperienceLevel | None = None
    salary_min: int | None = None
    salary_max: int | None = None
    currency: str | None = None
    skills: list[VacancySkillIn] | None = None
    status: VacancyStatus | None = None


class HrVacancy(VacancyCard):
    status: VacancyStatus
    applications_count: int
    new_applications_count: int
    updated_at: datetime


class HrVacancyPage(BaseModel):
    items: list[HrVacancy]
    total: int
    page: int
    page_size: int
    # All of the company's vacancies per status (ignores the status/q filters) for the tabs.
    counts_by_status: dict[VacancyStatus, int]


class ApplyIn(BaseModel):
    cover_note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=3000)] | None = (
        None
    )


class ApplicationOut(BaseModel):
    id: uuid.UUID
    status: ApplicationStatus
    cover_note: str | None
    created_at: datetime
    updated_at: datetime
    vacancy: VacancyCard


class ApplicationPage(BaseModel):
    items: list[ApplicationOut]
    total: int
    page: int
    page_size: int


class HrCandidate(BaseModel):
    user_id: uuid.UUID
    full_name: str
    email: str
    headline: str | None
    country: str | None
    city: str | None
    experience_years: int | None
    desired_salary_min: int | None
    desired_salary_max: int | None
    currency: str | None
    has_resume: bool


class VacancyRef(BaseModel):
    id: uuid.UUID
    title: str


class HrApplication(BaseModel):
    id: uuid.UUID
    status: ApplicationStatus
    suspicion_percent: int | None = None
    suspicion_label: str | None = None
    disqualification_reason: str | None = None
    final_score: float | None = None
    stage1_score: float | None = None
    stage2_score: float | None = None
    recommendation: str | None = None
    needs_review: bool = False
    report_state: str | None = None
    cover_note: str | None
    created_at: datetime
    updated_at: datetime
    vacancy: VacancyRef
    candidate: HrCandidate


class HrApplicationPage(BaseModel):
    items: list[HrApplication]
    total: int
    page: int
    page_size: int


class HrApplicationUpdate(BaseModel):
    status: Literal["applied", "shortlisted", "rejected", "hired"]
