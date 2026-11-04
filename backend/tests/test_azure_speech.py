"""The Azure provider against a fake server: no network, no quota."""

import io
import shutil
import wave
from typing import Any

import httpx
import pytest
from pydantic import SecretStr

from app.ai import azure_speech
from app.ai.azure_speech import (
    SAMPLE_RATE,
    AzureSTT,
    AzureTTS,
    SpeechProviderError,
    split_pcm,
    to_pcm,
)
from app.ai.speech import get_stt, get_tts
from app.core.config import Settings

KEY = "azure-secret-for-tests"
SECOND = SAMPLE_RATE * 2


def _settings(**over: Any) -> Settings:
    return Settings(
        _env_file=None,  # type: ignore[call-arg]
        azure_speech_key=SecretStr(KEY),
        azure_speech_region="swedencentral",
        **over,
    )


def _loud(seconds: float) -> bytes:
    return b"\xff\x3f\x01\xc0" * int(seconds * SAMPLE_RATE / 2)


def _silent(seconds: float) -> bytes:
    return b"\0\0" * int(seconds * SAMPLE_RATE)


@pytest.fixture(autouse=True)
def _fast(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(azure_speech, "_RETRY_WAIT_S", 0)


@pytest.fixture
def pcm_passthrough(monkeypatch: pytest.MonkeyPatch) -> None:
    async def same(audio: bytes) -> bytes:
        return audio

    monkeypatch.setattr(azure_speech, "to_pcm", same)


def _stt(handler: Any) -> AzureSTT:
    return AzureSTT(_settings(), httpx.MockTransport(handler))


def _said(text: str) -> httpx.Response:
    return httpx.Response(200, json={"RecognitionStatus": "Success", "DisplayText": text})


async def test_tts_keeps_a_candidates_code_out_of_the_markup() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, content=b"RIFF")

    tts = AzureTTS(_settings(), httpx.MockTransport(handler))
    speech = await tts.synthesize("a < b </voice><voice name='x'> & c", "ru")

    assert speech.audio == b"RIFF" and speech.content_type == "audio/wav"
    assert seen[0].url.host == "swedencentral.tts.speech.microsoft.com"
    assert seen[0].headers["ocp-apim-subscription-key"] == KEY
    body = seen[0].content.decode()
    assert "ru-RU-SvetlanaNeural" in body
    assert "a &lt; b &lt;/voice&gt;" in body and "&amp; c" in body
    assert "<voice name='x'>" not in body


@pytest.mark.parametrize(("language", "voice"), [("uz", "uz-UZ-MadinaNeural"), ("en", "en-US-")])
async def test_tts_picks_the_voice_by_language(language: str, voice: str) -> None:
    bodies: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        bodies.append(request.content.decode())
        return httpx.Response(200, content=b"RIFF")

    await AzureTTS(_settings(), httpx.MockTransport(handler)).synthesize("Salom", language)
    assert voice in bodies[0]


@pytest.mark.usefixtures("pcm_passthrough")
async def test_stt_sends_wav_in_the_right_language_and_ignores_the_browser_hint() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return _said("Dekorator funksiyani o'raydi.")

    result = await _stt(handler).transcribe(_loud(2), "uz", "boshqa matn")

    assert result.text == "Dekorator funksiyani o'raydi."
    assert result.duration_ms == 2000
    assert result.provider == "azure"
    assert seen[0].url.params["language"] == "uz-UZ"
    assert seen[0].content.startswith(b"RIFF")


@pytest.mark.usefixtures("pcm_passthrough")
async def test_a_long_answer_goes_in_pieces_and_comes_back_whole() -> None:
    lengths: list[float] = []

    def handler(request: httpx.Request) -> httpx.Response:
        with wave.open(io.BytesIO(request.content)) as w:
            lengths.append(w.getnframes() / w.getframerate())
        return _said(f"qism{len(lengths)}")

    result = await _stt(handler).transcribe(_loud(130), "ru")

    assert result.text == "qism1 qism2 qism3"
    assert all(x <= 60 for x in lengths)  # the endpoint's limit
    assert round(sum(lengths)) == 130  # nothing lost
    assert result.duration_ms == 130_000


def test_a_piece_ends_in_the_pause_rather_than_in_a_word() -> None:
    pcm = _loud(52) + _silent(0.5) + _loud(20)
    first, second = split_pcm(pcm)
    assert 52 <= len(first) / SECOND <= 52.5
    assert first + second == pcm
    assert len(first) % 2 == 0


@pytest.mark.usefixtures("pcm_passthrough")
async def test_silence_is_an_empty_answer_and_not_a_failure() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"RecognitionStatus": "InitialSilenceTimeout"})

    assert (await _stt(handler).transcribe(_silent(1), "uz")).text == ""


@pytest.mark.usefixtures("pcm_passthrough")
async def test_a_recognition_error_is_a_failure() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"RecognitionStatus": "Error"})

    with pytest.raises(SpeechProviderError):
        await _stt(handler).transcribe(_loud(1), "uz")


@pytest.mark.usefixtures("pcm_passthrough")
async def test_spent_quota_fails_once_and_does_not_quote_the_key() -> None:
    calls = []

    def handler(_: httpx.Request) -> httpx.Response:
        calls.append(1)
        return httpx.Response(403, text=f"quota, key {KEY}")

    with pytest.raises(SpeechProviderError) as caught:
        await _stt(handler).transcribe(_loud(1), "uz")
    assert len(calls) == 1
    assert KEY not in str(caught.value)


@pytest.mark.usefixtures("pcm_passthrough")
async def test_an_outage_is_retried_once() -> None:
    replies = [httpx.Response(503), _said("ok")]
    assert (await _stt(lambda _: replies.pop(0)).transcribe(_loud(1), "uz")).text == "ok"


def test_settings_select_azure_and_need_the_credentials() -> None:
    assert type(get_stt(_settings(stt_provider="azure"))._inner) is AzureSTT  # type: ignore[attr-defined]
    assert type(get_tts(_settings(tts_provider="azure"))._inner) is AzureTTS  # type: ignore[attr-defined]
    with pytest.raises(ValueError, match="AZURE_SPEECH_KEY"):
        Settings(_env_file=None, stt_provider="azure")  # type: ignore[call-arg]


needs_ffmpeg = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")


@needs_ffmpeg
async def test_ffmpeg_reads_a_real_file() -> None:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as out:
        out.setnchannels(2)
        out.setsampwidth(2)
        out.setframerate(44_100)
        out.writeframes(b"\0\0\0\0" * 44_100)
    pcm = await to_pcm(buffer.getvalue())
    assert abs(len(pcm) - SECOND) < 2000  # one second, mono, 16 kHz


@needs_ffmpeg
async def test_ffmpeg_refuses_garbage_and_cannot_be_sent_to_a_url() -> None:
    with pytest.raises(SpeechProviderError):
        await to_pcm(b"not audio at all")
    playlist = b"#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:1,\nhttp://127.0.0.1:9/secret\n"
    with pytest.raises(SpeechProviderError):
        await to_pcm(playlist)
