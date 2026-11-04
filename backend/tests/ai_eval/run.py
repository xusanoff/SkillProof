"""Golden-dataset evaluation of AI roles (spec §6.6 "Prompt quality process").

  uv run python -m tests.ai_eval.run            # provider from LLM_PROVIDER (real when set)
  uv run python -m tests.ai_eval.run --fast     # mock subset used in CI
Writes a summary table to docs/AI_EVAL.md. Exit code 1 on any regression.
"""

import argparse
import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path

from app.ai.code_reviewer import review_code
from app.ai.guardrails import (
    check_feedback,
    check_report,
    detect_language,
    forbidden_topics,
    is_help_request,
    is_injection,
    leaks,
)
from app.ai.interviewer import follow_up_question, grade_answer
from app.ai.llm_client import LLMClient, build_provider
from app.ai.mock_handlers import build_mock_provider
from app.ai.prompting import build_request
from app.ai.report_writer import write_feedback, write_report
from app.ai.schemas import GeneratedQuestions, GeneratedTask, ItemVerdict
from app.core.config import get_settings
from app.core.thresholds import Stage2Thresholds

ROOT = Path(__file__).resolve().parents[3]
VACANCY = {
    "title": "Python backend developer",
    "description": "Build REST APIs with FastAPI.",
    "requirements": "3 years",
    "experience_level": "between_3_6",
    "skills": [{"name": "Python", "weight": 5}, {"name": "PostgreSQL", "weight": 3}],
    "difficulty": 3,
}
# With the mock provider, model-quality checks (does the verifier catch a wrong answer?)
# are meaningless; only the pipeline/schema checks run. Real providers run everything.
MOCK_SKIP = {
    "verifier-wrong-mcq-en",
    "verifier-ambiguous-ru",
    "verifier-off-topic-uz",
    "review-injection-paraphrased",
    "answer-off-topic-ru",
    "answer-good-uz",
    "answer-average-en",
    "report-injection-in-quote-en",
}


