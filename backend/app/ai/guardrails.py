"""Programmatic guardrails around model output (spec §6.6) — code, not prompts."""

import re
from dataclasses import dataclass, field
from typing import Any

from pydantic import ValidationError

from app.ai.schemas import AnswerGrade, CodeReview, EvidencePoint, FeedbackDraft, ReportDraft
from app.core.thresholds import ReportThresholds
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
    "politics": ["siyosat", "saylov", "политик", r"выбор(?:ы|ов)\b", "politic", "election"],
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


# --- Interviewer (spec §6.6 rules 6, 7, 9) -------------------------------------------------------
_HELP = re.compile(
    r"javob\w*\s+(ayt|ber)|yordam\s+ber|maslahat\s+ber|tell me the answer|give me the answer|"
    r"just tell me|what is the (right|correct) answer|give me a hint|"
    r"(скажи|скажите|дай|дайте|подскаж)\w*\s*(мне\s+)?(правильн\w+\s+)?(ответ|подсказк)|подскажи",
    re.IGNORECASE,
)
_THINKING = re.compile(
    r"o['\u02bb\u02bc`]?ylab\s+(ko['\u02bb\u02bc`]?r|ol)|let me think|give me a (moment|second)|"
    r"дайте подумать|дай подумать|надо подумать|сейчас подумаю",
    re.IGNORECASE,
)
_FEEDBACK = re.compile(
    r"to['\u02bb\u02bc`]?g['\u02bb\u02bc`]?ri|yaxshi javob|ajoyib|баллы|правильн|неверн|отлично|"
    r"\b(correct|incorrect|right answer|wrong|great|well done|good answer|rubric|score)\b",
    re.IGNORECASE,
)
_SENTENCE_END = re.compile(r"[.!?]+(?:\s|$)")
_TERM = re.compile(r"[^\W\d_]{4,}|[^\W\d_]+_[\w]+", re.UNICODE)
LEAK_NGRAM_WORDS = 4
MIN_HIDDEN_VALUE_CHARS = 6


def is_help_request(answer: str) -> bool:
    return bool(_HELP.search(answer))


def has_thinking_phrase(answer: str) -> bool:
    return bool(_THINKING.search(answer[:200]))


def is_injection(answer: str) -> bool:
    return bool(_INJECTION.search(answer))


def scrub_answer(answer: str) -> str:
    """Sentences giving the evaluator orders never reach a model (candidate content is data)."""
    parts = re.split(r"(?<=[.!?\n])\s+", answer)
    return " ".join("[removed]" if _INJECTION.search(p) else p for p in parts)


def terms(*texts: str) -> set[str]:
    """Word stems, so Uzbek and Russian endings don't hide a shared word."""
    return {w.lower()[:5] for text in texts for w in _TERM.findall(text)}


def _words(text: str) -> list[str]:
    return [w.lower() for w in _WORD.findall(text)]


def leaks(question: str, secret: str) -> bool:
    """True when the question repeats a run of words from the reference answer or rubric."""
    q = " ".join(_words(question))
    words = _words(secret)
    return any(
        " ".join(words[i : i + LEAK_NGRAM_WORDS]) in q
        for i in range(max(len(words) - LEAK_NGRAM_WORDS + 1, 0))
    )


def check_question(
    text: str,
    language: str,
    *,
    secrets: list[str],
    topic_terms: set[str],
    max_chars: int,
    max_sentences: int,
) -> Check:
    """Everything the interviewer may not say, checked in code rather than trusted to the prompt."""
    check = check_texts([text], language)
    if not text.strip():
        check.issues.append("empty")
    if len(text) > max_chars:
        check.issues.append("too_long")
    if len(_SENTENCE_END.findall(text.strip())) > max_sentences or text.count("?") > 1:
        check.issues.append("more_than_one_question")
    if _FEEDBACK.search(text):
        check.issues.append("gives_feedback")
    if any(leaks(text, secret) for secret in secrets):
        check.issues.append("reveals_answer")
    if topic_terms and not terms(text) & topic_terms and not re.search(r"\d", text):
        check.issues.append("off_topic")
    return check


def _normalized(text: str) -> str:
    return " ".join(text.lower().split())


