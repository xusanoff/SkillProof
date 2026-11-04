import uuid

from pydantic import BaseModel


class FunnelRow(BaseModel):
    applied: int
    stage1_started: int
    stage1_passed: int
    stage2_started: int
    stage2_passed: int
    shortlisted: int
    hired: int
    stage1_pass_rate: float | None
    stage2_pass_rate: float | None
    avg_stage1_score: float | None
    avg_stage2_score: float | None
    avg_overall_score: float | None


class VacancyAnalytics(BaseModel):
    vacancy_id: uuid.UUID
    title: str
    funnel: FunnelRow


class CompanyAnalytics(BaseModel):
    days: int
    total: FunnelRow
    median_hours_to_shortlist: float | None
    vacancies: list[VacancyAnalytics]
