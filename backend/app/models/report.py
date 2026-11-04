"""The application's final report and what HR does with it (spec §5, §6.5, §8)."""

import uuid
from typing import Any

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import CreatedAt, Timestamps, UUIDPk
from app.models.enums import EvaluationState
from app.models.user import str_enum


class SessionReport(UUIDPk, Timestamps, Base):
    """One per application, rewritten when the application reaches a later stage. Suspicion stays
    on `applications` (D-110). Scores here already include HR overrides; `hr_overrides` keeps the
    values they replaced."""

    __tablename__ = "session_reports"

    application_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE"), unique=True
    )
    state: Mapped[EvaluationState] = mapped_column(
        str_enum(EvaluationState), default=EvaluationState.pending
    )
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    needs_review: Mapped[bool] = mapped_column(default=False)
    stage1_score: Mapped[float | None] = mapped_column()
    stage2_score: Mapped[float | None] = mapped_column()
    overall_score: Mapped[float | None] = mapped_column()
    stage2_passed: Mapped[bool | None] = mapped_column()
    # [{skill_id, name, percent, stage1_percent, stage2_percent}]
    per_skill_scores: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    summary_for_hr: Mapped[str] = mapped_column(Text, default="")
    # [{text, ref, quote, lines, excerpt}]
    strengths: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    gaps: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    recommendation: Mapped[str | None] = mapped_column(String(16))
    # [{stage, type, severity, at_ms, evidence}]
    suspicion_explanation: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    # {mistakes: [{text, about}], learn_next: [{topic, reason}]}
    candidate_feedback: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    model: Mapped[str] = mapped_column(String(100), default="")
    prompt_version: Mapped[str] = mapped_column(String(64), default="")


class HrOverride(UUIDPk, CreatedAt, Base):
    __tablename__ = "hr_overrides"

    application_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE"), index=True
    )
    field: Mapped[str] = mapped_column(String(32))
    old_value: Mapped[str | None] = mapped_column(String(64))
    new_value: Mapped[str | None] = mapped_column(String(64))
    comment: Mapped[str] = mapped_column(Text)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))


class ApplicationNote(UUIDPk, CreatedAt, Base):
    """Private to the company's HR team (spec §8); the candidate never sees these."""

    __tablename__ = "application_notes"

    application_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE"), index=True
    )
    author_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    text: Mapped[str] = mapped_column(Text)