def check_grade(
    grade: AnswerGrade, rubric: dict[str, Any], answer: str, language: str | None = None
) -> Check:
    """Scores within the rubric, every criterion once, every score resting on a quote that is
    really in the answer, written in the assessment's language."""
    check = Check()
    limits = {c["key"]: c["max_points"] for c in rubric.get("criteria", [])}
    seen = [c.key for c in grade.criteria]
    if sorted(seen) != sorted(limits):
        check.issues.append("criteria_mismatch")
    normalized = _normalized(answer)
    for c in grade.criteria:
        if c.key in limits and c.score > limits[c.key]:
            check.issues.append(f"score_out_of_range: {c.key}")
        if c.quote and _normalized(c.quote) not in normalized:
            check.issues.append(f"fabricated_quote: {c.key}")
        if c.score > 0 and not c.quote.strip():
            check.issues.append(f"no_evidence: {c.key}")
    if language is not None:
        detected = detect_language(grade.rationale)
        if detected is not None and detected != language:
            check.issues.append(f"language_mismatch: expected {language}, got {detected}")
    return check


def score_mcq(answer: str, options: list[str], correct: list[int]) -> float:
    """Deterministic (spec §6.4): the options named in the answer, by text or by number or letter,
    must be exactly the correct ones. Longer option texts are matched first, so an option that is
    part of another one isn't counted as chosen too."""
    text = _normalized(answer)
    chosen: set[int] = set()
    for index in sorted(range(len(options)), key=lambda i: -len(options[i])):
        option = _normalized(options[index])
        if option and option in text:
            chosen.add(index)
            text = text.replace(option, " ")
    for token in re.findall(r"[^\W_]+", text):
        if token.isdigit() and 1 <= int(token) <= len(options):
            chosen.add(int(token) - 1)
        elif len(token) == 1 and token.isascii() and 0 <= ord(token) - ord("a") < len(options):
            chosen.add(ord(token) - ord("a"))
    return 100.0 if chosen and chosen == set(correct) else 0.0


def _unknown_or_unsupported(
    points: list[EvidencePoint], answers: dict[str, str], code: dict[str, str]
) -> list[str]:
    """A quote must be in that answer, a line must exist in that code (spec §6.6)."""
    issues: list[str] = []
    for point in points:
        if point.ref in answers:
            if not point.quote.strip():
                issues.append(f"no_evidence: {point.ref}")
            elif _normalized(point.quote) not in _normalized(answers[point.ref]):
                issues.append(f"fabricated_quote: {point.ref}")
        elif point.ref in code:
            total = len(code[point.ref].splitlines())
            if not point.lines:
                issues.append(f"no_evidence: {point.ref}")
            elif any(not 1 <= line <= total for line in point.lines):
                issues.append(f"lines_do_not_exist: {point.ref}")
        else:
            issues.append(f"unknown_ref: {point.ref}")
    return issues


def check_report(
    draft: ReportDraft, answers: dict[str, str], code: dict[str, str], language: str
) -> Check:
    texts = [draft.summary, *[p.text for p in (*draft.strengths, *draft.gaps)]]
    issues = _unknown_or_unsupported([*draft.strengths, *draft.gaps], answers, code)
    if not draft.summary.strip() and not draft.insufficient_evidence:
        issues.append("empty_summary")
    return Check(issues + check_texts(texts, language).issues)


def reveals_hidden(text: str, secrets: list[str], hidden_values: list[str]) -> bool:
    """The reference answer or solution in words, or a hidden test's input or output as written.
    Very short values ("5") are too common to mean anything, so they are not matched."""
    if any(leaks(text, secret) for secret in secrets):
        return True
    flat = _normalized(text)
    return any(
        len(value) >= MIN_HIDDEN_VALUE_CHARS and value in flat
        for value in (_normalized(v) for v in hidden_values)
    )


def check_feedback(
    draft: FeedbackDraft,
    refs: set[str],
    secrets: list[str],
    hidden_values: list[str],
    language: str,
) -> Check:
    """What the candidate reads: no answers, no hidden tests, every mistake tied to an evaluation
    (spec §6.5)."""
    texts = [m.text for m in draft.mistakes]
    texts += [x for item in draft.learn_next for x in (item.topic, item.reason)]
    issues = [f"unknown_ref: {m.ref}" for m in draft.mistakes if m.ref not in refs]
    if any(reveals_hidden(text, secrets, hidden_values) for text in texts):
        issues.append("reveals_answer")
    return Check(issues + check_texts(texts, language).issues)


def recommendation_band(overall: float, t: ReportThresholds) -> str:
    if overall >= t.strong_yes_from:
        return "strong_yes"
    if overall >= t.yes_from:
        return "yes"
    return "maybe" if overall >= t.maybe_from else "no"
