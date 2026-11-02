import io
import json
import wave
from typing import Literal

from pydantic import BaseModel, Field

from app.ai.llm_client import (
    LLMClient,
    LLMRawResponse,
    LLMRequest,
    MockLLMProvider,
    build_provider,
)
from app.ai.speech import get_stt, get_tts
from app.core.config import Settings


class _Criterion(BaseModel):
    name: str
    score: int = Field(ge=0, le=5)


class _Evaluation(BaseModel):
    score: float = Field(ge=0, le=100)
    confidence: float = Field(ge=0, le=1)
    label: Literal["ok", "needs_review"]
    criteria: list[_Criterion]
    nested: _Criterion
    note: str | None
    insufficient_evidence: bool = False


def _req(role: str = "answer_evaluator") -> LLMRequest:
    return LLMRequest(role=role, prompt_version="v1", system="s", user="u")


def test_default_provider_is_mock() -> None:
    assert isinstance(build_provider(Settings()), MockLLMProvider)


async def test_mock_returns_schema_valid_json_deterministically() -> None:
    client = LLMClient(MockLLMProvider())
    a = await client.complete_json(_req(), _Evaluation)
    b = await client.complete_json(_req(), _Evaluation)
    assert a.status == "ok" and a.output is not None
    assert a.output == b.output
    assert a.model == "mock-1" and a.prompt_version == "v1"


async def test_mock_role_handler() -> None:
    def handler(_: LLMRequest) -> dict[str, object]:
        return {
            "score": 42,
            "confidence": 0.9,
            "label": "ok",
            "criteria": [],
            "nested": {"name": "x", "score": 3},
            "note": "fine",
        }

    client = LLMClient(MockLLMProvider({"answer_evaluator": handler}))
    result = await client.complete_json(_req(), _Evaluation)
    assert result.output is not None and result.output.score == 42


class _FlakyProvider:
    def __init__(self, responses: list[str]) -> None:
        self.responses = responses
        self.requests: list[LLMRequest] = []

    async def complete(self, request: LLMRequest, schema: type[BaseModel]) -> LLMRawResponse:
        self.requests.append(request)
        return LLMRawResponse(text=self.responses.pop(0), model="flaky")


async def test_invalid_output_retries_once_with_error() -> None:
    valid = json.dumps(
        {
            "score": 10,
            "confidence": 1,
            "label": "ok",
            "criteria": [],
            "nested": {"name": "n", "score": 0},
            "note": None,
        }
    )
    provider = _FlakyProvider(['{"score": 500}', valid])
    result = await LLMClient(provider).complete_json(_req(), _Evaluation)
    assert result.status == "ok" and result.attempts == 2
    assert "failed schema validation" in provider.requests[1].user


async def test_twice_invalid_output_needs_review() -> None:
    provider = _FlakyProvider(["not json", '{"score": -1}'])
    result = await LLMClient(provider).complete_json(_req(), _Evaluation)
    assert result.status == "needs_review"
    assert result.output is None
    assert len(result.errors) == 2


async def test_mock_stt_returns_provided_transcript() -> None:
    t = await get_stt(Settings()).transcribe(b"", "uz", hint_transcript="Salom")
    assert (t.text, t.language, t.provider) == ("Salom", "uz", "mock")


async def test_mock_tts_returns_silent_wav_and_text() -> None:
    out = await get_tts(Settings()).synthesize("Savol", "ru")
    assert out.text == "Savol" and out.content_type == "audio/wav"
    with wave.open(io.BytesIO(out.audio)) as w:
        assert w.getnframes() > 0
        assert set(w.readframes(w.getnframes())) == {0}


async def test_ai_eval_fast_subset_passes() -> None:
    from tests.ai_eval.run import main as eval_main

    assert await eval_main(["--fast", "--no-report"]) == 0
