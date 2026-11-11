import uuid
from datetime import datetime
from typing import Annotated, Any, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.core.config import get_settings
from app.core.thresholds import BudgetThresholds
from app.models.enums import (
    ItemSource,
    JobStatus,
    QuestionMode,
    QuestionType,
    TaskType,
    VerificationStatus,
)

Lang = Literal["uz", "ru", "en"]
Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=10000)]
Difficulty = Annotated[int, Field(ge=1, le=5)]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class RubricCriterion(_Strict):
    key: Annotated[str, StringConstraints(pattern=r"^[a-z0-9_]{1,40}$")]
    name: Annotated[str, StringConstraints(min_length=1, max_length=120)]
    description: Annotated[str, StringConstraints(max_length=1000)] = ""
    max_points: Annotated[int, Field(ge=1, le=10)]
    # Optional level descriptions, e.g. {"0": "missing", "3": "partly", "5": "complete"}
    levels: dict[str, str] = {}


class Rubric(_Strict):
    criteria: Annotated[list[RubricCriterion], Field(min_length=1, max_length=10)]

    @model_validator(mode="after")
    def _unique_keys(self) -> Self:
        if len({c.key for c in self.criteria}) != len(self.criteria):
            raise ValueError("rubric criterion keys must be unique")
        return self


class TestCase(_Strict):
    __test__ = False  # not a pytest class
    name: Annotated[str, StringConstraints(max_length=80)] = ""
    input: Annotated[str, StringConstraints(max_length=20000)] = ""
    output: Annotated[str, StringConstraints(max_length=20000)]


class Solution(_Strict):
    language: str
    code: Annotated[str, StringConstraints(min_length=1, max_length=50000)]


def _check_languages(langs: list[str]) -> None:
    supported = set(get_settings().sandbox_languages)
    unknown = [lang for lang in langs if lang not in supported]
    if unknown:
        raise ValueError(f"unsupported languages: {unknown}; supported: {sorted(supported)}")


class QuestionIn(_Strict):
    skill_id: uuid.UUID | None = None
    type: QuestionType
    difficulty: Difficulty = 3
    text: Text
    options: Annotated[list[Text], Field(min_length=2, max_length=8)] | None = None
    correct_answer: list[int] | None = None
    rubric: Rubric | None = None
    reference_answer: Text | None = None
    language: Lang = "uz"

    @model_validator(mode="after")
    def _by_type(self) -> Self:
        if self.type is QuestionType.mcq:
            if not self.options or not self.correct_answer:
                raise ValueError("mcq questions need options and correct_answer")
            if any(i < 0 or i >= len(self.options) for i in self.correct_answer):
                raise ValueError("correct_answer index out of range")
        else:
            if self.rubric is None or not self.reference_answer:
                raise ValueError("open/scenario questions need a rubric and a reference_answer")
            if self.options:
                raise ValueError("only mcq questions have options")
        return self


class TaskIn(_Strict):
    skill_id: uuid.UUID | None = None
    task_type: TaskType = TaskType.coding
    difficulty: Difficulty = 3
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=200)]
    statement: Text
    allowed_languages: Annotated[list[str], Field(min_length=1)]
    starter_code: dict[str, Annotated[str, StringConstraints(max_length=20000)]] = {}
    visible_tests: Annotated[list[TestCase], Field(min_length=1, max_length=20)]
    hidden_tests: Annotated[list[TestCase], Field(min_length=1, max_length=50)]
    time_limit_minutes: Annotated[int, Field(ge=5, le=180)] = 30
    cpu_time_limit_s: Annotated[int, Field(ge=1, le=15)] = 2
    memory_limit_mb: Annotated[int, Field(ge=32, le=1024)] = 256
    rubric: Rubric
    reference_solution: Solution | None = None
    language: Lang = "uz"

    @model_validator(mode="after")
    def _languages(self) -> Self:
        _check_languages(self.allowed_languages)
        if set(self.starter_code) - set(self.allowed_languages):
            raise ValueError("starter_code has a language that is not allowed")
        if self.reference_solution and (
            self.reference_solution.language not in self.allowed_languages
        ):
            raise ValueError("reference_solution language must be one of allowed_languages")
        return self


