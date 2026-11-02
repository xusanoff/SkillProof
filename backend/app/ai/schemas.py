"""Output schemas of the Phase 3 AI roles (spec §6.6). Validated by LLMClient."""

from typing import Annotated, Literal

from pydantic import BaseModel, Field

from app.schemas.assessment import Rubric, Solution, TestCase


class GeneratedQuestion(BaseModel):
    skill: str
    type: Literal["open", "mcq", "scenario"]
    difficulty: Annotated[int, Field(ge=1, le=5)]
    text: str
    options: list[str] | None = None
    correct_answer: list[int] | None = None
    rubric: Rubric | None = None
    reference_answer: str | None = None


class GeneratedQuestions(BaseModel):
    questions: list[GeneratedQuestion]
    insufficient_context: bool = False


class GeneratedTask(BaseModel):
    skill: str
    title: str
    statement: str
    difficulty: Annotated[int, Field(ge=1, le=5)]
    starter_code: dict[str, str]
    visible_tests: list[TestCase]
    hidden_tests: list[TestCase]
    rubric: Rubric
    reference_solution: Solution
    insufficient_context: bool = False


class ItemVerdict(BaseModel):
    valid: bool
    reasons: list[str] = []
    confidence: Annotated[float, Field(ge=0, le=1)] = 1.0
    injection_attempt: bool = False


class ReviewCriterion(BaseModel):
    key: str
    score: Annotated[float, Field(ge=0)]
    rationale: str
    lines: list[int] = []


class ReviewPoint(BaseModel):
    text: str
    lines: list[int]


class ReviewFinding(BaseModel):
    line: int
    comment: str


class CodeReview(BaseModel):
    criteria: list[ReviewCriterion]
    findings: list[ReviewFinding] = []
    strengths: list[ReviewPoint] = []
    weaknesses: list[ReviewPoint] = []
    rationale: str
    confidence: Annotated[float, Field(ge=0, le=1)]
    insufficient_evidence: bool = False
    injection_attempt: bool = False
