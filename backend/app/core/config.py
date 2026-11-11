"""Application settings. Every value comes from environment variables (see .env.example)."""

from functools import lru_cache
from typing import Any, Literal, Self

from pydantic import BaseModel, Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.thresholds import Thresholds

Environment = Literal["local", "test", "staging", "production"]
LLMProvider = Literal["mock", "openai_compatible", "gemini", "anthropic"]
SpeechProvider = Literal["mock", "azure", "google"]


_DEV_JWT_SECRET = "dev-only-insecure-jwt-secret-change-me-in-env"


class AiPrice(BaseModel):
    input_per_mtok: float = 0.0
    output_per_mtok: float = 0.0
    per_minute: float = 0.0
    per_mchar: float = 0.0


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_ignore_empty=True,
        env_nested_delimiter="__",
        extra="ignore",
        hide_input_in_errors=True,  # a startup error goes to the logs, and the input holds secrets
        case_sensitive=False,
    )

    app_name: str = "SkillProof"
    version: str = "0.1.0"
    environment: Environment = "local"
    log_level: str = "INFO"
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])

    database_url: str = "postgresql+asyncpg://skillproof:skillproof@localhost:5432/skillproof"
    redis_url: str = "redis://localhost:6379/0"

    # File storage: local disk by default; any S3-compatible service when set to "s3".
    storage_backend: Literal["local", "s3"] = "local"
    storage_local_dir: str = "./var/uploads"
    s3_endpoint_url: str | None = None
    s3_access_key: str | None = None
    s3_secret_key: SecretStr | None = None
    s3_bucket: str = "skillproof"

    frontend_url: str = "http://localhost:3000"

    # Auth (spec §3): JWT access + opaque rotating refresh token, both in httpOnly cookies.
    jwt_secret: SecretStr = SecretStr(_DEV_JWT_SECRET)
    access_token_minutes: int = 15
    refresh_token_days: int = 30
    email_verification_hours: int = 48
    password_reset_minutes: int = 60
    invitation_days: int = 7
    email_backend: Literal["console", "smtp"] = "console"
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: SecretStr | None = None
    smtp_from: str | None = None

    # Telegram stays off until all three are set.
    telegram_bot_token: SecretStr | None = None
    telegram_bot_username: str | None = None
    telegram_webhook_secret: SecretStr | None = None

    # Candidates must confirm their email before applying (owner can switch on later).
    require_verified_email_to_apply: bool = False

    # Code execution (spec §3): languages offered for coding tasks. Judge0 arrives in Phase 4.
    sandbox_languages: list[str] = Field(
        default_factory=lambda: ["python", "javascript", "typescript", "sql", "go", "java"]
    )
    sandbox_provider: Literal["stub", "judge0"] = "stub"
    judge0_url: str = "http://judge0-server:2358"
    judge0_authn_token: str = ""
    judge0_timeout_s: float = 60
    # Judge0 language id and what each runtime needs on top of the task's limits. Limits are
    # per process (address space, see infra/judge0.conf), so JVM and Node reserve far more than
    # they use; values measured against Judge0 1.13.1 (D-081).
    sandbox_profiles: dict[str, dict[str, int]] = Field(
        default_factory=lambda: {
            "python": {"id": 71, "extra_memory_mb": 0, "processes": 30, "extra_cpu_s": 0},
            "javascript": {"id": 63, "extra_memory_mb": 768, "processes": 64, "extra_cpu_s": 0},
            "typescript": {"id": 74, "extra_memory_mb": 768, "processes": 64, "extra_cpu_s": 8},
            "sql": {"id": 82, "extra_memory_mb": 0, "processes": 30, "extra_cpu_s": 0},
            "go": {"id": 60, "extra_memory_mb": 768, "processes": 128, "extra_cpu_s": 3},
            "java": {"id": 62, "extra_memory_mb": 3840, "processes": 128, "extra_cpu_s": 3},
        }
    )
    # Shown to candidates: Judge0's runtimes are not the latest versions (D-079).
    sandbox_language_labels: dict[str, str] = Field(
        default_factory=lambda: {
            "python": "Python 3.8",
            "javascript": "JavaScript (Node.js 12)",
            "typescript": "TypeScript 3.7",
            "sql": "SQL (SQLite 3.27)",
            "go": "Go 1.13",
            "java": "Java 13",
        }
    )
    sandbox_output_max_chars: int = 20_000

    # Interview (spec §6.0, §6.1)
    rules_version: str = "2026-11"
    rate_limit_sandbox_run: str = "20/60"
    interview_ws_tick_s: float = 2
    interview_ws_max_message_bytes: int = 1_000_000
    interview_code_max_chars: int = 200_000
    interview_answer_max_chars: int = 20_000
    interview_audio_max_bytes: int = 15 * 1024 * 1024
    evaluation_max_attempts: int = 5
    # Must leave time for rollback/failure accounting before the worker's 600s limit.
    report_timeout_s: float = Field(default=180, gt=0, le=540)
    report_ai_phase_timeout_s: float = Field(default=30, gt=0, le=60)
    report_grading_concurrency: int = Field(default=3, ge=1, le=8)
    evaluation_sweep_batch: int = 20

    # Uploads
    resume_max_bytes: int = 5 * 1024 * 1024
    logo_max_bytes: int = 2 * 1024 * 1024

    # Rate limits: "<count>/<seconds>"
    # Only behind a proxy that overwrites X-Forwarded-For, or anyone could pick their own limit.
    trust_forwarded_for: bool = False
    rate_limit_chat: str = "60/60"
    rate_limit_login: str = "10/60"
    rate_limit_register: str = "5/60"
    rate_limit_password: str = "5/900"
    rate_limit_export: str = "3/3600"

    @model_validator(mode="after")
    def _require_real_secret(self) -> Self:
        if self.environment not in ("local", "test"):
            secret = self.jwt_secret.get_secret_value()
            if secret == _DEV_JWT_SECRET or len(secret) < 32:
                raise ValueError("JWT_SECRET must be set to a random value of 32+ characters")
        if self.environment == "production":
            # A mock would hand out invented scores in real hiring, and the console email
            # backend would write password reset links into the logs.
            not_real = [
                name
                for name, is_stand_in in {
                    "LLM_PROVIDER": self.llm_provider == "mock",
                    "STT_PROVIDER": self.stt_provider == "mock",
                    "TTS_PROVIDER": self.tts_provider == "mock",
                    "SANDBOX_PROVIDER": self.sandbox_provider == "stub",
                    "EMAIL_BACKEND": self.email_backend == "console",
                }.items()
                if is_stand_in
            ]
            if not_real:
                raise ValueError(f"Production needs real services: {', '.join(not_real)}")
            if self.llm_provider != "openai_compatible":
                raise ValueError("Production supports LLM_PROVIDER=openai_compatible only")
            if not (
                self.llm_base_url
                and self.llm_api_key
                and self.llm_api_key.get_secret_value().strip()
                and self.llm_model.strip()
                and self.llm_model != "mock-1"
            ):
                raise ValueError(
                    "Production LLM needs LLM_BASE_URL, LLM_API_KEY and a real LLM_MODEL"
                )
            if self.storage_backend != "local":
                raise ValueError("S3 storage is not implemented; use STORAGE_BACKEND=local")
            if not self.judge0_authn_token.strip():
                raise ValueError("Production Judge0 needs JUDGE0_AUTHN_TOKEN")
        if "azure" in (self.stt_provider, self.tts_provider) and not (
            self.azure_speech_key and self.azure_speech_region
        ):
            raise ValueError("The azure speech provider needs AZURE_SPEECH_KEY and _REGION")
        if "google" in (self.stt_provider, self.tts_provider) and not self.gemini_api_key:
            raise ValueError("The google speech provider needs GEMINI_API_KEY")
        if self.email_backend == "smtp" and not (self.smtp_host and self.smtp_from):
            raise ValueError("EMAIL_BACKEND=smtp needs SMTP_HOST and SMTP_FROM")
        telegram = (
            self.telegram_bot_token,
            self.telegram_bot_username,
            self.telegram_webhook_secret,
        )
        if any(telegram) and not all(telegram):
            raise ValueError(
                "Telegram needs TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME "
                "and TELEGRAM_WEBHOOK_SECRET together"
            )
        return self

    @property
    def cookie_secure(self) -> bool:
        return self.environment not in ("local", "test")

    # USD. Keys: LLM model name, or speech provider name. Without a price, cost shows as unknown.
    ai_prices: dict[str, AiPrice] = Field(default_factory=dict)
    llm_provider: LLMProvider = "mock"
    llm_model: str = "mock-1"
    llm_base_url: str | None = None
    llm_api_key: SecretStr | None = None
    llm_timeout_s: float = 120.0
    # Provider-specific fields, e.g. switching off reasoning, which can use up max_tokens.
    llm_extra_body: dict[str, Any] = Field(default_factory=dict)
    stt_provider: SpeechProvider = "mock"
    tts_provider: SpeechProvider = "mock"
    azure_speech_key: SecretStr | None = None
    azure_speech_region: str | None = None
    gemini_api_key: SecretStr | None = None
    google_stt_model: str = "models/gemini-3.5-transcribe"
    # Tried in order: when one is out of quota or down, the next one speaks.
    google_tts_models: list[str] = [
        "gemini-3.8-flash-lite-tts",
        "gemini-3.8-flash-tts",
        "gemini-3.1-flash-tts-preview",
        "gemini-2.5-flash-preview-tts",
    ]
    google_tts_voice: str = "Kore"

    # Global defaults for every configurable threshold (spec §0.9). Override with
    # e.g. THRESHOLDS__INTEGRITY__INACTIVITY_LIMIT_S=120; per-assessment overrides
    # are merged on top via Thresholds.with_overrides().
    thresholds: Thresholds = Field(default_factory=Thresholds)


@lru_cache
def get_settings() -> Settings:
    return Settings()
