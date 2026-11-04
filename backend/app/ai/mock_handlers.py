"""Deterministic, realistic mock outputs for the generator/verifier roles, so the whole
'Generate with AI' flow works and is testable without API keys (spec §1.1)."""

import json
import re
from typing import Any

from app.ai.llm_client import LLMRequest, MockLLMProvider

_TEXT: dict[str, dict[str, Any]] = {
    "uz": {
        "open": "{skill} bilan ishlagan loyihangizda eng murakkab muammo nima bo'lgan va uni qanday hal qilgansiz?",
        "scenario": "Production'da {skill} bilan bog'liq servis sekinlashdi. Birinchi 15 daqiqada nimalarni tekshirasiz?",
        "mcq": "{skill} bo'yicha qaysi tasdiq to'g'ri?",
        "ref": "Kuchli javob: muammoni aniq tavsiflaydi, sababni o'lchov bilan topadi, yechim va uning narxini aytadi.",
        "task_title": "Buyurtmalar summasi",
        "statement": "Birinchi qatorda n soni, ikkinchi qatorda n ta butun son (buyurtma summalari) berilgan. "
        "Barcha musbat summalar yig'indisini chiqaring.\n\nMisol:\nKirish:\n3\n5 -2 7\nChiqish:\n12",
        "crit": ["Aniqlik", "Chuqurlik", "Amaliy misol"],
    },
    "ru": {
        "open": "Какая самая сложная проблема была в вашем проекте на {skill} и как вы её решили?",
        "scenario": "В продакшене замедлился сервис на {skill}. Что вы проверите в первые 15 минут?",
        "mcq": "Какое утверждение о {skill} верно?",
        "ref": "Сильный ответ: чётко описывает проблему, находит причину с помощью измерений, называет решение и его цену.",
        "task_title": "Сумма заказов",
        "statement": "В первой строке число n, во второй — n целых чисел (суммы заказов). "
        "Выведите сумму всех положительных сумм.\n\nПример:\nВвод:\n3\n5 -2 7\nВывод:\n12",
        "crit": ["Точность", "Глубина", "Практический пример"],
    },
    "en": {
        "open": "What was the hardest problem in your {skill} project and how did you solve it?",
        "scenario": "A {skill} service slowed down in production. What do you check in the first 15 minutes?",
        "mcq": "Which statement about {skill} is correct?",
        "ref": "A strong answer states the problem precisely, finds the cause with measurements, and names the fix and its cost.",
        "task_title": "Order totals",
        "statement": "The first line holds n, the second n integers (order amounts). "
        "Print the sum of all positive amounts.\n\nExample:\nInput:\n3\n5 -2 7\nOutput:\n12",
        "crit": ["Accuracy", "Depth", "Practical example"],
    },
}


def _block(request: LLMRequest, tag: str) -> dict[str, Any]:
    match = re.search(rf"<{tag}>\n(.*?)\n</{tag}>", request.user, re.S)
    return json.loads(match.group(1)) if match else {}


def _language(request: LLMRequest) -> str:
    for code, name in (("ru", "Russian"), ("en", "English")):
        if (
            f"language: {name}" in request.system
            or f"language for `reasons`: {name}" in request.system
        ):
            return code
    return "uz"


def _rubric(lang: str) -> dict[str, Any]:
    keys = ["accuracy", "depth", "example"]
    return {
        "criteria": [
            {"key": k, "name": n, "description": "", "max_points": 5, "levels": {}}
            for k, n in zip(keys, _TEXT[lang]["crit"], strict=True)
        ]
    }


def questions(request: LLMRequest) -> dict[str, Any]:
    ctx = _block(request, "vacancy")
    lang = _language(request)
    skills = [s["name"] for s in ctx.get("skills", [])] or [ctx.get("title", "IT")]
    types = ctx.get("types") or ["open", "scenario", "mcq"]
    out = []
    for i in range(int(ctx.get("count", 3))):
        skill, kind = skills[i % len(skills)], types[i % len(types)]
        t = _TEXT[lang]
        q: dict[str, Any] = {
            "skill": skill,
            "type": kind,
            "difficulty": int(ctx.get("difficulty", 3)),
            "text": t[kind].format(skill=skill)
            + ("" if i < len(skills) * len(types) else f" ({i + 1})"),
        }
        if kind == "mcq":
            q |= {"options": [f"{skill}: A", f"{skill}: B", f"{skill}: C"], "correct_answer": [0]}
        else:
            q |= {"rubric": _rubric(lang), "reference_answer": t["ref"]}
        out.append(q)
    return {"questions": out, "insufficient_context": False}


