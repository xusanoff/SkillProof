"""Fail before accepting traffic when a deployment cannot run its configured services."""

import pytest
from pydantic import ValidationError

from app.core.config import Settings


def production(**overrides: object) -> Settings:
    values = {
        "environment": "production",
        "jwt_secret": "production-test-secret-with-enough-entropy",
        "llm_provider": "openai_compatible",
        "llm_base_url": "https://provider.example/v1",
        "llm_api_key": "test-key",
        "llm_model": "test-model",
        "stt_provider": "google",
        "tts_provider": "google",
        "gemini_api_key": "test-key",
        "sandbox_provider": "judge0",
        "judge0_authn_token": "test-sandbox-token",
        "email_backend": "smtp",
        "smtp_host": "smtp.example.com",
        "smtp_from": "test@example.com",
        "storage_backend": "local",
        **overrides,
    }
    return Settings(_env_file=None, **values)  # type: ignore[arg-type,call-arg]


def test_complete_production_configuration_starts() -> None:
    assert production().cookie_secure


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"llm_provider": "anthropic"}, "openai_compatible only"),
        ({"llm_provider": "gemini"}, "openai_compatible only"),
        ({"llm_base_url": None}, "Production LLM needs"),
        ({"llm_api_key": None}, "Production LLM needs"),
        ({"llm_api_key": " "}, "Production LLM needs"),
        ({"llm_model": "mock-1"}, "Production LLM needs"),
        ({"llm_model": " "}, "Production LLM needs"),
        ({"storage_backend": "s3"}, "S3 storage is not implemented"),
        ({"judge0_authn_token": ""}, "Judge0 needs"),
    ],
)
def test_incomplete_production_configuration_fails_early(
    overrides: dict[str, object], message: str
) -> None:
    with pytest.raises(ValidationError, match=message):
        production(**overrides)
