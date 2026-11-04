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
    InterviewTurn,
    RulesAcceptance,
)
from app.models.report import ApplicationNote, HrOverride, SessionReport
from app.models.user import AuthToken, User
from app.models.vacancy import Application, SavedVacancy, Vacancy, VacancySkill
from app.models.verified_skill import VerifiedSkill

__all__ = [
    "Application",
    "ApplicationNote",
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
    "HrOverride",
    "IntegritySignal",
    "InterviewSession",
    "InterviewTurn",
    "PracticalTask",
    "ProfessionArea",
    "Question",
    "Region",
    "RulesAcceptance",
    "SavedVacancy",
    "SessionReport",
    "Skill",
    "User",
    "Vacancy",
    "VacancySkill",
    "VerifiedSkill",
]
