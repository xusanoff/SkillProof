import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.enums import (
    ApplicationStatus,
    EditorEventType,
    EvaluationState,
    EvaluationStatus,
    InterviewStage,
    SessionStatus,
    SignalSeverity,
)
from app.models.interview import PAGE_SEQ


class RulesAcceptIn(BaseModel):
    rules_version: str = Field(max_length=32)


class CodeIn(BaseModel):
    language: str = Field(max_length=32)
    code: str = Field(max_length=200_000)


class VisibleTest(BaseModel):
    name: str
    input: str
    output: str


class TestResult(BaseModel):
    __test__ = False
    name: str
    passed: bool
    status: str
    stdout: str = ""
    stderr: str = ""
    time_ms: int = 0


class RunOut(BaseModel):
    results: list[TestResult]


class SessionTaskOut(BaseModel):
    """Pending tasks expose only `id` and `state`. Hidden tests and solutions are never sent."""

    id: uuid.UUID
    state: str  # pending | current | submitted
    title: str | None = None
    statement: str | None = None
    allowed_languages: list[str] = []
    starter_code: dict[str, str] = {}
    visible_tests: list[VisibleTest] = []
    deadline_at: datetime | None = None
    language: str | None = None
    code: str | None = None
    run_count: int = 0
    last_results: list[TestResult] | None = None


class IntegrityLimits(BaseModel):
    paste_max_lines: int
    paste_max_chars: int
    inactivity_warning_s: int
    inactivity_limit_s: int
    reconnect_window_s: int


class Stage1TaskResult(BaseModel):
    title: str
    hidden_passed: int
    hidden_total: int
    code_review_percent: float | None
    strengths: list[str]
    weaknesses: list[str]


class Stage1Result(BaseModel):
    state: str  # pending | done | failed
    score_percent: float | None = None
    pass_threshold: float | None = None
    passed: bool | None = None
    tasks: list[Stage1TaskResult] = []


class SessionOut(BaseModel):
    id: uuid.UUID
    application_id: uuid.UUID
    stage: InterviewStage
    status: SessionStatus
    disqualification_reason: str | None
    started_at: datetime | None
    expires_at: datetime | None
    completed_at: datetime | None
    server_now: datetime
    last_activity_at: datetime | None
    current_task_index: int
    tasks: list[SessionTaskOut]
    integrity: IntegrityLimits
    language_labels: dict[str, str]
    result: Stage1Result | None


class WarmupOut(BaseModel):
    minutes: int
    languages: list[str]
    language_labels: dict[str, str]
    starter_code: dict[str, str]
    visible_tests: list[VisibleTest]


class InterviewStateOut(BaseModel):
    application_id: uuid.UUID
    application_status: ApplicationStatus
    vacancy_id: uuid.UUID
    vacancy_title: str
    language: str | None
    rules_version: str
    rules_accepted: bool
    # None when Stage 1 can start. Otherwise: assessment_not_ready | application_closed | …
    blocked_reason: str | None
    warmup: WarmupOut | None
    session: SessionOut | None


class ClientEvent(BaseModel):
    seq: int = Field(ge=1, lt=PAGE_SEQ)
    task_id: uuid.UUID | None = None
    t_ms: int = Field(ge=0, description="Client clock, ms; anchored to server time on arrival")
    type: EditorEventType
    payload: dict[str, Any] = Field(default_factory=dict)


class EventBatch(BaseModel):
    sent_t_ms: int = Field(ge=0)
    events: list[ClientEvent] = Field(max_length=500)


class SignalOut(BaseModel):
    id: uuid.UUID
    type: str
    severity: SignalSeverity
    evidence: dict[str, Any]
    created_at: datetime


class SuspicionReason(BaseModel):
    type: str
    severity: SignalSeverity
    at_ms: int | None
    evidence: dict[str, Any]


class CriterionScore(BaseModel):
    key: str
    score: float
    max_score: float
    rationale: str
    lines: list[int]


class ReviewOut(BaseModel):
    status: EvaluationStatus
    score_percent: float | None
    criteria: list[CriterionScore]
    findings: list[dict[str, Any]]
    strengths: list[dict[str, Any]]
    weaknesses: list[dict[str, Any]]
    rationale: str
    confidence: float | None
    model: str
    prompt_version: str


class HrTestResult(BaseModel):
    name: str
    passed: bool
    status: str
    time_ms: int = 0


class HrTaskReport(BaseModel):
    id: uuid.UUID
    title: str
    language: str
    final_code: str
    run_count: int
    shown_at: datetime
    submitted_at: datetime | None
    visible_results: list[HrTestResult]
    hidden_results: list[HrTestResult]
    review: ReviewOut | None


class HrStage1Report(BaseModel):
    application_id: uuid.UUID
    session_id: uuid.UUID
    status: SessionStatus
    disqualification_reason: str | None
    evaluation_state: EvaluationState
    started_at: datetime | None
    completed_at: datetime | None
    score_percent: float | None
    hidden_tests_percent: float | None
    code_review_percent: float | None
    pass_threshold: float | None
    passed: bool | None
    needs_review: bool
    suspicion_percent: int | None
    suspicion_label: str | None
    reasons: list[SuspicionReason]
    signals: list[SignalOut]
    tasks: list[HrTaskReport]


class ReplayEvent(BaseModel):
    seq: int
    t_ms: int
    type: EditorEventType
    payload: dict[str, Any]


class ReplayOut(BaseModel):
    task_id: uuid.UUID
    language: str
    initial_code: str
    final_code: str
    start_ms: int
    end_ms: int
    events: list[ReplayEvent]
