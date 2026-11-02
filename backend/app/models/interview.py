import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import CreatedAt, Timestamps, UUIDPk
from app.models.enums import (
    EditorEventType,
    EvaluationState,
    EvaluationStatus,
    InterviewStage,
    SessionStatus,
    SignalSeverity,
)
from app.models.user import str_enum

PAGE_SEQ = 1_000_000_000


class RulesAcceptance(UUIDPk, Base):
    __tablename__ = "rules_acceptances"
    __table_args__ = (UniqueConstraint("application_id", "rules_version"),)

    application_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE"), index=True
    )
    rules_version: Mapped[str] = mapped_column(String(32))
    accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ip: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(500))


class InterviewSession(UUIDPk, Timestamps, Base):
    __tablename__ = "interview_sessions"
    __table_args__ = (UniqueConstraint("application_id", "stage"),)

    application_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE"), index=True
    )
    stage: Mapped[InterviewStage] = mapped_column(str_enum(InterviewStage))
    status: Mapped[SessionStatus] = mapped_column(
        str_enum(SessionStatus), default=SessionStatus.not_started
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    disqualification_reason: Mapped[str | None] = mapped_column(String(64))
    suspicion_score: Mapped[float | None] = mapped_column(Float)
    current_difficulty: Mapped[int | None] = mapped_column(Integer)
    # Snapshot taken at start, so later assessment edits don't change a running session (D-082):
    # {"tasks": [{"id", "limit_minutes"}], "integrity": {...}, "rules_version"}
    config: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    current_task_index: Mapped[int] = mapped_column(Integer, default=0)
    last_activity_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Set while no WebSocket is connected: pauses the inactivity timer (§7.1b).
    disconnected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    connection_id: Mapped[uuid.UUID | None] = mapped_column()
    server_seq: Mapped[int] = mapped_column(Integer, default=0)
    telemetry_pages: Mapped[int] = mapped_column(Integer, default=0)
    # Filled by the evaluation job once the stage has ended (D-087).
    evaluation_state: Mapped[EvaluationState] = mapped_column(
        str_enum(EvaluationState), default=EvaluationState.pending
    )
    evaluation_attempts: Mapped[int] = mapped_column(Integer, default=0)
    score_percent: Mapped[float | None] = mapped_column(Float)
    hidden_tests_percent: Mapped[float | None] = mapped_column(Float)
    code_review_percent: Mapped[float | None] = mapped_column(Float)
    needs_review: Mapped[bool] = mapped_column(default=False)
    passed: Mapped[bool | None] = mapped_column()


class CodeSubmission(UUIDPk, Timestamps, Base):
    """One row per shown task: `final_code` is the latest draft until `submitted_at` is set."""

    __tablename__ = "code_submissions"
    __table_args__ = (UniqueConstraint("session_id", "task_id"),)

    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("interview_sessions.id", ondelete="CASCADE"), index=True
    )
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("practical_tasks.id"))
    language: Mapped[str] = mapped_column(String(32))
    final_code: Mapped[str] = mapped_column(Text, default="")
    run_count: Mapped[int] = mapped_column(Integer, default=0)
    visible_test_results: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB)
    hidden_test_results: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB)
    shown_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class EditorEvent(Base):
    __tablename__ = "editor_events"
    # Client events: page * PAGE_SEQ + the page's own counter, so pages can't collide and sort by
    # load order however late a closing page's last batch arrives (D-090). Server events (`run`)
    # count down from -1. Resent batches after a reconnect are dropped by this constraint.
    __table_args__ = (UniqueConstraint("session_id", "seq"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("interview_sessions.id", ondelete="CASCADE")
    )
    task_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("practical_tasks.id"))
    seq: Mapped[int] = mapped_column(BigInteger)
    t_ms: Mapped[int] = mapped_column(BigInteger)
    type: Mapped[EditorEventType] = mapped_column(str_enum(EditorEventType))
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)


class IntegritySignal(UUIDPk, CreatedAt, Base):
    __tablename__ = "integrity_signals"

    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("interview_sessions.id", ondelete="CASCADE"), index=True
    )
    stage: Mapped[InterviewStage] = mapped_column(str_enum(InterviewStage))
    type: Mapped[str] = mapped_column(String(64))
    severity: Mapped[SignalSeverity] = mapped_column(str_enum(SignalSeverity))
    evidence: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)


class Evaluation(UUIDPk, CreatedAt, Base):
    __tablename__ = "evaluations"

    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("interview_sessions.id", ondelete="CASCADE"), index=True
    )
    turn_id: Mapped[uuid.UUID | None] = mapped_column()  # interview_turns arrive in Phase 6
    submission_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("code_submissions.id", ondelete="CASCADE"), index=True
    )
    score: Mapped[float | None] = mapped_column(Float)
    max_score: Mapped[float | None] = mapped_column(Float)
    criteria_scores: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    findings: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    rationale: Mapped[str] = mapped_column(Text, default="")
    strengths: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    weaknesses: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    confidence: Mapped[float | None] = mapped_column(Float)
    model: Mapped[str] = mapped_column(String(100), default="")
    prompt_version: Mapped[str] = mapped_column(String(64), default="")
    status: Mapped[EvaluationStatus] = mapped_column(
        str_enum(EvaluationStatus), default=EvaluationStatus.ok
    )
