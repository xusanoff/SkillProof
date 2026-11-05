"""Azure Speech over REST (spec §3). No SDK: two endpoints, and the SDK needs native libraries.

The short-audio STT endpoint takes up to 60 s of WAV, while browsers record WebM and answers
run to minutes. So answers go through ffmpeg to PCM and are sent in pieces, cut where it is
quietest so that a word is rarely split.
"""

import array
import asyncio
import io
import logging
import wave
from typing import Any
from xml.sax.saxutils import escape, quoteattr

import httpx

from app.ai.speech import SpeechAudio, Transcript
from app.core.config import Settings

logger = logging.getLogger(__name__)

PROVIDER = "azure"
SAMPLE_RATE = 16_000
_BYTES_PER_SECOND = SAMPLE_RATE * 2
_MAX_PIECE_S = 55
_SEARCH_S = 5  # a piece ends at the quietest moment of its last seconds
_FRAME_S = 0.1
_MAX_ANSWER_S = 600
_FFMPEG_TIMEOUT_S = 60.0
_HTTP_TIMEOUT_S = 60.0
_RETRY_WAIT_S = 1.0

_LOCALES = {"uz": "uz-UZ", "ru": "ru-RU", "en": "en-US"}
_VOICES = {
    "uz": "uz-UZ-MadinaNeural",
    "ru": "ru-RU-SvetlanaNeural",
    "en": "en-US-JennyNeural",
}


class SpeechProviderError(Exception):
    """Outage, spent quota, unreadable audio. Never holds the key."""


async def to_pcm(audio: bytes) -> bytes:
    """Any recording to 16 kHz mono PCM. Candidates' files are untrusted, so ffmpeg may only
    read from the pipe: no playlist in a file can make it open a URL or a local path."""
    process = await asyncio.create_subprocess_exec(
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-protocol_whitelist",
        "pipe",
        "-i",
        "pipe:0",
        "-t",
        str(_MAX_ANSWER_S),
        "-vn",
        "-ac",
        "1",
        "-ar",
        str(SAMPLE_RATE),
        "-f",
        "s16le",
        "pipe:1",
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    try:
        pcm, _ = await asyncio.wait_for(process.communicate(audio), _FFMPEG_TIMEOUT_S)
    except TimeoutError:
        process.kill()
        await process.wait()
        raise SpeechProviderError("audio conversion timed out") from None
    if process.returncode != 0:
        raise SpeechProviderError("audio could not be read")
    return pcm


def _quietest_cut(pcm: bytes, start: int, end: int) -> int:
    """The byte offset between start and end where the sound is lowest, on a sample boundary."""
    frame = int(_FRAME_S * _BYTES_PER_SECOND) & ~1
    best, best_level = end, float("inf")
    for offset in range(start, end - frame + 1, frame):
        samples = array.array("h")
        samples.frombytes(pcm[offset : offset + frame])
        level = sum(abs(x) for x in samples)
        if level < best_level:
            best, best_level = offset + frame // 2 & ~1, level
    return best


def split_pcm(pcm: bytes, max_s: int = _MAX_PIECE_S, search_s: int = _SEARCH_S) -> list[bytes]:
    limit = max_s * _BYTES_PER_SECOND
    pieces = []
    position = 0
    while len(pcm) - position > limit:
        end = position + limit
        cut = _quietest_cut(pcm, end - search_s * _BYTES_PER_SECOND, end)
        pieces.append(pcm[position:cut])
        position = cut
    if position < len(pcm):
        pieces.append(pcm[position:])
    return pieces


def wav(pcm: bytes, sample_rate: int = SAMPLE_RATE) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(sample_rate)
        out.writeframes(pcm)
    return buffer.getvalue()


class _Client:
    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None) -> None:
        if settings.azure_speech_key is None or not settings.azure_speech_region:
            raise ValueError("The azure speech provider needs AZURE_SPEECH_KEY and _REGION")
        self._key = settings.azure_speech_key
        self.region = settings.azure_speech_region
        self._transport = transport

    async def post(
        self, url: str, content: bytes, headers: dict[str, str], params: dict[str, str] | None
    ) -> httpx.Response:
        all_headers = {
            **headers,
            "Ocp-Apim-Subscription-Key": self._key.get_secret_value(),
            "User-Agent": "skillproof",
        }
        failure = "no attempt"
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_S, transport=self._transport) as client:
            for attempt in range(2):
                if attempt:
                    await asyncio.sleep(_RETRY_WAIT_S)
                try:
                    response = await client.post(
                        url, content=content, headers=all_headers, params=params
                    )
                except httpx.HTTPError as exc:
                    failure = type(exc).__name__  # the class only: messages can quote the request
                    continue
                if response.status_code == 429 or response.status_code >= 500:
                    failure = f"HTTP {response.status_code}"
                    continue
                if response.status_code >= 400:
                    raise SpeechProviderError(f"HTTP {response.status_code}")
                return response
        raise SpeechProviderError(failure)


class AzureSTT:
    def __init__(
        self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None
    ) -> None:
        self._client = _Client(settings, transport)

    async def _piece(self, pcm: bytes, locale: str) -> str:
        response = await self._client.post(
            f"https://{self._client.region}.stt.speech.microsoft.com"
            "/speech/recognition/conversation/cognitiveservices/v1",
            wav(pcm),
            {
                "Content-Type": f"audio/wav; codecs=audio/pcm; samplerate={SAMPLE_RATE}",
                "Accept": "application/json",
            },
            {"language": locale, "format": "simple", "profanity": "raw"},
        )
        try:
            data: dict[str, Any] = response.json()
        except ValueError:
            raise SpeechProviderError("response is not JSON") from None
        status = data.get("RecognitionStatus")
        if status == "Success":
            return str(data.get("DisplayText") or "")
        if status in ("NoMatch", "InitialSilenceTimeout", "BabbleTimeout"):
            return ""  # the person said nothing we could hear, which is not an outage
        raise SpeechProviderError(f"recognition status {status}")

    async def transcribe(
        self, audio: bytes, language: str, hint_transcript: str | None = None
    ) -> Transcript:
        """`hint_transcript` is ignored: it comes from the candidate's browser."""
        pcm = await to_pcm(audio)
        locale = _LOCALES.get(language, _LOCALES["uz"])
        texts = [await self._piece(piece, locale) for piece in split_pcm(pcm)]
        return Transcript(
            " ".join(t for t in texts if t),
            language,
            duration_ms=round(len(pcm) / _BYTES_PER_SECOND * 1000),
            provider=PROVIDER,
        )


class AzureTTS:
    def __init__(
        self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None
    ) -> None:
        self._client = _Client(settings, transport)

    async def synthesize(self, text: str, language: str) -> SpeechAudio:
        voice = _VOICES.get(language, _VOICES["uz"])
        locale = _LOCALES.get(language, _LOCALES["uz"])
        # Questions can quote a candidate's code, so the text must stay text inside the XML.
        ssml = (
            f"<speak version='1.0' xml:lang={quoteattr(locale)}>"
            f"<voice name={quoteattr(voice)}>{escape(text)}</voice></speak>"
        )
        response = await self._client.post(
            f"https://{self._client.region}.tts.speech.microsoft.com/cognitiveservices/v1",
            ssml.encode(),
            {
                "Content-Type": "application/ssml+xml",
                "X-Microsoft-OutputFormat": "riff-24khz-16bit-mono-pcm",
            },
            None,
        )
        return SpeechAudio(response.content, "audio/wav", text, language, PROVIDER)
