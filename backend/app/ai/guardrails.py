"""Programmatic guardrails around model output (spec §6.6) — code, not prompts."""

import re
from dataclasses import dataclass, field
from typing import Any

from pydantic import ValidationError

from app.ai.schemas import CodeReview
from app.sandbox.client import Limits, Sandbox, run_tests

_CYRILLIC = re.compile(r"[Ѐ-ӿ]")
_LATIN = re.compile(r"[A-Za-z]")
_WORD = re.compile(r"[a-zA-Z\u0400-\u04FF'\u02bb\u02bc]+")
_UZ_MARKERS = {
    "va",
    "bilan",
    "uchun",
    "qanday",
    "nima",
    "qaysi",
    "bu",
    "siz",
    "sizning",
    "qiling",
    "nimalarni",
    "qilgansiz",
    "bo'lgan",
    "bo'yicha",
    "ham",
    "yoki",
    "emas",
    "berilgan",
}
_EN_MARKERS = {
    "the",
    "and",
    "is",
    "are",
    "of",
    "to",
    "what",
    "how",
    "which",
    "you",
    "your",
    "with",
    "for",
    "in",
    "a",
    "an",
    "do",
    "does",
    "given",
    "print",
}
# Spec §6.6 rule 7. Regex word stems matched at word starts (uz / ru / en); short stems
# that are prefixes of technical words carry their own endings ("din" ≠ "dinamik").
FORBIDDEN_TOPICS = {
    "age": [r"yosh(?:ingiz|i|da)?\b", "возраст", "how old"],
    "family": [
        "oila",
        "turmush",
        "farzand",
        "семь",
        "женат",
        "замуж",
        "дети",
        "married",
        "children",
    ],
    "health": ["kasal", "sog'li", "здоров", "болезн", "health", "illness", "pregnan"],
    "religion": [r"din(?:iy|ingiz|i|ga)?\b", "namoz", "религи", "religio"],
    "politics": ["siyosat", "saylov", "политик", "выбор", "politic", "election"],
    "salary": ["maosh", "oylik", "зарплат", "salary"],
}


def detect_language(text: str) -> str | None:
    cyr, lat = len(_CYRILLIC.findall(text)), len(_LATIN.findall(text))
    if cyr + lat < 12:
        return None  # too short to judge (e.g. code identifiers)
    if cyr > lat:
        return "ru"
    words = [w.lower() for w in _WORD.findall(text)]
    uz = sum(w in _UZ_MARKERS for w in words) + sum(("o'" in w or "g'" in w) for w in words)
    en = sum(w in _EN_MARKERS for w in words)
    if uz == en == 0:
        return None
    return "uz" if uz >= en else "en"


def forbidden_topics(text: str) -> list[str]:
    lowered = text.lower()
    return [
        topic
        for topic, stems in FORBIDDEN_TOPICS.items()
        if any(re.search(rf"(?<![\w']){stem}", lowered) for stem in stems)
    ]


@dataclass
class Check:
    issues: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.issues


def check_texts(texts: list[str], language: str) -> Check:
    check = Check()
    for text in texts:
        detected = detect_language(text)
        if detected is not None and detected != language:
            check.issues.append(f"language_mismatch: expected {language}, got {detected}")
            break
    for text in texts:
        if topics := forbidden_topics(text):
            check.issues.append(f"forbidden_topic: {', '.join(topics)}")
            break
    return check


def check_schema[T](model: type[T], data: dict[str, Any]) -> tuple[T | None, Check]:
    try:
        return model.model_validate(data), Check()  # type: ignore[attr-defined]
    except ValidationError as exc:
        return None, Check([f"invalid: {e['loc']}: {e['msg']}" for e in exc.errors()][:5])


async def validate_reference_solution(
    sandbox: Sandbox,
    language: str,
    code: str,
    tests: list[dict[str, str]],
    limits: Limits,
) -> tuple[str, list[str]]:
    """Returns ("passed" | "failed" | "unavailable", issues). Runs twice: tests must be
    deterministic (same verdicts on both runs)."""
    first = await run_tests(sandbox, language, code, tests, limits)
    if any(o.status == "unavailable" for o in first):
        return "unavailable", []
    failed = [o.name for o in first if not o.passed]
    if failed:
        return "failed", [f"reference_solution_fails: {', '.join(failed)}"]
    second = await run_tests(sandbox, language, code, tests, limits)
    if [o.passed for o in second] != [o.passed for o in first]:
        return "failed", ["non_deterministic_tests"]
    return "passed", []


# Instructions aimed at an evaluator, in the languages we interview in (spec §6.4, §7.2).
_INJECTION = re.compile(
    r"ignore (all |any )?(the )?(previous|prior|above) (instructions|prompts?)"
    r"|(give|award|grant|assign) (me |this |the candidate )?(a )?(full|maximum|max|perfect|100)"
    r"|(you are|act as) (now )?(an? )?(evaluator|reviewer|grader|examiner|assistant)"
    r"|(system|assistant) ?(prompt|message) ?:"
    r"|игнорируй\w* (все |всё )?(предыдущ|прошл)\w*"
    r"|(постав|дай|выстав)\w* (мне |этому )?(максимальн|полн|высш|100)\w*"
    r"|(oldingi|yuqoridagi) (barcha )?(ko.rsatma|buyruq|instruksiya)\w*"
    r"|(maksimal|to.liq|eng yuqori|100) ball (ber|qo.y)\w*",
    re.IGNORECASE,
)


def injection_lines(code: str) -> list[int]:
    return [n for n, line in enumerate(code.splitlines(), 1) if _INJECTION.search(line)]


def check_review(review: CodeReview, rubric: dict[str, Any], code: str, language: str) -> Check:
    """The model's output against what can be verified in code (spec §6.6): rubric keys, score
    ranges, that cited lines exist, and the language."""
    issues: list[str] = []
    limits = {c["key"]: c["max_points"] for c in rubric.get("criteria", [])}
    seen = [c.key for c in review.criteria]
    if sorted(seen) != sorted(limits):
        issues.append(f"criteria must be exactly {sorted(limits)}, got {sorted(seen)}")
    for c in review.criteria:
        if c.key in limits and c.score > limits[c.key]:
            issues.append(f"{c.key}: score {c.score} is above the maximum {limits[c.key]}")
    total = len(code.splitlines())
    cited = [line for c in review.criteria for line in c.lines]
    cited += [f.line for f in review.findings]
    cited += [line for p in (*review.strengths, *review.weaknesses) for line in p.lines]
    missing = sorted({line for line in cited if not 1 <= line <= total})
    if missing:
        issues.append(f"lines do not exist in the code (1-{total}): {missing}")
    for point in (*review.strengths, *review.weaknesses):
        if not point.lines:
            issues.append(f"no line evidence for: {point.text[:60]}")
    texts = [review.rationale, *[p.text for p in (*review.strengths, *review.weaknesses)]]
    issues += check_texts(texts, language).issues
    return Check(issues)
