"""Simulated behaviours against the Stage 1 detectors (spec §10, Phase 5 "done when")."""

import random

from app.ai.integrity.stage1 import Event, Signal, TaskInput, detect, suspicion
from app.core.thresholds import IntegrityThresholds
from app.models.enums import EditorEventType as E
from app.models.enums import SignalSeverity as S

CFG = IntegrityThresholds()
SECOND = 1000


def _key(t: int, text: str = "a") -> Event:
    return Event(t, E.insert, {"text": text, "source": "keyboard"})


def _human(start: int, chars: int, seed: int = 1) -> list[Event]:
    """About 5 chars/s with natural rhythm, corrections and moves back."""
    rng = random.Random(seed)
    out: list[Event] = []
    t = start
    for i in range(chars):
        t += int(rng.lognormvariate(5.2, 0.5))
        out.append(_key(t, "\n" if i % 40 == 39 else "a"))
        if i % 15 == 14:
            t += 120
            out.append(Event(t, E.delete, {"length": 2, "source": "keyboard"}))
            out.append(Event(t + 1, E.cursor, {"line": 1, "column": 1}))
            out.append(Event(t + 2, E.cursor, {"line": 4, "column": 1}))
    return out


def _task(events: list[Event], **over: object) -> TaskInput:
    values: dict[str, object] = {
        "task_id": "t",
        "start_ms": 0,
        "end_ms": max((e.t_ms for e in events), default=0),
        "events": events,
        "final_code": "x" * 500,
        "starter_code": "",
        "all_hidden_passed": False,
    }
    return TaskInput(**{**values, **over})  # type: ignore[arg-type]


def _signal(found: list[Signal], kind: str) -> Signal | None:
    return next((s for s in found if s.type == kind), None)


def _kinds(found: list[Signal]) -> set[str]:
    return {s.type for s in found if s.severity is not S.info}


def test_an_honest_session_raises_nothing() -> None:
    events = _human(2 * SECOND, 400)
    run_at = events[-1].t_ms + 500
    events += [Event(run_at, E.run), *_human(run_at, 30, seed=2)]
    found = detect(_task(events, all_hidden_passed=True), CFG)
    assert _kinds(found) == set()
    assert suspicion([(s.type, s.severity) for s in found], CFG) == (0, "low")


def test_one_pause_to_think_is_only_info() -> None:
    first = _human(SECOND, 20)
    events = first + _human(first[-1].t_ms + 40 * SECOND, 20)
    idle = _signal(detect(_task(events), CFG), "idle_periods")
    assert idle is not None and idle.severity is S.info


def test_idle_at_task_start() -> None:
    found = detect(_task(_human(45 * SECOND, 30)), CFG)
    idle = _signal(found, "idle_periods")
    assert idle is not None and idle.severity is S.low and idle.evidence["at_start"] is True
    assert idle.at_ms == 0


def test_repeated_idle_is_stronger() -> None:
    events: list[Event] = []
    t = 0
    for seed in range(4):
        part = _human(t + 40 * SECOND, 10, seed)
        events += part
        t = part[-1].t_ms
    idle = _signal(detect(_task(events), CFG), "idle_periods")
    assert idle is not None and idle.severity is S.medium and idle.evidence["count"] == 4


def test_idle_with_focus_loss_is_stronger_than_idle_alone() -> None:
    events = [
        Event(1 * SECOND, E.focus_lost),
        Event(40 * SECOND, E.focus_gained),
        *_human(41 * SECOND, 20),
    ]
    found = detect(_task(events), CFG)
    combined = _signal(found, "idle_with_focus_loss")
    assert combined is not None and combined.severity is S.medium
    assert _signal(found, "idle_periods") is None
    last = events[-1].t_ms
    twice = [
        *events,
        Event(last + 1 * SECOND, E.visibility_hidden),
        Event(last + 40 * SECOND, E.visibility_visible),
        *_human(last + 41 * SECOND, 20, seed=2),
    ]
    again = _signal(detect(_task(twice), CFG), "idle_with_focus_loss")
    assert again is not None and again.severity is S.high


