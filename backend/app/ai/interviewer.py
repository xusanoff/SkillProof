"""Stage 2 interviewer (spec §6.2): a state machine decides what comes next, the `interviewer` role
only words it, and code checks every question. A bank question is read as written, with no LLM
involved. When a generated question keeps failing, a fixed template or the next move replaces it,
so the interview never stalls on the model."""

import logging
import re
from dataclasses import dataclass, field
from typing import Any

from app.ai.guardrails import check_grade, check_question, injection_lines, scrub_answer, terms
from app.ai.llm_client import LLMClient
from app.ai.prompting import build_request
from app.ai.schemas import AnswerGrade, InterviewerOutput
from app.core.thresholds import Stage2Thresholds

logger = logging.getLogger(__name__)

VERSION = "v1"
ROLE = "interviewer"
EVALUATOR_ROLE = "answer_evaluator"
MAX_ATTEMPTS = 2
MIN_DIFFICULTY, MAX_DIFFICULTY = 1, 5

OWN_CODE_RUBRIC: dict[str, Any] = {
    "criteria": [
        {"key": "accuracy", "name": "The explanation matches what the code does", "max_points": 5},
        {"key": "depth", "name": "Reasons, trade-offs and edge cases", "max_points": 5},
    ]
}
DECLINE = {
    "uz": "Javobni ayta olmayman, keyingi savolga o'tamiz.",
    "ru": "Я не могу подсказать ответ, перейдём к следующему вопросу.",
    "en": "I can't give the answer, let's move to the next question.",
}
OWN_CODE_TEMPLATE = {
    "uz": "Kodingizning {line}-qatori nima qilishini va nega kerakligini tushuntiring.",
    "ru": "Объясните, что делает строка {line} вашего кода и зачем она нужна.",
    "en": "Explain what line {line} of your code does and why it is needed.",
}
_TRIVIAL = re.compile(r"^(\s*|[\s{}()\[\];,]*|\s*(import|from|#|//|package|using|\*)\b.*)$")


@dataclass(frozen=True)
class PlanQuestion:
    id: str
    skill: str | None
    difficulty: int
    mandatory: bool


@dataclass(frozen=True)
class PastTurn:
    order: int
    kind: str
    question_id: str | None
    parent_order: int | None
    percent: float | None
    answered_text: bool
    follow_up_allowed: bool


@dataclass(frozen=True)
class Move:
    kind: str  # own_code | bank | follow_up
    question_id: str | None = None
    parent_order: int | None = None


@dataclass(frozen=True)
class MachineState:
    turns: list[PastTurn]
    questions: list[PlanQuestion]
    skill_weights: dict[str, int] = field(default_factory=dict)
    question_count: int = 8
    own_code_target: int = 2
    difficulty: int = 3


def next_difficulty(current: int, percent: float | None, t: Stage2Thresholds) -> int:
    if percent is None:
        return current
    if percent >= t.difficulty_up_percent:
        return min(current + 1, MAX_DIFFICULTY)
    if percent < t.difficulty_down_percent:
        return max(current - 1, MIN_DIFFICULTY)
    return current


def _follow_up(state: MachineState, t: Stage2Thresholds) -> Move | None:
    if not state.turns:
        return None
    last = state.turns[-1]
    if not last.answered_text or not last.follow_up_allowed:
        return None
    if last.percent is not None and last.percent > t.follow_up_max_percent:
        return None
    parent = last.parent_order if last.parent_order is not None else last.order
    follow_ups = [x for x in state.turns if x.kind == "follow_up"]
    if len(follow_ups) >= t.max_follow_ups_total:
        return None
    if sum(x.parent_order == parent for x in follow_ups) >= t.max_follow_ups_per_question:
        return None
    return Move("follow_up", parent_order=parent)


def _closest(items: list[PlanQuestion], difficulty: int) -> PlanQuestion:
    return min(items, key=lambda q: abs(q.difficulty - difficulty))


def _by_weight(state: MachineState, remaining: list[PlanQuestion]) -> PlanQuestion:
    """The skill furthest behind its share of the vacancy's weights, then the closest difficulty."""
    asked = {x.question_id for x in state.turns}
    done = [q for q in state.questions if q.id in asked]
    total = sum(state.skill_weights.values()) or 1

    def behind(skill: str | None) -> float:
        share = state.skill_weights.get(skill or "", 1) / total
        return share - sum(q.skill == skill for q in done) / (len(done) or 1)

    skill = max(dict.fromkeys(q.skill for q in remaining), key=behind)
    return _closest([q for q in remaining if q.skill == skill], state.difficulty)


def next_move(state: MachineState, t: Stage2Thresholds) -> Move | None:
    """None ends the interview. Mandatory questions are asked even past `question_count`."""
    if follow_up := _follow_up(state, t):
        return follow_up
    main = [x for x in state.turns if x.kind != "follow_up"]
    if sum(x.kind == "own_code" for x in main) < state.own_code_target:
        return Move("own_code")
    asked = {x.question_id for x in main}
    remaining = [q for q in state.questions if q.id not in asked]
    mandatory = [q for q in remaining if q.mandatory]
    if mandatory:
        return Move("bank", _closest(mandatory, state.difficulty).id)
    if len(main) >= state.question_count or not remaining:
        return None
    return Move("bank", _by_weight(state, remaining).id)


def pick_lines(code: str, used: set[int]) -> list[int]:
    """The longest line not asked about yet: real logic rather than imports or brackets."""
    removed = injection_lines(code)
    candidates = [
        (len(line.strip()), -n)
        for n, line in enumerate(code.splitlines(), 1)
        if n not in removed and not _TRIVIAL.match(line)
    ]
    fresh = [c for c in candidates if -c[1] not in used] or candidates
    return [-max(fresh)[1]] if fresh else []


