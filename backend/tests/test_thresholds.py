import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.core.thresholds import Thresholds


def test_spec_defaults() -> None:
    t = Thresholds()
    assert t.stage1.pass_threshold == 70
    assert (t.stage1.hidden_tests_weight, t.stage1.code_review_weight) == (70, 30)
    assert (t.integrity.paste_max_lines, t.integrity.paste_max_chars) == (2, 80)
    assert (t.integrity.inactivity_warning_s, t.integrity.inactivity_limit_s) == (60, 90)
    assert t.integrity.reconnect_window_s == 300
    assert t.integrity.long_silence_s == 8
    assert (t.integrity.suspicion_medium_from, t.integrity.suspicion_high_from) == (30, 70)
    assert t.privacy.retention_days == 180


def test_per_assessment_override_is_deep_merged() -> None:
    t = Thresholds().with_overrides({"stage1": {"pass_threshold": 80}})
    assert t.stage1.pass_threshold == 80
    assert t.stage1.hidden_tests_weight == 70
    assert Thresholds().stage1.pass_threshold == 70  # original untouched


def test_override_rejects_unknown_key() -> None:
    with pytest.raises(ValidationError):
        Thresholds().with_overrides({"integrity": {"paste_max_lnes": 5}})


def test_override_rejects_inconsistent_values() -> None:
    with pytest.raises(ValidationError):
        Thresholds().with_overrides({"integrity": {"inactivity_warning_s": 95}})
    with pytest.raises(ValidationError):
        Thresholds().with_overrides({"stage1": {"code_review_weight": 50}})


def test_global_default_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("THRESHOLDS__INTEGRITY__INACTIVITY_LIMIT_S", "120")
    assert Settings().thresholds.integrity.inactivity_limit_s == 120
