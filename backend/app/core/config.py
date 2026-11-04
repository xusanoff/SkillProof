"""Application settings. Every value comes from environment variables (see .env.example)."""

from functools import lru_cache
from typing import Literal, Self

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.thresholds import Thresholds

Environment = Literal["local", "test", "staging", "production"]
LLMProvider = Literal["mock", "openai_compatible", "gemini", "anthropic"]
SpeechProvider = Literal["mock"]


_DEV_JWT_SECRET = "dev-only-insecure-jwt-secret-change-me-in-env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_ignore_empty=True,
        env_nested_delimiter="__",
        extra="ignore",
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
    evaluation_sweep_batch: int = 20

    # Uploads
    resume_max_bytes: int = 5 * 1024 * 1024
    logo_max_bytes: int = 2 * 1024 * 1024

    # Rate limits: "<count>/<seconds>"
    rate_limit_login: str = "10/60"
    rate_limit_register: str = "5/60"
    rate_limit_password: str = "5/900"

    @model_validator(mode="after")
    def _require_real_secret(self) -> Self:
        if self.environment not in ("local", "test"):
            secret = self.jwt_secret.get_secret_value()
            if secret == _DEV_JWT_SECRET or len(secret) < 32:
                raise ValueError("JWT_SECRET must be set to a random value of 32+ characters")
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

    llm_provider: LLMProvider = "mock"
    llm_model: str = "mock-1"
    llm_base_url: str | None = None
    llm_api_key: SecretStr | None = None
    stt_provider: SpeechProvider = "mock"
    tts_provider: SpeechProvider = "mock"

    # Global defaults for every configurable threshold (spec §0.9). Override with
    # e.g. THRESHOLDS__INTEGRITY__INACTIVITY_LIMIT_S=120; per-assessment overrides
    # are merged on top via Thresholds.with_overrides().
    thresholds: Thresholds = Field(default_factory=Thresholds)


@lru_cache
def get_settings() -> Settings:
    return Settings()
