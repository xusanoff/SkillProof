"""Any OpenAI-compatible chat API (spec §1.1). Used with DeepSeek on NVIDIA."""

import asyncio
import json
import logging
import re
from typing import Any

import httpx
from pydantic import BaseModel

from app.ai.llm_client import LLMProviderError, LLMRawResponse, LLMRequest
from app.core.config import Settings

logger = logging.getLogger(__name__)

_TRIES = 2
_RETRY_WAIT_S = 3.0
_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$")


class OpenAICompatibleProvider:
    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None):
        if not settings.llm_base_url or settings.llm_api_key is None:
            raise ValueError("LLM_PROVIDER=openai_compatible needs LLM_BASE_URL and LLM_API_KEY")
        self._url = settings.llm_base_url.rstrip("/") + "/chat/completions"
        self._key = settings.llm_api_key
        self._model = settings.llm_model
        self._extra = settings.llm_extra_body
        self._timeout = settings.llm_timeout_s
        self._transport = transport

    async def complete(self, request: LLMRequest, schema: type[BaseModel]) -> LLMRawResponse:
        shape = json.dumps(schema.model_json_schema(), ensure_ascii=False)
        body = {
            **self._extra,
            "model": self._model,
            "temperature": request.temperature,
            "max_tokens": request.max_tokens,
            "response_format": {"type": "json_object"},
            "messages": [
                {
                    "role": "system",
                    "content": f"{request.system}\n\nReturn only JSON matching this:\n{shape}",
                },
                {"role": "user", "content": request.user},
            ],
        }
        data = await self._post(body)
        try:
            text = data["choices"][0]["message"].get("content") or ""
        except (KeyError, IndexError, TypeError, AttributeError):
            raise LLMProviderError("unexpected response shape") from None
        usage = data.get("usage") or {}
        return LLMRawResponse(
            text=_FENCE.sub("", text.strip()),
            model=str(data.get("model") or self._model),
            input_tokens=int(usage.get("prompt_tokens") or 0),
            output_tokens=int(usage.get("completion_tokens") or 0),
        )

    async def _post(self, body: dict[str, Any]) -> dict[str, Any]:
        headers = {"Authorization": f"Bearer {self._key.get_secret_value()}"}
        failure = "no attempt"
        async with httpx.AsyncClient(timeout=self._timeout, transport=self._transport) as client:
            for attempt in range(_TRIES):
                if attempt:
                    await asyncio.sleep(_RETRY_WAIT_S)
                try:
                    r = await client.post(self._url, json=body, headers=headers)
                except httpx.HTTPError as exc:
                    failure = type(exc).__name__  # the class only: messages can quote the request
                    continue
                if r.status_code == 429 or r.status_code >= 500:
                    failure = f"HTTP {r.status_code}"
                    continue
                if r.status_code >= 400:
                    # A bad key or request does not improve by asking again.
                    raise LLMProviderError(f"HTTP {r.status_code}")
                try:
                    data = r.json()
                except ValueError:
                    raise LLMProviderError("response is not JSON") from None
                if not isinstance(data, dict):
                    raise LLMProviderError("unexpected response shape")
                return data
        raise LLMProviderError(failure)
