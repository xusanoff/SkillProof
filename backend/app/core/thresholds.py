"""Registry of every configurable threshold in the spec (§0.9).

Global defaults live here and can be overridden by environment variables (see config.py).
Assessments store a partial dict of overrides (stage1_config / stage2_config /
integrity_config) which is deep-merged and re-validated with `with_overrides`.
"""

from typing import Any, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator


class _Group(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class Stage1Thresholds(_Group):
    pass_threshold: float = Field(70, ge=0, le=100, description="Min Stage 1 % to reach Stage 2")
    hidden_tests_weight: float = Field(70, ge=0, le=100)
    code_review_weight: float = Field(30, ge=0, le=100)
    task_time_limit_minutes: int = Field(45, ge=1)
    warmup_minutes: int = Field(2, ge=0)

    @model_validator(mode="after")
    def _weights_sum_to_100(self) -> Self:
        if self.hidden_tests_weight + self.code_review_weight != 100:
            raise ValueError("hidden_tests_weight + code_review_weight must equal 100")
        return self


class Stage2Thresholds(_Group):
    pass_threshold: float = Field(60, ge=0, le=100)
    session_minutes: int = Field(20, ge=1)
    answer_time_limit_s: int = Field(180, ge=10)
    question_count: int = Field(8, ge=1)
    min_own_code_questions: int = Field(2, ge=0)
    max_follow_ups_per_question: int = Field(1, ge=0)
    max_follow_ups_total: int = Field(4, ge=0)
    difficulty_up_percent: float = Field(75, ge=0, le=100, description="At or above → harder")
    difficulty_down_percent: float = Field(40, ge=0, le=100, description="Below → easier")
    follow_up_max_percent: float = Field(85, ge=0, le=100, description="Above → no follow-up")
    question_max_chars: int = Field(300, ge=20)
    question_max_sentences: int = Field(2, ge=1)
    question_max_playback_s: int = Field(60, ge=1, description="Timer starts by then regardless")
    answer_upload_grace_s: int = Field(20, ge=0, description="Past the answer limit, for uploads")
    live_llm_timeout_s: float = Field(
        4,
        ge=0.1,
        description="A live interview call past this is dropped: the interview goes on without it",
    )
    preparing_stale_s: int = Field(90, ge=5, description="A stuck next-turn claim expires")


class IntegrityThresholds(_Group):
    # Paste rule (§7.1)
    paste_max_lines: int = Field(2, ge=0, description="External paste above this disqualifies")
    paste_max_chars: int = Field(80, ge=0)
    # Inactivity rule (§7.1b)
    inactivity_warning_s: int = Field(60, ge=1)
    inactivity_limit_s: int = Field(90, ge=1)
    reconnect_window_s: int = Field(300, ge=0)
    # Stage 1 signals (§7.2)
    idle_signal_min_s: int = Field(30, ge=1)
    max_typing_chars_per_s: float = Field(15, gt=0)
    min_keystroke_interval_cv: float = Field(0.15, ge=0, description="Below = robotic typing")
    burst_after_idle_chars: int = Field(200, ge=1)
    burst_window_s: int = Field(20, ge=1)
    typing_window_s: int = Field(5, ge=1)
    typing_min_chars: int = Field(40, ge=1)
    keystroke_min_samples: int = Field(50, ge=2)
    keystroke_max_gap_s: float = Field(2, gt=0)
    idle_repeat_count: int = Field(3, ge=2)
    linear_min_chars: int = Field(300, ge=1)
    linear_max_edit_ratio: float = Field(0.03, ge=0, le=1)
    linear_max_back_jumps: int = Field(2, ge=0)
    no_run_min_chars: int = Field(200, ge=1)
    focus_brief_s: int = Field(5, ge=0)
    focus_long_total_s: int = Field(60, ge=1)
    focus_many_count: int = Field(5, ge=1)
    # Stage 2 signals (§7.3)
    long_silence_s: float = Field(8, ge=0)
    long_silence_repeat_count: int = Field(3, ge=2)
    fluent_answer_min_words: int = Field(40, ge=1)
    own_code_low_percent: float = Field(50, ge=0, le=100)
    own_code_stage1_high_percent: float = Field(70, ge=0, le=100)
    own_code_min_answers: int = Field(2, ge=1)
    reading_min_words: int = Field(60, ge=1)
    reading_max_filler_ratio: float = Field(0.005, ge=0, le=1)
    reading_max_pace_cv: float = Field(0.08, ge=0)
    reading_min_answers: int = Field(3, ge=2)
    # Suspicion labels (§7.4)
    suspicion_medium_from: float = Field(30, ge=0, le=100)
    suspicion_high_from: float = Field(70, ge=0, le=100)
    weight_info: float = Field(0, ge=0, le=100)
    weight_low: float = Field(8, ge=0, le=100)
    weight_medium: float = Field(20, ge=0, le=100)
    weight_high: float = Field(45, ge=0, le=100)

    @model_validator(mode="after")
    def _ordering(self) -> Self:
        if self.inactivity_warning_s >= self.inactivity_limit_s:
            raise ValueError("inactivity_warning_s must be less than inactivity_limit_s")
        if self.suspicion_medium_from >= self.suspicion_high_from:
            raise ValueError("suspicion_medium_from must be less than suspicion_high_from")
        return self


class EvaluationThresholds(_Group):
    min_confidence: float = Field(0.6, ge=0, le=1, description="Below → second evaluation")
    max_disagreement: float = Field(15, ge=0, le=100, description="% points → needs_review")


class TelemetryThresholds(_Group):
    batch_interval_ms: int = Field(1500, ge=100)


class PrivacyThresholds(_Group):
    retention_days: int = Field(180, ge=1)


class ReportThresholds(_Group):
    stage1_weight: float = Field(50, ge=0, le=100, description="Share of Stage 1 in overall %")
    stage2_weight: float = Field(50, ge=0, le=100, description="Share of Stage 2 in overall %")
    strong_yes_from: float = Field(85, ge=0, le=100)
    yes_from: float = Field(70, ge=0, le=100)
    maybe_from: float = Field(50, ge=0, le=100)

    @model_validator(mode="after")
    def _valid(self) -> Self:
        if self.stage1_weight + self.stage2_weight != 100:
            raise ValueError("stage1_weight + stage2_weight must equal 100")
        if not self.maybe_from <= self.yes_from <= self.strong_yes_from:
            raise ValueError("recommendation bands must not overlap")
        return self


class VerifiedSkillThresholds(_Group):
    """Global only: a company's assessment settings never change what counts as verified."""

    validity_days: int = Field(365, ge=1, le=3650)
    min_percent: float = Field(60, ge=0, le=100, description="Min skill % to become verified")
    intermediate_from: float = Field(70, ge=0, le=100)
    advanced_from: float = Field(85, ge=0, le=100)

    @model_validator(mode="after")
    def _valid(self) -> Self:
        if not self.min_percent <= self.intermediate_from <= self.advanced_from:
            raise ValueError("verified skill levels must not overlap")
        return self


class BudgetThresholds(_Group):
    token_limit: int = Field(1_000_000, ge=1)
    stt_seconds_limit: int = Field(1800, ge=1)
    tts_characters_limit: int = Field(30_000, ge=1)


class Thresholds(_Group):
    budget: BudgetThresholds = Field(default_factory=BudgetThresholds)
    stage1: Stage1Thresholds = Field(default_factory=Stage1Thresholds)
    report: ReportThresholds = Field(default_factory=ReportThresholds)
    verified: VerifiedSkillThresholds = Field(default_factory=VerifiedSkillThresholds)
    stage2: Stage2Thresholds = Field(default_factory=Stage2Thresholds)
    integrity: IntegrityThresholds = Field(default_factory=IntegrityThresholds)
    evaluation: EvaluationThresholds = Field(default_factory=EvaluationThresholds)
    telemetry: TelemetryThresholds = Field(default_factory=TelemetryThresholds)
    privacy: PrivacyThresholds = Field(default_factory=PrivacyThresholds)

    def with_overrides(self, overrides: dict[str, Any] | None) -> "Thresholds":
        """Return a new, re-validated Thresholds with a partial override dict merged in.

        Unknown keys raise a validation error, so a typo in an assessment config is caught.
        """
        if not overrides:
            return self
        return Thresholds.model_validate(_deep_merge(self.model_dump(), overrides))


def _deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged
