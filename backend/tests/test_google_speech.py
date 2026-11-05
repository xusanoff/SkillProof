"""The Google provider against a fake server: no network, no quota."""

import base64
import io
import json
import wave
from typing import Any

import httpx
import pytest
from pydantic import SecretStr, ValidationError

from app.ai import google_speech
from app.ai.azure_speech import SAMPLE_RATE, SpeechProviderError
from app.ai.google_speech import GoogleSTT, GoogleTTS
from app.ai.speech import get_stt, get_tts
from app.core.config import Settings

KEY = "google-secret-for-tests"
SECOND = SAMPLE_RATE * 2


def _settings(**over: Any) -> Settings:
    return Settings(_env_file=None, gemini_api_key=SecretStr(KEY), **over)  # type: ignore[call-arg]


@pytest.fixture(autouse=True)
def _fast(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(google_speech, "_RETRY_WAIT_S", 0)
    monkeypatch.setattr(google_speech, "_cooling_until", {})

    async def same(audio: bytes) -> bytes:
        return audio

    monkeypatch.setattr(google_speech, "to_pcm", same)


def _done(*content: dict[str, Any]) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "status": "completed",
            "steps": [{"type": "thought"}, {"type": "model_output", "content": list(content)}],
        },
    )


def _said(text: str) -> httpx.Response:
    return _done({"type": "text", "text": text})


def _stt(handler: Any) -> GoogleSTT:
    return GoogleSTT(_settings(), httpx.MockTransport(handler))


def _tts(handler: Any) -> GoogleTTS:
    return GoogleTTS(_settings(), httpx.MockTransport(handler))


async def test_stt_sends_wav_and_language_with_the_key_only_in_a_header() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return _said(" Salom dunyo ")

    result = await _stt(handler).transcribe(b"\0\0" * SAMPLE_RATE, "uz", "from the browser")

    assert result.text == "Salom dunyo"
    assert result.provider == "google"
    assert result.duration_ms == 1000
    assert KEY not in str(seen[0].url)
    assert seen[0].headers["x-goog-api-key"] == KEY
    body = json.loads(seen[0].content)
    assert body["generation_config"]["transcription_config"]["language_codes"] == ["uz-UZ"]
    part = body["input"][0]
    assert part["mime_type"] == "audio/wav"
    with wave.open(io.BytesIO(base64.b64decode(part["data"]))) as sent:
        assert (sent.getnchannels(), sent.getframerate()) == (1, SAMPLE_RATE)


async def test_stt_splits_a_long_answer_and_joins_the_text() -> None:
    sizes: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        sizes.append(len(request.content))
        return _said(f"bo'lak{len(sizes)}")

    result = await _stt(handler).transcribe(b"\0" * SECOND * 301, "uz")

    assert result.text == "bo'lak1 bo'lak2"
    assert max(sizes) < 20_000_000


async def test_stt_silence_is_empty_text_not_an_outage() -> None:
    result = await _stt(lambda _: _done()).transcribe(b"\0\0" * SAMPLE_RATE, "ru")
    assert result.text == ""


async def test_stt_of_no_audio_makes_no_call() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        raise AssertionError("no call expected")

    assert (await _stt(handler).transcribe(b"", "en")).text == ""


async def test_tts_returns_wav_and_asks_for_the_voice() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return _done({"type": "audio", "data": base64.b64encode(b"RIFFdata").decode()})

    result = await _tts(handler).synthesize("Savol", "uz")

    assert (result.audio, result.content_type, result.provider) == (
        b"RIFFdata",
        "audio/wav",
        "google",
    )
    body = json.loads(seen[0].content)
    assert body["input"][0]["content"][0]["text"] == "Savol"
    assert body["model"] == "gemini-3.8-flash-lite-tts"
    assert body["generation_config"]["speech_config"] == [{"voice": "Kore"}]


def _speaks() -> httpx.Response:
    return _done({"type": "audio", "data": base64.b64encode(b"RIFFdata").decode()})


async def test_tts_moves_to_the_next_model_and_leaves_a_spent_one_alone() -> None:
    asked: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        model = json.loads(request.content)["model"]
        asked.append(model)
        return _speaks() if model == "gemini-3.1-flash-tts-preview" else httpx.Response(429)

    tts = _tts(handler)
    assert (await tts.synthesize("Savol", "uz")).audio == b"RIFFdata"
    assert asked == [
        "gemini-3.8-flash-lite-tts",
        "gemini-3.8-flash-tts",
        "gemini-3.1-flash-tts-preview",
    ]

    asked.clear()
    await tts.synthesize("Savol", "uz")
    assert asked == ["gemini-3.1-flash-tts-preview"]


async def test_tts_all_models_spent_is_an_error_and_later_they_are_tried_again() -> None:
    calls = 0

    def handler(_: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(429)

    tts = _tts(handler)
    for _ in range(2):
        with pytest.raises(SpeechProviderError, match="429"):
            await tts.synthesize("Savol", "uz")
    assert calls == 8


async def test_tts_outage_or_refusal_of_one_model_also_moves_on() -> None:
    replies = [httpx.Response(503), httpx.Response(400), _speaks()]
    result = await _tts(lambda _: replies.pop(0)).synthesize("Savol", "uz")
    assert result.audio == b"RIFFdata"


async def test_tts_wraps_the_bare_pcm_of_older_models_in_wav() -> None:
    pcm = b"\x01\x00" * 480
    reply = {
        "type": "audio",
        "data": base64.b64encode(pcm).decode(),
        "mime_type": "audio/L16;codec=pcm;rate=24000",
    }
    result = await _tts(lambda _: _done(reply)).synthesize("Savol", "uz")
    with wave.open(io.BytesIO(result.audio)) as out:
        assert out.getframerate() == 24_000
        assert out.readframes(480) == pcm


@pytest.mark.parametrize(
    "response",
    [
        _done({"type": "text", "text": "no audio"}),
        _done({"type": "audio", "data": "***"}),
        httpx.Response(200, json={"status": "failed"}),
        httpx.Response(200, text="not json"),
    ],
)
async def test_tts_bad_answers_are_provider_errors(response: httpx.Response) -> None:
    with pytest.raises(SpeechProviderError):
        await _tts(lambda _: response).synthesize("Savol", "uz")


async def test_a_passing_outage_is_retried_once() -> None:
    replies = [httpx.Response(503), _said("ok")]
    result = await _stt(lambda _: replies.pop(0)).transcribe(b"\0\0", "uz")
    assert result.text == "ok"


async def test_a_lasting_outage_fails_without_the_key() -> None:
    calls = 0

    def handler(_: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        raise httpx.ConnectError(f"cannot reach, key {KEY}")

    with pytest.raises(SpeechProviderError) as caught:
        await _tts(handler).synthesize("Savol", "uz")
    assert calls == 4  # once per model
    assert KEY not in str(caught.value)


async def test_spent_credit_is_not_retried() -> None:
    calls = 0

    def handler(_: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(402)

    with pytest.raises(SpeechProviderError, match="402"):
        await _tts(handler).synthesize("Savol", "uz")
    assert calls == 1


def test_settings_select_the_provider_and_need_the_key() -> None:
    settings = _settings(stt_provider="google", tts_provider="google")
    assert get_stt(settings) is not None
    assert get_tts(settings) is not None
    with pytest.raises(ValidationError, match="GEMINI_API_KEY"):
        Settings(_env_file=None, stt_provider="google")  # type: ignore[call-arg]