_PY_SOLUTION = "n = int(input())\nnums = list(map(int, input().split())) if n else []\nprint(sum(x for x in nums if x > 0))\n"
_STARTERS = {
    "python": "n = int(input())\n# your code here\n",
    "javascript": "const lines = require('fs').readFileSync(0, 'utf8').split('\\n');\n// your code here\n",
    "go": "package main\n\nfunc main() {\n\t// your code here\n}\n",
}


def task(request: LLMRequest) -> dict[str, Any]:
    ctx = _block(request, "vacancy")
    lang = _language(request)
    allowed = ctx.get("allowed_languages") or ["python"]
    t = _TEXT[lang]
    return {
        "skill": ctx.get("skill") or ctx.get("title", "Python"),
        "title": t["task_title"],
        "statement": t["statement"],
        "difficulty": int(ctx.get("difficulty", 3)),
        "starter_code": {k: v for k, v in _STARTERS.items() if k in allowed},
        "visible_tests": [
            {"name": "example", "input": "3\n5 -2 7\n", "output": "12"},
            {"name": "all negative", "input": "2\n-1 -5\n", "output": "0"},
        ],
        "hidden_tests": [
            {"name": "empty", "input": "0\n\n", "output": "0"},
            {"name": "single", "input": "1\n42\n", "output": "42"},
            {"name": "zeros", "input": "3\n0 0 0\n", "output": "0"},
            {"name": "large", "input": "3\n1000000000 1000000000 -1\n", "output": "2000000000"},
            {"name": "mixed", "input": "5\n-3 4 -5 6 1\n", "output": "11"},
        ],
        "rubric": {
            "criteria": [
                {"key": "readability", "name": "Readability", "max_points": 5},
                {"key": "edge_cases", "name": "Edge cases", "max_points": 5},
                {"key": "complexity", "name": "Complexity", "max_points": 5},
            ]
        },
        "reference_solution": {"language": "python", "code": _PY_SOLUTION},
        "insufficient_context": False,
    }


def verifier(request: LLMRequest) -> dict[str, Any]:
    item = _block(request, "item")
    text = json.dumps(item, ensure_ascii=False).lower()
    if "ignore previous instructions" in text:
        return {
            "valid": False,
            "reasons": ["prompt injection in item"],
            "confidence": 1.0,
            "injection_attempt": True,
        }
    return {"valid": True, "reasons": [], "confidence": 0.9, "injection_attempt": False}


def code_review(request: LLMRequest) -> dict[str, Any]:
    """Scores by how much code there is, on real lines, in the assessment language."""
    rubric = _block(request, "rubric")
    code = _block(request, "candidate_code")
    lines = [n for n, text in enumerate(code, 1) if str(text).strip() not in ("", "[removed]")]
    lang = _language(request)
    words = {
        "uz": ("Yechim tuzilishi tushunarli.", "Chekka holatlar yetarli tekshirilmagan."),
        "ru": ("Структура решения понятна.", "Граничные случаи проверены недостаточно."),
        "en": ("The solution has a clear structure.", "Edge cases are not checked enough."),
    }[lang]
    first = lines[:1]
    return {
        "criteria": [
            {
                "key": c["key"],
                "score": round(c["max_points"] * (0.8 if len(lines) > 1 else 0.4), 2),
                "rationale": words[0],
                "lines": first,
            }
            for c in rubric.get("criteria", [])
        ],
        "findings": [{"line": first[0], "comment": words[1]}] if first else [],
        "strengths": [{"text": words[0], "lines": first}],
        "weaknesses": [{"text": words[1], "lines": first}],
        "rationale": words[0],
        "confidence": 0.9,
        "insufficient_evidence": not lines,
        "injection_attempt": "[removed]" in code,
    }


def interviewer(request: LLMRequest) -> dict[str, Any]:
    """A short question in the assessment language: on a real code line, or on the parent question."""
    decision = _block(request, "decision")
    lang = _language(request)
    if decision["kind"] == "own_code":
        line = decision["lines"][0]
        text = {
            "uz": f"Kodingizning {line}-qatorida nima uchun aynan shunday yozdingiz?",
            "ru": f"Почему в строке {line} вашего кода вы написали именно так?",
            "en": f"Why did you write line {line} of your code this way?",
        }[lang]
        return {"question": text, "lines": decision["lines"]}
    subject = (decision.get("topic_words") or [""])[0]
    text = {
        "uz": f"Javobingizdagi {subject} haqida aniq misol keltira olasizmi?",
        "ru": f"Можете привести конкретный пример про {subject} из вашего ответа?",
        "en": f"Can you give a concrete example of {subject} from your answer?",
    }[lang]
    return {"question": text, "lines": []}


