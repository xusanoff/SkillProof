"""Google Gemini speech over REST: the Interactions endpoint, as with Azure no SDK.

Answers still go through ffmpeg: it limits their length, gives the true duration for usage
records, and keeps each request well under Google's 20 MB limit for inline audio.
"""

import asyncio
import base64
import binascii
from typing import Any

import httpx

from app.ai.azure_speech import SAMPLE_RATE, SpeechProviderError, split_pcm, to_pcm, wav
from app.ai.speech import SpeechAudio, Transcript
from app.core.config import Settings

PROVIDER = "google"
_URL = "https://generativelanguage.googleapis.com/v1beta/interactions"
_MAX_PIECE_S = 300  # 16 kHz mono PCM: 9.6 MB, under 13 MB as base64
_STT_TIMEOUT_S = 120.0
_TTS_TIMEOUT_S = 15.0  # a candidate is waiting; without audio the question still shows on screen
_RETRY_WAIT_S = 1.0
_BYTES_PER_SECOND = SAMPLE_RATE * 2

_LOCALES = {"uz": "uz-UZ", "ru": "ru-RU", "en": "en-US"}


class _Client:
    def __init__(
        self, settings: Settings, transport: httpx.AsyncBaseTransport | None, timeout_s: float
    ) -> None:
        if settings.gemini_api_key is None:
            raise ValueError("The google speech provider needs GEMINI_API_KEY")
        self._key = settings.gemini_api_key
        self._transport = transport
        self._timeout_s = timeout_s

    async def post(self, body: dict[str, Any]) -> list[dict[str, Any]]:
        """The content items of the model's output."""
        headers = {
            "x-goog-api-key": self._key.get_secret_value(),  # a header: URLs end up in logs
            "User-Agent": "skillproof",
        }
        failure = "no attempt"
        async with httpx.AsyncClient(timeout=self._timeout_s, transport=self._transport) as client:
            for attempt in range(2):
                if attempt:
                    await asyncio.sleep(_RETRY_WAIT_S)
                try:
                    response = await client.post(_URL, json=body, headers=headers)
                except httpx.HTTPError as exc:
                    failure = type(exc).__name__  # the class only: messages can quote the request
                    continue
                if response.status_code == 429 or response.status_code >= 500:
                    failure = f"HTTP {response.status_code}"
                    continue
                if response.status_code >= 400:
                    raise SpeechProviderError(f"HTTP {response.status_code}")
                return _output_content(response)
        raise SpeechProviderError(failure)


def _output_content(response: httpx.Response) -> list[dict[str, Any]]:
    try:
        data = response.json()
    except ValueError:
        raise SpeechProviderError("response is not JSON") from None
    status = data.get("status")
    if status != "completed":
        raise SpeechProviderError(f"interaction status {status}")
    return [
        item
        for step in data.get("steps") or []
        if step.get("type") == "model_output"
        for item in step.get("content") or []
    ]


class GoogleSTT:
    def __init__(
        self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None
    ) -> None:
        self._client = _Client(settings, transport, _STT_TIMEOUT_S)
        self._model = settings.google_stt_model

    async def _piece(self, pcm: bytes, locale: str) -> str:
        content = await self._client.post(
            {
                "model": self._model,
                "input": [
                    {
                        "type": "audio",
                        "data": base64.b64encode(wav(pcm)).decode(),
                        "mime_type": "audio/wav",
                    }
                ],
                "generation_config": {"transcription_config": {"language_codes": [locale]}},
            }
        )
        return "".join(str(i.get("text") or "") for i in content if i.get("type") == "text").strip()

    async def transcribe(
        self, audio: bytes, language: str, hint_transcript: str | None = None
    ) -> Transcript:
        """`hint_transcript` is ignored: it comes from the candidate's browser."""
        pcm = await to_pcm(audio)
        locale = _LOCALES.get(language, _LOCALES["uz"])
        pieces = split_pcm(pcm, max_s=_MAX_PIECE_S)
        texts = [await self._piece(piece, locale) for piece in pieces]
        return Transcript(
            " ".join(t for t in texts if t),
            language,
            duration_ms=round(len(pcm) / _BYTES_PER_SECOND * 1000),
            provider=PROVIDER,
        )


class GoogleTTS:
    def __init__(
        self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None
    ) -> None:
        self._client = _Client(settings, transport, _TTS_TIMEOUT_S)
        self._model = settings.google_tts_model
        self._voice = settings.google_tts_voice

    async def synthesize(self, text: str, language: str) -> SpeechAudio:
        """The model detects the language from the text; the API has no field for it."""
        content = await self._client.post(
            {
                "model": self._model,
                "input": [{"type": "user_input", "content": [{"type": "text", "text": text}]}],
                "response_format": {"type": "audio", "mime_type": "audio/wav"},
                "generation_config": {"speech_config": [{"voice": self._voice}]},
            }
        )
        encoded = next((i.get("data") for i in content if i.get("type") == "audio"), None)
        if not encoded:
            raise SpeechProviderError("response has no audio")
        try:
            audio = base64.b64decode(encoded, validate=True)
        except (binascii.Error, ValueError):
            raise SpeechProviderError("audio is not base64") from None
        return SpeechAudio(audio, "audio/wav", text, language, PROVIDER)
