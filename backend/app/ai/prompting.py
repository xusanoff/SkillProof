"""Prompt files are versioned (`<role>.v<N>.md`) and always start with `_base_rules.md`."""

import json
from functools import cache
from pathlib import Path
from typing import Any

from app.ai.llm_client import LLMRequest

PROMPTS_DIR = Path(__file__).parent / "prompts"
LANGUAGE_NAMES = {"uz": "Uzbek (Latin script)", "ru": "Russian", "en": "English"}


@cache
def _read(name: str) -> str:
    return (PROMPTS_DIR / name).read_text(encoding="utf-8")


def render_system(role: str, version: str, language: str) -> str:
    text = _read(f"{role}.{version}.md").replace("{{base_rules}}", _read("_base_rules.md"))
    return text.replace("{{language}}", LANGUAGE_NAMES[language])


def build_request(
    role: str,
    version: str,
    language: str,
    blocks: dict[str, Any],
    *,
    temperature: float,
    max_tokens: int,
) -> LLMRequest:
    """Every input goes into its own delimited block as JSON (spec §6.6 rule 5)."""
    user = "\n\n".join(
        f"<{tag}>\n{json.dumps(value, ensure_ascii=False, indent=1)}\n</{tag}>"
        for tag, value in blocks.items()
    )
    return LLMRequest(
        role=role,
        prompt_version=f"{role}.{version}",
        system=render_system(role, version, language),
        user=user,
        temperature=temperature,
        max_tokens=max_tokens,
    )