async def _word(
    llm: LLMClient,
    language: str,
    blocks: dict[str, Any],
    *,
    secrets: list[str],
    topic_terms: set[str],
    valid_lines: int | None,
    t: Stage2Thresholds,
) -> InterviewerOutput | None:
    for _ in range(MAX_ATTEMPTS):
        request = build_request(ROLE, VERSION, language, blocks, temperature=0.3, max_tokens=300)
        try:
            out = (await llm.complete_json(request, InterviewerOutput)).output
        except Exception:
            logger.exception("interviewer_call_failed")
            return None
        if out is None or out.insufficient_evidence:
            return None
        check = check_question(
            out.question,
            language,
            secrets=secrets,
            topic_terms=topic_terms,
            max_chars=t.question_max_chars,
            max_sentences=t.question_max_sentences,
        )
        if valid_lines is not None and any(not 1 <= n <= valid_lines for n in out.lines):
            check.issues.append("line_not_in_code")
        if check.ok:
            return out
        blocks = {**blocks, "rejected_because": check.issues}
    return None


async def own_code_question(
    llm: LLMClient,
    language: str,
    *,
    title: str,
    statement: str,
    code: str,
    skills: list[str],
    used_lines: set[int],
    t: Stage2Thresholds,
) -> tuple[str, list[int]]:
    lines = pick_lines(code, used_lines) or [1]
    removed = injection_lines(code)
    numbered = [
        "[removed]" if n in removed else line for n, line in enumerate(code.splitlines(), 1)
    ]
    out = await _word(
        llm,
        language,
        {
            "decision": {"kind": "own_code", "lines": lines},
            "skills": skills,
            "task": {"title": title, "statement": statement},
            "candidate_code": numbered,
        },
        secrets=[],
        topic_terms=terms(*numbered, *skills),
        valid_lines=len(numbered),
        t=t,
    )
    if out is not None:
        return out.question, out.lines or lines
    return OWN_CODE_TEMPLATE[language].format(line=lines[0]), lines


async def follow_up_question(
    llm: LLMClient,
    language: str,
    *,
    parent_question: str,
    answer: str,
    skills: list[str],
    secrets: list[str],
    t: Stage2Thresholds,
) -> str | None:
    """None: no follow-up this time. The state machine just moves on."""
    clean = scrub_answer(answer)
    topic = [w.strip(".,!?") for w in clean.split() if len(w) >= 4 and w != "[removed]"]
    out = await _word(
        llm,
        language,
        {
            "decision": {"kind": "follow_up", "topic_words": topic[:8]},
            "skills": skills,
            "parent_question": parent_question,
            "candidate_answer": {"text": clean},
        },
        secrets=secrets,
        topic_terms=terms(parent_question, clean, *skills),
        valid_lines=None,
        t=t,
    )
    return out.question if out is not None else None


@dataclass(frozen=True)
class GradeOutcome:
    grade: AnswerGrade | None
    percent: float | None
    max_score: float
    needs_review: bool
    model: str
    prompt_version: str


async def grade_answer(
    llm: LLMClient,
    language: str,
    *,
    question: str,
    rubric: dict[str, Any],
    reference: str | None,
    answer: str,
) -> GradeOutcome | None:
    """One evaluator call with its guardrails: the live score behind adaptive difficulty (D-092)
    and the first pass of the final evaluation. None: this question has no rubric to score by."""
    if not rubric.get("criteria"):
        return None
    total = float(sum(c["max_points"] for c in rubric["criteria"]))
    version = f"{EVALUATOR_ROLE}.{VERSION}"
    clean = scrub_answer(answer)
    # Nothing is left to judge: no model call, so nothing can be talked into a score.
    if not clean.replace("[removed]", "").strip():
        return GradeOutcome(None, 0.0, total, False, "", "deterministic")
    request = build_request(
        EVALUATOR_ROLE,
        VERSION,
        language,
        {
            "question": question,
            "rubric": rubric,
            "reference_answer": reference,
            "candidate_answer": {"text": clean},
        },
        temperature=0.0,
        max_tokens=800,
    )
    model = "unknown"
    for _ in range(MAX_ATTEMPTS):
        try:
            result = await llm.complete_json(request, AnswerGrade)
        except Exception:
            logger.exception("answer_evaluator_call_failed")
            break
        model, version = result.model, result.prompt_version
        if result.output is None:
            break
        if check_grade(result.output, rubric, clean, language).ok:
            percent = 100 * sum(c.score for c in result.output.criteria) / total
            return GradeOutcome(
                result.output,
                round(percent, 1),
                total,
                result.output.insufficient_evidence,
                model,
                version,
            )
    return GradeOutcome(None, None, total, True, model, version)


async def evaluate_answer(
    llm: LLMClient,
    language: str,
    *,
    question: str,
    rubric: dict[str, Any],
    reference: str | None,
    answer: str,
    first_percent: float | None,
    first_confidence: float | None,
    min_confidence: float,
    max_disagreement: float,
) -> GradeOutcome | None:
    """A second evaluation when the first was unsure or missing (spec §6.4). Disagreement between
    the two goes to a person. The caller keeps a first score that was already sure."""
    second = await grade_answer(
        llm, language, question=question, rubric=rubric, reference=reference, answer=answer
    )
    if (
        second is None
        or first_percent is None
        or first_confidence is None
        or first_confidence >= min_confidence
    ):
        return second
    if second.percent is None:
        return GradeOutcome(
            second.grade, first_percent, second.max_score, True, second.model, second.prompt_version
        )
    return GradeOutcome(
        second.grade,
        round((first_percent + second.percent) / 2, 1),
        second.max_score,
        second.needs_review or abs(first_percent - second.percent) > max_disagreement,
        second.model,
        second.prompt_version,
    )
