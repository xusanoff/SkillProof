"""'Generate with AI' (spec §6.3): question_generator + task_generator, each item checked by
guardrails, item_verifier and (tasks) the sandbox. Invalid → regenerate once → else flagged."""

from dataclasses import dataclass, field
from typing import Any

from app.ai.guardrails import check_schema, check_texts, validate_reference_solution
from app.ai.llm_client import LLMClient
from app.ai.prompting import build_request
from app.ai.schemas import GeneratedQuestion, GeneratedQuestions, GeneratedTask, ItemVerdict
from app.models.enums import VerificationStatus
from app.sandbox.client import Limits, Sandbox
from app.schemas.assessment import QuestionIn, TaskIn

VERSION = "v1"


@dataclass
class VacancyContext:
    title: str
    description: str
    requirements: str | None
    experience_level: str
    skills: list[dict[str, Any]]  # [{"id", "name", "weight"}]
    language: str
    difficulty: int
    allowed_languages: list[str] = field(default_factory=lambda: ["python"])
    time_limit_minutes: int = 30

    def block(self, **extra: Any) -> dict[str, Any]:
        return {
            "title": self.title,
            "description": self.description[:4000],
            "requirements": (self.requirements or "")[:2000],
            "experience_level": self.experience_level,
            "skills": [{"name": s["name"], "weight": s["weight"]} for s in self.skills],
            "difficulty": self.difficulty,
            **extra,
        }


@dataclass
class GeneratedItem:
    data: dict[str, Any]  # QuestionIn / TaskIn fields
    status: VerificationStatus
    report: dict[str, Any]
    model: str
    prompt_version: str


async def _verify(llm: LLMClient, ctx: VacancyContext, item: dict[str, Any]) -> list[str]:
    req = build_request(
        "item_verifier",
        VERSION,
        ctx.language,
        {"vacancy": ctx.block(), "item": item},
        temperature=0.0,
        max_tokens=800,
    )
    result = await llm.complete_json(req, ItemVerdict)
    if result.output is None:
        return ["verifier_output_invalid"]
    if result.output.injection_attempt:
        return ["injection_attempt", *result.output.reasons]
    return (
        []
        if result.output.valid
        else [f"verifier: {r}" for r in result.output.reasons or ["invalid"]]
    )


def _skill_id(ctx: VacancyContext, name: str) -> str | None:
    for s in ctx.skills:
        if s["name"].lower() == name.lower():
            return str(s["id"])
    return None


async def _question_candidates(
    llm: LLMClient, ctx: VacancyContext, count: int
) -> tuple[list[GeneratedQuestion], str, str]:
    req = build_request(
        "question_generator",
        VERSION,
        ctx.language,
        {"vacancy": ctx.block(count=count, types=["open", "scenario", "mcq"])},
        temperature=0.3,
        max_tokens=4000,
    )
    result = await llm.complete_json(req, GeneratedQuestions)
    questions = result.output.questions if result.output else []
    return questions, result.model, result.prompt_version


async def _check_question(
    llm: LLMClient, ctx: VacancyContext, q: GeneratedQuestion
) -> tuple[dict[str, Any], list[str]]:
    data = q.model_dump(exclude={"skill"}) | {
        "skill_id": _skill_id(ctx, q.skill),
        "language": ctx.language,
        "rubric": q.rubric.model_dump() if q.rubric else None,
    }
    parsed, schema = check_schema(QuestionIn, data)
    texts = [q.text, q.reference_answer or "", *(q.options or [])]
    issues = schema.issues + check_texts(texts, ctx.language).issues
    if parsed is not None and not issues:
        issues += await _verify(llm, ctx, data)
    return data, issues


async def generate_questions(
    llm: LLMClient, ctx: VacancyContext, count: int
) -> list[GeneratedItem]:
    candidates, model, version = await _question_candidates(llm, ctx, count)
    items = []
    for q in candidates[:count]:
        data, issues = await _check_question(llm, ctx, q)
        first_issues = issues
        if issues:  # one retry for this slot
            retry, model, version = await _question_candidates(llm, ctx, 1)
            if retry:
                data, issues = await _check_question(llm, ctx, retry[0])
        status = VerificationStatus.flagged if issues else VerificationStatus.passed
        items.append(
            GeneratedItem(
                data, status, {"issues": issues, "first_attempt": first_issues}, model, version
            )
        )
    return items


async def _task_candidate(
    llm: LLMClient, ctx: VacancyContext, skill: str
) -> tuple[GeneratedTask | None, str, str]:
    req = build_request(
        "task_generator",
        VERSION,
        ctx.language,
        {
            "vacancy": ctx.block(
                skill=skill,
                allowed_languages=ctx.allowed_languages,
                time_limit_minutes=ctx.time_limit_minutes,
            )
        },
        temperature=0.3,
        max_tokens=6000,
    )
    result = await llm.complete_json(req, GeneratedTask)
    return result.output, result.model, result.prompt_version


async def _check_task(
    llm: LLMClient, ctx: VacancyContext, sandbox: Sandbox, t: GeneratedTask
) -> tuple[dict[str, Any], list[str], str]:
    data: dict[str, Any] = {
        "skill_id": _skill_id(ctx, t.skill),
        "title": t.title,
        "statement": t.statement,
        "difficulty": t.difficulty,
        "allowed_languages": ctx.allowed_languages,
        "starter_code": {k: v for k, v in t.starter_code.items() if k in ctx.allowed_languages},
        "visible_tests": [c.model_dump() for c in t.visible_tests],
        "hidden_tests": [c.model_dump() for c in t.hidden_tests],
        "time_limit_minutes": ctx.time_limit_minutes,
        "rubric": t.rubric.model_dump(),
        "reference_solution": t.reference_solution.model_dump(),
        "language": ctx.language,
    }
    parsed, schema = check_schema(TaskIn, data)
    issues = schema.issues + check_texts([t.title, t.statement], ctx.language).issues
    sandbox_state = "not_run"
    if parsed is not None and not issues:
        issues += await _verify(llm, ctx, data)
    if parsed is not None and not issues:
        sol = t.reference_solution
        sandbox_state, sandbox_issues = await validate_reference_solution(
            sandbox,
            sol.language,
            sol.code,
            data["visible_tests"] + data["hidden_tests"],
            Limits(),
        )
        issues += sandbox_issues
    return data, issues, sandbox_state


async def generate_task(
    llm: LLMClient, ctx: VacancyContext, sandbox: Sandbox, skill: str
) -> GeneratedItem | None:
    first_issues: list[str] = []
    data: dict[str, Any] = {}
    issues: list[str] = ["no_output"]
    state = "not_run"
    model = version = ""
    for attempt in range(2):
        task, model, version = await _task_candidate(llm, ctx, skill)
        if task is None:
            continue
        data, issues, state = await _check_task(llm, ctx, sandbox, task)
        if attempt == 0:
            first_issues = issues
        if not issues:
            break
    if not data:
        return None
    if issues:
        status = VerificationStatus.flagged
    elif state == "unavailable":
        status = VerificationStatus.sandbox_pending
    else:
        status = VerificationStatus.passed
    report = {"issues": issues, "first_attempt": first_issues, "sandbox": state}
    return GeneratedItem(data, status, report, model, version)