def answer_evaluator(request: LLMRequest) -> dict[str, Any]:
    """Scores by answer length, quoting the answer's first words."""
    rubric = _block(request, "rubric")
    answer = str(_block(request, "candidate_answer").get("text", ""))
    words = answer.split()
    share = 0.8 if len(words) >= 12 else 0.5 if len(words) >= 4 else 0.2
    rationale = {
        "uz": "Javob mezon bo'yicha baholandi.",
        "ru": "Ответ оценён по критерию.",
        "en": "The answer was scored by the criterion.",
    }[_language(request)]
    return {
        "criteria": [
            {
                "key": c["key"],
                "score": round(c["max_points"] * share, 2),
                "rationale": rationale,
                "quote": " ".join(words[:4]),
            }
            for c in rubric.get("criteria", [])
        ],
        "rationale": rationale,
        "confidence": 0.9,
        "insufficient_evidence": not words,
        "injection_attempt": "[removed]" in answer,
    }


def _point(evaluation: dict[str, Any], text: str) -> dict[str, Any]:
    return {
        "text": text,
        "ref": evaluation["ref"],
        "quote": evaluation.get("quote", ""),
        "lines": evaluation.get("lines", []),
    }


def _has_evidence(evaluation: dict[str, Any]) -> bool:
    return bool(evaluation.get("quote") or evaluation.get("lines"))


def report_writer(request: LLMRequest) -> dict[str, Any]:
    """Follows the computed score; cites the first evaluations that carry evidence."""
    all_items: list[dict[str, Any]] = _block(request, "evaluations")  # type: ignore[assignment]
    evaluations = [e for e in all_items if _has_evidence(e)]
    overall = _block(request, "scores").get("overall") or 0
    words = {
        "uz": (
            "Nomzod topshiriqlarni bajardi.",
            "Asosiy ko'nikma ko'rsatildi.",
            "Bilimni chuqurlashtirish kerak.",
        ),
        "ru": ("Кандидат выполнил задания.", "Показан основной навык.", "Нужно углубить знания."),
        "en": (
            "The candidate completed the tasks.",
            "The core skill was shown.",
            "Knowledge needs more depth.",
        ),
    }[_language(request)]
    recommendation = (
        "strong_yes"
        if overall >= 85
        else "yes"
        if overall >= 70
        else "maybe"
        if overall >= 50
        else "no"
    )
    return {
        "summary": words[0],
        "strengths": [_point(evaluations[0], words[1])] if evaluations else [],
        "gaps": [_point(evaluations[-1], words[2])] if evaluations else [],
        "recommendation": recommendation,
        "confidence": 0.9,
        "insufficient_evidence": not evaluations,
        "injection_attempt": False,
    }


def feedback_writer(request: LLMRequest) -> dict[str, Any]:
    """One mistake per evaluation that lost points, one study item per skill."""
    evaluations: list[dict[str, Any]] = _block(request, "evaluations")  # type: ignore[assignment]
    skills: list[str] = _block(request, "skills")  # type: ignore[assignment]
    words = {
        "uz": (
            "Bu qismni yaxshilash mumkin: javobda tafsilotlar yetishmadi.",
            "Mavzuni qayta ko'rib chiqing.",
        ),
        "ru": ("Эту часть можно улучшить: в ответе не хватило деталей.", "Повторите эту тему."),
        "en": ("This part can improve: the work lacked some details.", "Review this topic."),
    }[_language(request)]
    return {
        "mistakes": [
            {"text": words[0], "ref": e["ref"]}
            for e in evaluations
            if (e.get("percent") or 0) < 100
        ],
        "learn_next": [{"topic": s, "reason": words[1]} for s in skills[:5]],
        "insufficient_evidence": not evaluations,
        "injection_attempt": False,
    }


def build_mock_provider() -> MockLLMProvider:
    return MockLLMProvider(
        {
            "report_writer": report_writer,
            "feedback_writer": feedback_writer,
            "question_generator": questions,
            "task_generator": task,
            "item_verifier": verifier,
            "code_reviewer": code_review,
            "interviewer": interviewer,
            "answer_evaluator": answer_evaluator,
        }
    )
