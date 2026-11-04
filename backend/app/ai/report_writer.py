"""`report_writer` and `feedback_writer` (spec §6.5, §6.6) plus the guardrails around them. Both see
evaluations only, never who the candidate is. When a model can't produce a checked result the
caller gets None: a report without a summary, marked for review, never an invented one."""

import logging
from dataclasses import dataclass
from typing import Any

from app.ai.guardrails import check_feedback, check_report, recommendation_band
from app.ai.llm_client import LLMClient
from app.ai.prompting import build_request
from app.ai.schemas import FeedbackDraft, ReportDraft
from app.core.thresholds import ReportThresholds

logger = logging.getLogger(__name__)

VERSION = "v1"
REPORT_ROLE = "report_writer"
FEEDBACK_ROLE = "feedback_writer"
MAX_ATTEMPTS = 2
_ORDER = ["no", "maybe", "yes", "strong_yes"]


@dataclass(frozen=True)
class Written[T]:
    draft: T | None
    model: str
    prompt_version: str


def clamp_recommendation(proposed: str, band: str) -> str:
    """The model may differ from the score band by one step, never more (D-112)."""
    p, b = _ORDER.index(proposed), _ORDER.index(band)
    return _ORDER[min(max(p, b - 1), b + 1)]


async def write_report(
    llm: LLMClient,
    language: str,
    *,
    scores: dict[str, Any],
    evaluations: list[dict[str, Any]],
    signals: list[dict[str, Any]],
    answers: dict[str, str],
    code: dict[str, str],
) -> Written[ReportDraft]:
    request = build_request(
        REPORT_ROLE,
        VERSION,
        language,
        {"scores": scores, "evaluations": evaluations, "signals": signals},
        temperature=0.0,
        max_tokens=2000,
    )
    model, version = "unknown", f"{REPORT_ROLE}.{VERSION}"
    for _ in range(MAX_ATTEMPTS):
        try:
            result = await llm.complete_json(request, ReportDraft)
        except Exception:
            logger.exception("report_writer_call_failed")
            break
        model, version = result.model, result.prompt_version
        if result.output is None:
            break
        if check_report(result.output, answers, code, language).ok:
            return Written(result.output, model, version)
    return Written(None, model, version)


async def write_feedback(
    llm: LLMClient,
    language: str,
    *,
    evaluations: list[dict[str, Any]],
    skills: list[str],
    refs: set[str],
    secrets: list[str],
    hidden_values: list[str],
) -> Written[FeedbackDraft]:
    request = build_request(
        FEEDBACK_ROLE,
        VERSION,
        language,
        {"evaluations": evaluations, "skills": skills},
        temperature=0.0,
        max_tokens=1500,
    )
    model, version = "unknown", f"{FEEDBACK_ROLE}.{VERSION}"
    for _ in range(MAX_ATTEMPTS):
        try:
            result = await llm.complete_json(request, FeedbackDraft)
        except Exception:
            logger.exception("feedback_writer_call_failed")
            break
        model, version = result.model, result.prompt_version
        if result.output is None:
            break
        if check_feedback(result.output, refs, secrets, hidden_values, language).ok:
            return Written(result.output, model, version)
    return Written(None, model, version)


def band_for(overall: float | None, t: ReportThresholds) -> str | None:
    return None if overall is None else recommendation_band(overall, t)
