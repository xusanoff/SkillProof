"""The OpenAI-compatible provider, against a fake server: no network, no quota."""

import json
from typing import Any

import httpx
import pytest
from pydantic import BaseModel, SecretStr

from app.ai.llm_client import LLMClient, LLMProviderError, LLMRequest, build_provider
from app.ai.openai_compatible import OpenAICompatibleProvider
from app.core.config import Settings

KEY = "nvapi-secret-for-tests"


class Out(BaseModel):
    score: int


def _settings(**over: Any) -> Settings:
    return Settings(
        _env_file=None,  # type: ignore[call-arg]
        llm_provider="openai_compatible",
        llm_base_url="https://llm.example/v1/",
        llm_model="test-model",
        llm_api_key=SecretStr(KEY),
        **over,
    )


def _reply(content: str | None) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "model": "test-model",
            "choices": [{"message": {"content": content}}],
            "usage": {"prompt_tokens": 7, "completion_tokens": 3},
        },
    )


def _provider(handler: Any, **over: Any) -> OpenAICompatibleProvider:
    return OpenAICompatibleProvider(_settings(**over), httpx.MockTransport(handler))


REQUEST = LLMRequest("answer_evaluator", "v1", "Baholang.", "Javob", 0.0, 100)


@pytest.fixture(autouse=True)
def _no_wait(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.ai.openai_compatible._RETRY_WAIT_S", 0)


async def test_sends_the_request_and_reads_the_reply() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return _reply('{"score": 80}')

    raw = await _provider(
        handler, llm_extra_body={"chat_template_kwargs": {"thinking": False}}
    ).complete(REQUEST, Out)

    assert (raw.text, raw.model, raw.input_tokens, raw.output_tokens) == (
        '{"score": 80}',
        "test-model",
        7,
        3,
    )
    assert str(seen[0].url) == "https://llm.example/v1/chat/completions"
    assert seen[0].headers["authorization"] == f"Bearer {KEY}"
    body = json.loads(seen[0].content)
    assert body["model"] == "test-model"
    assert body["max_tokens"] == 100
    assert body["chat_template_kwargs"] == {"thinking": False}
    assert body["response_format"] == {"type": "json_object"}
    assert "score" in body["messages"][0]["content"]  # the schema reaches the model


async def test_strips_a_code_fence() -> None:
    raw = await _provider(lambda _: _reply('```json\n{"score": 1}\n```')).complete(REQUEST, Out)
    assert raw.text == '{"score": 1}'


async def test_retries_an_outage_once_then_recovers() -> None:
    replies = [httpx.Response(503), _reply('{"score": 2}')]
    raw = await _provider(lambda _: replies.pop(0)).complete(REQUEST, Out)
    assert raw.text == '{"score": 2}'


async def test_a_bad_key_is_not_retried_and_not_quoted() -> None:
    calls = []

    def handler(_: httpx.Request) -> httpx.Response:
        calls.append(1)
        return httpx.Response(401, text=f"bad key {KEY}")

    with pytest.raises(LLMProviderError) as caught:
        await _provider(handler).complete(REQUEST, Out)
    assert len(calls) == 1
    assert KEY not in str(caught.value)


async def test_a_network_error_does_not_quote_the_request() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError(f"failed {request.headers['authorization']}")

    with pytest.raises(LLMProviderError) as caught:
        await _provider(handler).complete(REQUEST, Out)
    assert KEY not in str(caught.value)


async def test_an_outage_becomes_needs_review_and_not_an_exception() -> None:
    result = await LLMClient(_provider(lambda _: httpx.Response(503))).complete_json(REQUEST, Out)
    assert result.status == "needs_review"
    assert result.output is None


async def test_empty_content_retries_with_the_error_then_succeeds() -> None:
    replies = [_reply(None), _reply('{"score": 3}')]
    result = await LLMClient(_provider(lambda _: replies.pop(0))).complete_json(REQUEST, Out)
    assert result.status == "ok" and result.output == Out(score=3)


def test_missing_credentials_stop_the_start() -> None:
    settings = Settings(_env_file=None, llm_provider="openai_compatible")  # type: ignore[call-arg]
    with pytest.raises(ValueError, match="LLM_API_KEY"):
        build_provider(settings)
