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


def build_mock_provider() -> MockLLMProvider:
    return MockLLMProvider(
        {
            "question_generator": questions,
            "task_generator": task,
            "item_verifier": verifier,
            "code_reviewer": code_review,
        }
    )
