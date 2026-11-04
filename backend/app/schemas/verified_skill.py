import uuid
from datetime import datetime

from pydantic import BaseModel


class VerifiedSkillOut(BaseModel):
    id: uuid.UUID
    skill_id: uuid.UUID
    name: str
    score: float
    level: str
    verified_at: datetime
    valid_until: datetime
    is_public: bool
    is_valid: bool


class VerifiedSkillUpdate(BaseModel):
    is_public: bool


class SkillBadge(BaseModel):
    """What others may see. Never which company or application it came from."""

    skill_id: uuid.UUID
    name: str
    score: float
    level: str
    verified_at: datetime
    valid_until: datetime


class PublicProfile(BaseModel):
    candidate_id: uuid.UUID
    full_name: str
    headline: str | None
    country: str | None
    city: str | None
    experience_years: int | None
    skills: list[SkillBadge]


class TalentPage(BaseModel):
    items: list[PublicProfile]
    total: int
    page: int
    page_size: int


class ReuseSkillOut(BaseModel):
    skill_id: uuid.UUID
    name: str
    score: float
    level: str
    valid_until: datetime
    tasks_skipped: int
    questions_skipped: int


class ReuseOfferOut(BaseModel):
    """The choice on the rules screen: what this application can skip."""

    skills: list[ReuseSkillOut]
    tasks_total: int
    tasks_skipped: int
    questions_total: int
    questions_skipped: int


class StartStage1In(BaseModel):
    reuse: bool = False  # nothing is skipped unless the candidate chose it


class ReusedSkillOut(BaseModel):
    skill_id: uuid.UUID
    name: str
    stage: str
    percent: float
    verified_at: datetime
    valid_until: datetime
