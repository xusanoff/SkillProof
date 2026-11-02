import uuid
from typing import Any

from sqlalchemy import Boolean, ForeignKey, Integer, SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import Timestamps, UUIDPk
from app.models.enums import (
    ItemSource,
    JobStatus,
    QuestionMode,
    QuestionType,
    TaskType,
    VerificationStatus,
)
from app.models.user import str_enum


class _Item(UUIDPk, Timestamps):
    """Shared columns of bank items. company_id NULL = global template (admin-managed)."""

    company_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    skill_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("skills.id"), index=True)
    difficulty: Mapped[int] = mapped_column(SmallInteger, default=3)
    language: Mapped[str] = mapped_column(String(8), default="uz")
    source: Mapped[ItemSource] = mapped_column(str_enum(ItemSource), default=ItemSource.manual)
    is_approved: Mapped[bool] = mapped_column(Boolean, default=False)
    verification_status: Mapped[VerificationStatus] = mapped_column(
        str_enum(VerificationStatus), default=VerificationStatus.not_checked
    )
    verification_report: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    model: Mapped[str | None] = mapped_column(String(100))
    prompt_version: Mapped[str | None] = mapped_column(String(40))
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )


class Question(_Item, Base):
    __tablename__ = "questions"

    type: Mapped[QuestionType] = mapped_column(str_enum(QuestionType))
    text: Mapped[str] = mapped_column(Text)
    options: Mapped[list[str] | None] = mapped_column(JSONB)  # mcq only
    correct_answer: Mapped[Any] = mapped_column(JSONB)  # mcq: list of option indexes
    rubric: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    reference_answer: Mapped[str | None] = mapped_column(Text)


class PracticalTask(_Item, Base):
    __tablename__ = "practical_tasks"

    task_type: Mapped[TaskType] = mapped_column(str_enum(TaskType), default=TaskType.coding)
    title: Mapped[str] = mapped_column(String(200))
    statement: Mapped[str] = mapped_column(Text)
    allowed_languages: Mapped[list[str]] = mapped_column(JSONB, default=list)
    starter_code: Mapped[dict[str, str]] = mapped_column(JSONB, default=dict)
    # Tests are stdin → expected stdout pairs (Judge0-friendly): [{"name", "input", "output"}]
    visible_tests: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    hidden_tests: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    time_limit_minutes: Mapped[int] = mapped_column(Integer, default=30)
    cpu_time_limit_s: Mapped[int] = mapped_column(Integer, default=2)
    memory_limit_mb: Mapped[int] = mapped_column(Integer, default=256)
    rubric: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    reference_solution: Mapped[dict[str, Any] | None] = mapped_column(JSONB)  # {language, code}


class Assessment(UUIDPk, Timestamps, Base):
    __tablename__ = "assessments"

    vacancy_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("vacancies.id", ondelete="CASCADE"), unique=True
    )
    language: Mapped[str] = mapped_column(String(8), default="uz")
    stage1_config: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    stage2_config: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    integrity_config: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    question_mode: Mapped[QuestionMode] = mapped_column(
        str_enum(QuestionMode), default=QuestionMode.manual
    )
    allow_skill_reuse: Mapped[bool] = mapped_column(Boolean, default=True)
    auto_approve_ai_items: Mapped[bool] = mapped_column(Boolean, default=False)


class AssessmentQuestion(Base):
    __tablename__ = "assessment_questions"

    assessment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("assessments.id", ondelete="CASCADE"), primary_key=True
    )
    question_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), primary_key=True
    )
    order: Mapped[int] = mapped_column(Integer, default=0)
    is_mandatory: Mapped[bool] = mapped_column(Boolean, default=False)


class GenerationJob(UUIDPk, Timestamps, Base):
    """'Generate with AI' runs in the arq worker; the UI polls this row."""

    __tablename__ = "generation_jobs"

    company_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    assessment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("assessments.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[JobStatus] = mapped_column(str_enum(JobStatus), default=JobStatus.queued)
    params: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    result: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    error: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
