"""Provider-agnostic LLM client (spec §3 AI).

Every call is a narrow role with a versioned prompt and a Pydantic output schema. The
provider is chosen with LLM_PROVIDER; `mock` (default) needs no API key and returns
deterministic, schema-valid JSON so the whole platform runs and is testable offline.
"""

import json
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Protocol

from pydantic import BaseModel, ValidationError

from app.ai.mock_data import build_sample
from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class LLMRequest:
    role: str
    prompt_version: str
    system: str
    user: str
    temperature: float = 0.0
    max_tokens: int = 1024


@dataclass(frozen=True)
class LLMRawResponse:
    text: str
    model: str
    input_tokens: int = 0
    output_tokens: int = 0


@dataclass
class LLMResult[T: BaseModel]:
    output: T | None
    status: str  # "ok" | "needs_review"
    model: str
    prompt_version: str
    attempts: int
    errors: list[str] = field(default_factory=list)


class LLMProvider(Protocol):
    async def complete(self, request: LLMRequest, schema: type[BaseModel]) -> LLMRawResponse: ...


MockHandler = Callable[[LLMRequest], dict[str, Any]]


class MockLLMProvider:
    """Deterministic: a registered per-role handler, else a sample built from the schema."""

    model = "mock-1"

    def __init__(self, handlers: dict[str, MockHandler] | None = None) -> None:
        self.handlers: dict[str, MockHandler] = dict(handlers or {})

    async def complete(self, request: LLMRequest, schema: type[BaseModel]) -> LLMRawResponse:
        handler = self.handlers.get(request.role)
        payload = handler(request) if handler else build_sample(schema)
        return LLMRawResponse(text=json.dumps(payload, ensure_ascii=False), model=self.model)


class LLMClient:
    def __init__(self, provider: LLMProvider) -> None:
        self.provider = provider

    async def complete_json[T: BaseModel](
        self, request: LLMRequest, schema: type[T]
    ) -> LLMResult[T]:
        """Call the model and validate the output; retry once with the error, else needs_review."""
        errors: list[str] = []
        current = request
        model = "unknown"
        for attempt in (1, 2):
            started = time.perf_counter()
            raw = await self.provider.complete(current, schema)
            model = raw.model
            try:
                output = schema.model_validate_json(raw.text)
            except ValidationError as exc:
                errors.append(str(exc))
                outcome = "invalid"
                current = _with_validation_error(request, str(exc))
            else:
                outcome = "ok"
            logger.info(
                "llm_call",
                extra={
                    "role": request.role,
                    "prompt_version": request.prompt_version,
                    "model": raw.model,
                    "attempt": attempt,
                    "latency_ms": round((time.perf_counter() - started) * 1000),
                    "input_tokens": raw.input_tokens,
                    "output_tokens": raw.output_tokens,
                    "validation": outcome,
                },
            )
            if outcome == "ok":
                return LLMResult(output, "ok", raw.model, request.prompt_version, attempt, errors)
        return LLMResult(None, "needs_review", model, request.prompt_version, 2, errors)


def _with_validation_error(request: LLMRequest, error: str) -> LLMRequest:
    user = (
        f"{request.user}\n\nYour previous output failed schema validation:\n{error}\n"
        "Return only JSON that matches the schema."
    )
    return LLMRequest(
        request.role,
        request.prompt_version,
        request.system,
        user,
        request.temperature,
        request.max_tokens,
    )


def build_provider(settings: Settings) -> LLMProvider:
    if settings.llm_provider == "mock":
        from app.ai.mock_handlers import build_mock_provider

        return build_mock_provider()
    # Real providers are added once the provider decision is made (spec §1.1).
    raise NotImplementedError(f"LLM provider '{settings.llm_provider}' is not implemented yet")


def get_llm_client() -> LLMClient:
    return LLMClient(build_provider(get_settings()))
