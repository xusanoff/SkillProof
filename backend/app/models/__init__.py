"""SQLAlchemy models. Import every model module here so Alembic autogenerate sees it."""

from app.core.db import Base
from app.models.assessment import (
    Assessment,
    AssessmentQuestion,
    GenerationJob,
    PracticalTask,
    Question,
)
from app.models.audit import AuditLog
from app.models.candidate import CandidateProfile
from app.models.catalog import ProfessionArea, Region, Skill
from app.models.company import Company, CompanyInvitation, CompanyMember
from app.models.interview import (
    CodeSubmission,
    EditorEvent,
    Evaluation,
    IntegritySignal,
    InterviewSession,
    RulesAcceptance,
)
from app.models.user import AuthToken, User
from app.models.vacancy import Application, SavedVacancy, Vacancy, VacancySkill

__all__ = [
    "Application",
    "Assessment",
    "AssessmentQuestion",
    "AuditLog",
    "AuthToken",
    "Base",
    "CandidateProfile",
    "CodeSubmission",
    "Company",
    "CompanyInvitation",
    "CompanyMember",
    "EditorEvent",
    "Evaluation",
    "GenerationJob",
    "IntegritySignal",
    "InterviewSession",
    "PracticalTask",
    "ProfessionArea",
    "Question",
    "Region",
    "RulesAcceptance",
    "SavedVacancy",
    "Skill",
    "User",
    "Vacancy",
    "VacancySkill",
]
