"""Stage 1 code review (spec §6.4, §6.6): the `code_reviewer` role plus the guardrails around it.
Lines holding instructions for the evaluator are removed before the model sees them, so the
outcome does not rest on the model resisting them."""

from dataclasses import dataclass
from typing import Any

from app.ai.guardrails import check_review, injection_lines
from app.ai.llm_client import LLMClient
from app.ai.prompting import build_request
from app.ai.schemas import CodeReview

VERSION = "v1"
ROLE = "code_reviewer"
MAX_TOKENS = 2000


@dataclass(frozen=True)
class ReviewOutcome:
    review: CodeReview | None
    percent: float | None
    needs_review: bool
    injection_lines: list[int]
    injection_flagged: bool
    model: str
    prompt_version: str


def _percent(review: CodeReview, rubric: dict[str, Any]) -> float:
    limits = {c["key"]: c["max_points"] for c in rubric["criteria"]}
    total = sum(limits.values())
    return round(100 * sum(c.score for c in review.criteria) / total, 1) if total else 0.0


def _numbered(code: str, removed: list[int]) -> list[str]:
    return ["[removed]" if n in removed else line for n, line in enumerate(code.splitlines(), 1)]


async def _once(
    llm: LLMClient, blocks: dict[str, Any], rubric: dict[str, Any], code: str, language: str
) -> tuple[CodeReview | None, str, str]:
    """Schema failures are retried inside the client; wrong evidence gets one more try here."""
    request = build_request(ROLE, VERSION, language, blocks, temperature=0.0, max_tokens=MAX_TOKENS)
    model, version = "unknown", f"{ROLE}.{VERSION}"
    for _ in range(2):
        result = await llm.complete_json(request, CodeReview)
        model, version = result.model, result.prompt_version
        if result.output is None:
            return None, model, version
        if not check_review(result.output, rubric, code, language).issues:
            return result.output, model, version
    return None, model, version


async def review_code(
    llm: LLMClient,
    *,
    title: str,
    statement: str,
    rubric: dict[str, Any],
    code: str,
    test_results: list[dict[str, Any]],
    language: str,
    min_confidence: float,
    max_disagreement: float,
) -> ReviewOutcome:
    removed = injection_lines(code)
    blocks = {
        "task": {"title": title, "statement": statement},
        "rubric": rubric,
        "test_results": test_results,
        "candidate_code": _numbered(code, removed),
    }
    first, model, version = await _once(llm, blocks, rubric, code, language)
    if first is None or first.insufficient_evidence:
        return ReviewOutcome(
            first, None, True, removed, bool(first and first.injection_attempt), model, version
        )
    percent = _percent(first, rubric)
    flagged = first.injection_attempt
    if first.confidence >= min_confidence:
        return ReviewOutcome(first, percent, False, removed, flagged, model, version)
    # Low confidence → a second evaluation; disagreement → a human looks at it (§6.4).
    second, model, version = await _once(llm, blocks, rubric, code, language)
    if second is None:
        return ReviewOutcome(first, percent, True, removed, flagged, model, version)
    other = _percent(second, rubric)
    flagged = flagged or second.injection_attempt
    disagree = abs(percent - other) > max_disagreement
    return ReviewOutcome(
        second, round((percent + other) / 2, 1), disagree, removed, flagged, model, version
    )
