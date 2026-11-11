"""No real AI calls: persistence, concurrent claims and safe interview fallbacks."""

import asyncio
import uuid

import httpx
import pytest
from fastapi import FastAPI
from pydantic import BaseModel, SecretStr

from app.ai import budget, google_speech
from app.ai.google_speech import GoogleSTT, GoogleTTS
from app.ai.llm_client import LLMClient, LLMRequest, MockLLMProvider
from app.core.config import Settings
from app.core.db import SessionLocal
from app.core.thresholds import BudgetThresholds
from app.models import InterviewSession
from app.models.platform import AiBudget
from app.schemas.assessment import Stage1Config
from tests.conftest import SignUp
from tests.test_interview import _setup, _start
from tests.test_stage1_evaluation import _evaluate, _hr_report, _submit


class Answer(BaseModel):
    text: str


async def test_atomic_reservations_persist_and_do_not_cross_applications(
    signup: SignUp, app: FastAPI
) -> None:
    ctx = await _setup(signup, app)
    aid = uuid.UUID(ctx["aid"])
    limits = BudgetThresholds(token_limit=10)

    async def claim() -> bool:
        with budget.scope(aid, limits):
            try:
                await budget.reserve("tokens", 1)
                return True
            except budget.BudgetExceeded:
                return False

    assert sum(await asyncio.gather(*(claim() for _ in range(20)))) == 10
    # Fresh context/request sees the durable counter; other resources remain available.
    with budget.scope(aid, limits):
        with pytest.raises(budget.BudgetExceeded):
            await budget.reserve("tokens", 1)
        await budget.reserve("tts_characters", 5)
    async with SessionLocal() as db:
        row = await db.get(AiBudget, aid)
        assert row is not None and row.tokens == 10 and row.tts_characters == 5
    # Context was reset: non-interview generation has no application budget.
    await budget.reserve("tokens", 100)


async def test_budget_blocks_llm_before_provider_and_returns_needs_review(
    signup: SignUp, app: FastAPI
) -> None:
    ctx = await _setup(signup, app)
    calls = []

    def answer(request: LLMRequest) -> dict[str, str]:
        calls.append(request)
        return {"text": "ok"}

    llm = LLMClient(MockLLMProvider({"test": answer}))
    with budget.scope(uuid.UUID(ctx["aid"]), BudgetThresholds(token_limit=1)):
        result = await llm.complete_json(LLMRequest("test", "v1", "system", "user"), Answer)
    assert result.status == "needs_review" and result.output is None
    assert not calls


async def test_stage1_budget_exhaustion_keeps_deterministic_score_and_hr_review(
    signup: SignUp, app: FastAPI
) -> None:
    ctx = await _setup(signup, app)
    state = await _start(ctx)
    async with SessionLocal() as db:
        s = await db.get(InterviewSession, uuid.UUID(state["id"]))
        assert s is not None
        s.config = {
            **s.config,
            "thresholds": {**s.config["thresholds"], "budget": {"token_limit": 1}},
        }
        await db.commit()
    sid = await _submit(ctx, state)
    await _evaluate(sid)
    report = await _hr_report(ctx)
    assert report["needs_review"] is True
    assert report["passed"] is True and report["score_percent"] == 100
    assert report["code_review_percent"] is None


async def test_speech_limits_use_decoded_duration_and_stop_model_fallbacks(
    signup: SignUp, app: FastAPI, monkeypatch: pytest.MonkeyPatch
) -> None:
    ctx = await _setup(signup, app)
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(500)

    async def pcm(_: bytes) -> bytes:
        return b"\0" * (google_speech.SAMPLE_RATE * 2 * 2)

    monkeypatch.setattr(google_speech, "to_pcm", pcm)
    monkeypatch.setattr(google_speech, "_cooling_until", {})
    settings = Settings(
        _env_file=None, gemini_api_key=SecretStr("fake"), google_tts_models=["first", "second"]
    )
    transport = httpx.MockTransport(handler)
    with budget.scope(
        uuid.UUID(ctx["aid"]), BudgetThresholds(stt_seconds_limit=1, tts_characters_limit=5)
    ):
        with pytest.raises(budget.BudgetExceeded):
            await GoogleSTT(settings, transport).transcribe(b"compressed", "uz")
        assert not calls
        with pytest.raises(budget.BudgetExceeded):
            await GoogleTTS(settings, transport).synthesize("Salom", "uz")
        # First failed model consumed the allowance; next model never reaches the network.
        assert len(calls) == 1


def test_assessment_budget_overrides_reject_unknown_or_invalid_limits() -> None:
    from pydantic import ValidationError

    assert Stage1Config(budget={"token_limit": 500}).budget == {"token_limit": 500}
    for limits in ({"token_limit": 0}, {"typo": 2}):
        with pytest.raises(ValidationError):
            Stage1Config(budget=limits)
