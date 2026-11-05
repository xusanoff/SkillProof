"""Provider-agnostic speech-to-text and text-to-speech (spec §3 AI).

STT_PROVIDER / TTS_PROVIDER select the implementation; `mock` is the default.
Mock STT returns the transcript supplied by the caller (text-fallback mode, tests);
mock TTS returns a short silent WAV plus the text.
"""

import io
import time
import wave
from dataclasses import dataclass
from typing import Protocol

from app.ai import usage
from app.core.config import Settings, get_settings


@dataclass(frozen=True)
class Transcript:
    text: str
    language: str
    duration_ms: int
    provider: str


@dataclass(frozen=True)
class SpeechAudio:
    audio: bytes
    content_type: str
    text: str
    language: str
    provider: str


class STTProvider(Protocol):
    async def transcribe(
        self, audio: bytes, language: str, hint_transcript: str | None = None
    ) -> Transcript: ...


class TTSProvider(Protocol):
    async def synthesize(self, text: str, language: str) -> SpeechAudio: ...


class MockSTTProvider:
    async def transcribe(
        self, audio: bytes, language: str, hint_transcript: str | None = None
    ) -> Transcript:
        return Transcript(hint_transcript or "", language, duration_ms=0, provider="mock")


class MockTTSProvider:
    sample_rate = 16_000

    async def synthesize(self, text: str, language: str) -> SpeechAudio:
        return SpeechAudio(_silence_wav(0.5, self.sample_rate), "audio/wav", text, language, "mock")


def _silence_wav(seconds: float, sample_rate: int) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(b"\x00\x00" * int(seconds * sample_rate))
    return buf.getvalue()


class MeteredSTT:
    def __init__(self, inner: STTProvider) -> None:
        self._inner = inner

    async def transcribe(
        self, audio: bytes, language: str, hint_transcript: str | None = None
    ) -> Transcript:
        started = time.perf_counter()
        result = await self._inner.transcribe(audio, language, hint_transcript)
        await usage.record(
            usage.Call(
                kind="stt",
                provider=result.provider,
                seconds=result.duration_ms / 1000,
                latency_ms=round((time.perf_counter() - started) * 1000),
            )
        )
        return result


class MeteredTTS:
    def __init__(self, inner: TTSProvider) -> None:
        self._inner = inner

    async def synthesize(self, text: str, language: str) -> SpeechAudio:
        started = time.perf_counter()
        result = await self._inner.synthesize(text, language)
        await usage.record(
            usage.Call(
                kind="tts",
                provider=result.provider,
                characters=len(text),
                latency_ms=round((time.perf_counter() - started) * 1000),
            )
        )
        return result


def get_stt(settings: Settings | None = None) -> STTProvider:
    settings = settings or get_settings()
    if settings.stt_provider == "mock":
        return MeteredSTT(MockSTTProvider())
    if settings.stt_provider == "azure":
        from app.ai.azure_speech import AzureSTT

        return MeteredSTT(AzureSTT(settings))
    if settings.stt_provider == "google":
        from app.ai.google_speech import GoogleSTT

        return MeteredSTT(GoogleSTT(settings))
    raise NotImplementedError(f"STT provider '{settings.stt_provider}' is not implemented yet")


def get_tts(settings: Settings | None = None) -> TTSProvider:
    settings = settings or get_settings()
    if settings.tts_provider == "mock":
        return MeteredTTS(MockTTSProvider())
    if settings.tts_provider == "azure":
        from app.ai.azure_speech import AzureTTS

        return MeteredTTS(AzureTTS(settings))
    if settings.tts_provider == "google":
        from app.ai.google_speech import GoogleTTS

        return MeteredTTS(GoogleTTS(settings))
    raise NotImplementedError(f"TTS provider '{settings.tts_provider}' is not implemented yet")
