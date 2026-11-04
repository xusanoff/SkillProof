import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.models.enums import ApplicationStatus, EvaluationState, SessionStatus, SignalSeverity
from app.schemas.interview import Stage1TaskResult
from app.schemas.verified_skill import ReusedSkillOut


class SkillScore(BaseModel):
    skill_id: uuid.UUID
    name: str
    percent: float
    stage1_percent: float | None = None
    stage2_percent: float | None = None
    reused: list[str] = []  # stages whose result came from a verified skill


class ReportPoint(BaseModel):
    text: str
    ref: str
    quote: str = ""
    lines: list[int] = []
    excerpt: str = ""


class ExplainedSignal(BaseModel):
    stage: str
    type: str
    severity: SignalSeverity
    at_ms: int | None
    evidence: dict[str, Any]


class TimelineSignal(ExplainedSignal):
    id: uuid.UUID
    created_at: datetime


class OverrideOut(BaseModel):
    id: uuid.UUID
    field: str
    old_value: str | None
    new_value: str | None
    comment: str
    actor_name: str | None
    created_at: datetime


class TurnCriterion(BaseModel):
    key: str
    score: float
    rationale: str
    quote: str = ""


class HrTurn(BaseModel):
    id: uuid.UUID
    order: int
    kind: str
    is_follow_up: bool
    question_text: str
    transcript: str | None
    answer_source: str | None
    has_answer_audio: bool
    response_latency_ms: int | None
    silence_ms: int | None
    flags: dict[str, Any]
    percent: float | None
    needs_review: bool
    criteria: list[TurnCriterion]
    rationale: str
    confidence: float | None
    model: str
    prompt_version: str


class HrStage2(BaseModel):
    session_id: uuid.UUID
    status: SessionStatus
    mode: str
    evaluation_state: EvaluationState
    disqualification_reason: str | None
    pass_threshold: float | None
    passed: bool | None
    turns: list[HrTurn]


class HrReport(BaseModel):
    application_id: uuid.UUID
    candidate_name: str
    vacancy_title: str
    status: ApplicationStatus
    state: EvaluationState | None  # null: nothing to report on yet
    needs_review: bool
    stage1_score: float | None
    stage2_score: float | None
    overall_score: float | None
    per_skill: list[SkillScore]
    reused_skills: list[ReusedSkillOut] = []
    summary: str
    strengths: list[ReportPoint]
    gaps: list[ReportPoint]
    recommendation: str | None
    suspicion_percent: int | None
    suspicion_label: str | None
    disqualification_reason: str | None
    reasons: list[ExplainedSignal]
    signals: list[TimelineSignal]
    stage2: HrStage2 | None
    overrides: list[OverrideOut]
    model: str
    prompt_version: str


class OverrideIn(BaseModel):
    field: Literal[
        "stage1_score", "stage2_score", "overall_score", "recommendation", "disqualification"
    ]
    # A number for scores, a recommendation value, or null to lift a disqualification.
    value: float | str | None = None
    comment: str = Field(min_length=3, max_length=2000)


class NoteIn(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


class NoteOut(BaseModel):
    id: uuid.UUID
    text: str
    author_name: str | None
    created_at: datetime


class CandidateMistake(BaseModel):
    text: str
    about: str


class CandidateLearnItem(BaseModel):
    topic: str
    reason: str


class CandidateSkill(BaseModel):
    name: str
    percent: float
    reused: bool = False


class CandidateAnswer(BaseModel):
    order: int
    question_text: str
    percent: float | None


class CandidateResults(BaseModel):
    """No suspicion, signals, recommendation, reference answers or hidden test details (§6.5). The
    only integrity fact here is the reason for a disqualification."""

    application_id: uuid.UUID
    vacancy_title: str
    status: ApplicationStatus
    state: Literal["not_ready", "pending", "done", "failed"]
    disqualification_reason: str | None = None
    stage1_score: float | None = None
    stage2_score: float | None = None
    overall_score: float | None = None
    per_skill: list[CandidateSkill] = []
    tasks: list[Stage1TaskResult] = []
    answers: list[CandidateAnswer] = []
    mistakes: list[CandidateMistake] = []
    learn_next: list[CandidateLearnItem] = []