class _ItemMeta(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID | None
    is_global: bool
    source: ItemSource
    is_approved: bool
    verification_status: VerificationStatus
    verification_report: dict[str, Any]
    model: str | None
    prompt_version: str | None
    created_at: datetime
    updated_at: datetime


class QuestionOut(_ItemMeta):
    skill_id: uuid.UUID | None
    type: QuestionType
    difficulty: int
    text: str
    options: list[str] | None
    correct_answer: list[int] | None
    rubric: dict[str, Any]
    reference_answer: str | None
    language: str


class TaskOut(_ItemMeta):
    skill_id: uuid.UUID | None
    task_type: TaskType
    difficulty: int
    title: str
    statement: str
    allowed_languages: list[str]
    starter_code: dict[str, str]
    visible_tests: list[dict[str, Any]]
    hidden_tests: list[dict[str, Any]]
    time_limit_minutes: int
    cpu_time_limit_s: int
    memory_limit_mb: int
    rubric: dict[str, Any]
    reference_solution: dict[str, Any] | None
    language: str


class Page[T](BaseModel):
    items: list[T]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------- assessment


class Stage1Config(_Strict):
    budget: dict[str, int] = {}

    @model_validator(mode="after")
    def _budget(self) -> Self:
        BudgetThresholds.model_validate(self.budget)
        return self

    task_ids: Annotated[list[uuid.UUID], Field(max_length=5)] = []
    duration_minutes: Annotated[int, Field(ge=5, le=240)] | None = None
    pass_threshold: Annotated[float, Field(ge=0, le=100)] | None = None


class Stage2Config(_Strict):
    duration_minutes: Annotated[int, Field(ge=5, le=120)] | None = None
    question_count: Annotated[int, Field(ge=1, le=30)] | None = None
    adaptive: bool = True
    mode: Literal["voice", "text"] = "voice"
    pass_threshold: Annotated[float, Field(ge=0, le=100)] | None = None


class AssessmentQuestionIn(_Strict):
    question_id: uuid.UUID
    is_mandatory: bool = False


class AssessmentIn(_Strict):
    language: Lang = "uz"
    stage1_config: Stage1Config = Stage1Config()
    stage2_config: Stage2Config = Stage2Config()
    integrity_config: dict[str, Any] = {}
    question_mode: QuestionMode = QuestionMode.manual
    allow_skill_reuse: bool = True
    auto_approve_ai_items: bool = False
    questions: Annotated[list[AssessmentQuestionIn], Field(max_length=60)] = []


class ReadinessIssue(BaseModel):
    code: str
    severity: Literal["blocking", "warning"] = "blocking"
    details: dict[str, Any] = {}


class AssessmentOut(BaseModel):
    id: uuid.UUID
    vacancy_id: uuid.UUID
    language: str
    stage1_config: dict[str, Any]
    stage2_config: dict[str, Any]
    integrity_config: dict[str, Any]
    question_mode: QuestionMode
    allow_skill_reuse: bool
    auto_approve_ai_items: bool
    tasks: list[TaskOut]
    questions: list[QuestionOut]
    mandatory_question_ids: list[uuid.UUID]
    # Thresholds after merging global defaults with this assessment's overrides.
    effective_thresholds: dict[str, Any]
    ready: bool
    issues: list[ReadinessIssue]
    updated_at: datetime


class GenerateIn(_Strict):
    question_count: Annotated[int, Field(ge=0, le=20)] = 8
    task_count: Annotated[int, Field(ge=0, le=3)] = 1
    difficulty: Difficulty = 3
    skill_ids: Annotated[list[uuid.UUID], Field(max_length=10)] = []  # default: vacancy skills


class GenerationJobOut(BaseModel):
    id: uuid.UUID
    assessment_id: uuid.UUID
    status: JobStatus
    params: dict[str, Any]
    result: dict[str, Any]
    error: str | None
    created_at: datetime
    updated_at: datetime