def test_burst_after_idle() -> None:
    code = "def solve(items):\n    return sorted(items)\n" * 6
    events = [Event(50 * SECOND, E.insert, {"text": code, "source": "keyboard"})]
    burst = _signal(detect(_task(events), CFG), "burst_after_idle")
    assert burst is not None and burst.severity is S.high and burst.at_ms == 50 * SECOND


def test_superhuman_typing() -> None:
    events = [_key(1000 + i * 30) for i in range(300)]  # 33 chars/s
    typed = _signal(detect(_task(events), CFG), "superhuman_typing")
    assert typed is not None and typed.severity is S.high and typed.evidence["chars_per_s"] > 15


def test_fast_human_burst_is_not_superhuman() -> None:
    events = [_key(1000 + i * 90) for i in range(12)]  # a quick word, under the sample minimum
    assert _signal(detect(_task(events), CFG), "superhuman_typing") is None


def test_robotic_typing_at_a_believable_speed() -> None:
    rng = random.Random(3)
    t, events = 1000, []
    for _ in range(200):
        t += int(rng.uniform(149, 151))  # 6.6 chars/s: fine, but metronome-even
        events.append(_key(t))
    found = detect(_task(events), CFG)
    robotic = _signal(found, "robotic_typing")
    assert robotic is not None and robotic.severity is S.high
    assert _signal(found, "superhuman_typing") is None


def test_linear_writing() -> None:
    rng = random.Random(4)
    t, events = 1000, []
    for _ in range(400):
        t += int(rng.lognormvariate(5.2, 0.5))
        events.append(_key(t))
    linear = _signal(detect(_task(events), CFG), "linear_writing")
    assert linear is not None and linear.severity is S.medium
    assert linear.evidence["edit_ratio"] == 0


def test_no_run_cycle_only_for_a_correct_substantial_solution() -> None:
    events = _human(SECOND, 300)
    found = detect(_task(events, all_hidden_passed=True), CFG)
    assert _signal(found, "no_run_cycle") is not None
    assert _signal(detect(_task(events, all_hidden_passed=False), CFG), "no_run_cycle") is None
    assert (
        _signal(detect(_task(events, all_hidden_passed=True, final_code="x"), CFG), "no_run_cycle")
        is None
    )
    once = [*events, Event(events[-1].t_ms + 100, E.run)]
    found = detect(_task(once, all_hidden_passed=True), CFG)
    assert _signal(found, "no_edits_after_first_run") is not None
    assert _signal(found, "no_run_cycle") is None


def test_focus_loss_counts_and_duration() -> None:
    brief = [Event(1000, E.focus_lost), Event(2000, E.focus_gained)]
    one = _signal(detect(_task(brief), CFG), "focus_loss")
    assert one is not None and one.severity is S.info
    long = [Event(1000, E.visibility_hidden), Event(70 * SECOND, E.visibility_visible)]
    signal = _signal(detect(_task(long), CFG), "focus_loss")
    assert signal is not None and signal.severity is S.medium and signal.evidence["total_s"] == 69
    # Still away when the task ended: counts up to the end.
    open_ended = [Event(1000, E.focus_lost)]
    still = _signal(detect(_task(open_ended, end_ms=31 * SECOND), CFG), "focus_loss")
    assert still is not None and still.evidence["total_s"] == 30
    exit_ = _signal(detect(_task([Event(1000, E.fullscreen_exit)]), CFG), "focus_loss")
    assert exit_ is not None and exit_.severity is S.low and exit_.evidence["fullscreen_exits"] == 1


def test_suspicion_levels() -> None:
    assert suspicion([], CFG) == (0, "low")
    assert suspicion([("x", S.info)], CFG) == (0, "low")
    assert suspicion([("x", S.low)], CFG) == (8, "low")
    assert suspicion([("x", S.high)], CFG) == (45, "medium")
    assert suspicion([("x", S.high), ("y", S.high), ("z", S.medium)], CFG) == (76, "high")
    assert suspicion([("external_paste", S.disqualifying)], CFG) == (100, "high")
    # Going quiet ends the stage, but is not by itself evidence of outside help.
    assert suspicion([("inactivity", S.disqualifying)], CFG) == (20, "low")


def test_suspicion_thresholds_are_configurable() -> None:
    cfg = IntegrityThresholds(suspicion_medium_from=5, suspicion_high_from=8)
    assert suspicion([("x", S.low)], cfg) == (8, "high")