async def run_case(llm: LLMClient, case: dict, mock: bool) -> tuple[str, str]:
    role, lang = case["role"], case["language"]
    if mock and case["id"] in MOCK_SKIP:
        return "skip", "model-quality case (real provider only)"
    exp = case["expect"]
    if role == "code_reviewer":
        out = await review_code(
            llm,
            title=case["task"]["title"],
            statement=case["task"]["statement"],
            rubric=case["rubric"],
            code=case["code"],
            test_results=case["test_results"],
            language=lang,
            min_confidence=0.6,
            max_disagreement=15,
        )
        if out.percent is None:
            return "fail", "no score"
        flagged = bool(out.injection_lines) or out.injection_flagged
        ok = exp["min_percent"] <= out.percent <= exp["max_percent"] and flagged == exp["injection"]
        return ("pass" if ok else "fail"), f"{out.percent}%, injection={flagged}"
    if role == "answer_evaluator":
        out = await grade_answer(
            llm,
            lang,
            question=case["question"],
            rubric=case["rubric"],
            reference=case["reference"],
            answer=case["answer"],
        )
        if out is None or out.percent is None:
            return "fail", "no score"
        flagged = is_injection(case["answer"]) or bool(out.grade and out.grade.injection_attempt)
        ok = exp["min_percent"] <= out.percent <= exp["max_percent"] and flagged == exp["injection"]
        return ("pass" if ok else "fail"), f"{out.percent}%, injection={flagged}"
    if role == "report_writer":
        out = await write_report(
            llm,
            lang,
            scores=case["scores"],
            evaluations=case["evaluations"],
            signals=case["signals"],
            answers=case["answers"],
            code=case["code"],
        )
        if out.draft is None:
            return "fail", "no checked report"
        ok = (
            out.draft.recommendation in exp["recommendation_in"]
            and check_report(out.draft, case["answers"], case["code"], lang).ok
        )
        return ("pass" if ok else "fail"), out.draft.recommendation
    if role == "feedback_writer":
        out = await write_feedback(
            llm,
            lang,
            evaluations=case["evaluations"],
            skills=case["skills"],
            refs=set(case["refs"]),
            secrets=case["secrets"],
            hidden_values=case["hidden_values"],
        )
        if out.draft is None:
            return "fail", "no checked feedback"
        ok = len(out.draft.mistakes) >= exp["min_mistakes"] and (
            check_feedback(
                out.draft, set(case["refs"]), case["secrets"], case["hidden_values"], lang
            ).ok
        )
        return ("pass" if ok else "fail"), f"{len(out.draft.mistakes)} mistakes"
    if role == "interviewer":
        if exp.get("help_request"):
            # Such an answer never reaches this role: the service declines and moves on.
            ok = is_help_request(case["answer"])
            return ("pass" if ok else "fail"), f"help_request={ok}"
        text = await follow_up_question(
            llm,
            lang,
            parent_question=case["question"],
            answer=case["answer"],
            skills=["Python"],
            secrets=case["secrets"],
            t=Stage2Thresholds(),
        )
        if text is None:
            return "pass", "no follow-up (every attempt was rejected)"
        ok = not any(leaks(text, s) for s in case["secrets"]) and (
            detect_language(text) in (None, exp["language"])
        )
        return ("pass" if ok else "fail"), text[:60]
    if role == "item_verifier":
        req = build_request(
            role,
            "v1",
            lang,
            {"vacancy": VACANCY, "item": case["item"]},
            temperature=0,
            max_tokens=800,
        )
        res = await llm.complete_json(req, ItemVerdict)
        if res.output is None:
            return "fail", "invalid output"
        ok = res.output.valid == exp["valid"] and (
            not exp.get("injection_attempt") or res.output.injection_attempt
        )
        return ("pass" if ok else "fail"), f"valid={res.output.valid}"
    if role == "question_generator":
        req = build_request(
            role,
            "v1",
            lang,
            {"vacancy": VACANCY | {"count": case["count"], "types": ["open", "scenario", "mcq"]}},
            temperature=0.3,
            max_tokens=4000,
        )
        res = await llm.complete_json(req, GeneratedQuestions)
        qs = res.output.questions if res.output else []
        langs = {detect_language(q.text) for q in qs} - {None}
        bad = [q.text for q in qs if forbidden_topics(q.text)]
        ok = len(qs) == exp["count"] and langs <= {exp["language"]} and not bad
        return ("pass" if ok else "fail"), f"{len(qs)} questions, languages={sorted(langs)}"
    req = build_request(
        role,
        "v1",
        lang,
        {
            "vacancy": VACANCY
            | {"skill": "Python", "allowed_languages": ["python"], "time_limit_minutes": 30}
        },
        temperature=0.3,
        max_tokens=6000,
    )
    res = await llm.complete_json(req, GeneratedTask)
    if res.output is None:
        return "fail", "invalid output"
    ok = len(res.output.hidden_tests) >= exp["min_hidden_tests"] and (
        detect_language(res.output.statement) in (None, exp["language"])
    )
    return ("pass" if ok else "fail"), f"{len(res.output.hidden_tests)} hidden tests"


async def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fast", action="store_true", help="mock provider subset (CI)")
    parser.add_argument("--no-report", action="store_true", help="don't write docs/AI_EVAL.md")
    args = parser.parse_args(argv)
    settings = get_settings()
    mock = args.fast or settings.llm_provider == "mock"
    llm = LLMClient(build_mock_provider() if mock else build_provider(settings))
    cases = json.loads((Path(__file__).parent / "golden.json").read_text())["cases"]
    rows = [(c["id"], *await run_case(llm, c, mock)) for c in cases]
    failed = [r for r in rows if r[1] == "fail"]
    provider = "mock" if mock else f"{settings.llm_provider}/{settings.llm_model}"
    lines = [
        f"## {datetime.now(UTC):%Y-%m-%d %H:%M} UTC — provider `{provider}`",
        "",
        "| case | result | note |",
        "|---|---|---|",
        *[f"| {i} | {r} | {n} |" for i, r, n in rows],
        "",
    ]
    report = ROOT / "docs" / "AI_EVAL.md"
    head = (
        "# AI evaluation runs\n\nNewest first. "
        "`make ai-eval` (real provider) / `--fast` (mock).\n\n"
    )
    if not args.no_report:
        old = report.read_text().removeprefix(head) if report.exists() else ""
        report.write_text(head + "\n".join(lines) + "\n" + old)
    print("\n".join(lines))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
