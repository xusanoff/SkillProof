"""Stage 1 suspicion signals (spec §7.2), computed from editor events only: no LLM, no I/O.
Rules and weights are described in docs/INTEGRITY.md."""

import statistics
from dataclasses import dataclass, field
from itertools import pairwise
from typing import Any

from app.core.thresholds import IntegrityThresholds
from app.models.enums import EditorEventType as E
from app.models.enums import SignalSeverity as S

_EDITS = {E.insert, E.delete, E.replace}
_AWAY_START = {E.focus_lost, E.visibility_hidden}
_AWAY_END = {E.focus_gained, E.visibility_visible}


@dataclass(frozen=True)
class Event:
    t_ms: int
    type: E
    payload: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class TaskInput:
    task_id: str
    start_ms: int
    end_ms: int
    events: list[Event]
    final_code: str
    starter_code: str
    all_hidden_passed: bool


@dataclass(frozen=True)
class Signal:
    type: str
    severity: S
    at_ms: int | None
    evidence: dict[str, Any]


def _text(e: Event) -> str:
    return str(e.payload.get("text", ""))


def _s(ms: int) -> float:
    return round(ms / 1000, 1)


def _away_periods(t: TaskInput) -> list[tuple[int, int]]:
    periods: list[tuple[int, int]] = []
    since: int | None = None
    for e in t.events:
        if e.type in _AWAY_START and since is None:
            since = e.t_ms
        elif e.type in _AWAY_END and since is not None:
            periods.append((since, e.t_ms))
            since = None
    if since is not None:
        periods.append((since, t.end_ms))
    return periods


def _idle_gaps(t: TaskInput, cfg: IntegrityThresholds) -> list[tuple[int, int]]:
    """Silences without editing or running that are long enough to notice. The limit itself ends
    the stage (§7.1b), so a surviving gap is always below it."""
    gaps = []
    previous = t.start_ms
    for e in t.events:
        if e.type in _EDITS or e.type is E.run:
            if e.t_ms - previous >= cfg.idle_signal_min_s * 1000:
                gaps.append((previous, e.t_ms))
            previous = e.t_ms
    return gaps


def _idle_signals(t: TaskInput, cfg: IntegrityThresholds) -> list[Signal]:
    gaps = _idle_gaps(t, cfg)
    away = _away_periods(t)
    out: list[Signal] = []
    with_focus = [g for g in gaps if any(a[0] < g[1] and g[0] < a[1] for a in away)]
    plain = [g for g in gaps if g not in with_focus]
    at_start = bool(plain) and plain[0][0] == t.start_ms
    if plain:
        if len(plain) >= cfg.idle_repeat_count:
            severity = S.medium
        elif at_start or len(plain) > 1:
            severity = S.low
        else:
            severity = S.info
        out.append(
            Signal(
                "idle_periods",
                severity,
                plain[0][0],
                {
                    "task_id": t.task_id,
                    "count": len(plain),
                    "at_start": at_start,
                    "seconds": [_s(b - a) for a, b in plain],
                },
            )
        )
    if with_focus:
        out.append(
            Signal(
                "idle_with_focus_loss",
                S.high if len(with_focus) > 1 else S.medium,
                with_focus[0][0],
                {
                    "task_id": t.task_id,
                    "count": len(with_focus),
                    "seconds": [_s(b - a) for a, b in with_focus],
                },
            )
        )
    return out


def _burst_after_idle(t: TaskInput, cfg: IntegrityThresholds) -> list[Signal]:
    for _, end in _idle_gaps(t, cfg):
        chars = sum(
            len(_text(e))
            for e in t.events
            if e.type in (E.insert, E.replace) and end <= e.t_ms <= end + cfg.burst_window_s * 1000
        )
        if chars >= cfg.burst_after_idle_chars:
            return [
                Signal(
                    "burst_after_idle",
                    S.high,
                    end,
                    {"task_id": t.task_id, "chars": chars, "window_s": cfg.burst_window_s},
                )
            ]
    return []


def _keystrokes(t: TaskInput) -> list[Event]:
    return [
        e
        for e in t.events
        if e.type is E.insert and e.payload.get("source") == "keyboard" and _text(e)
    ]


def _typing_signals(t: TaskInput, cfg: IntegrityThresholds) -> list[Signal]:
    keys = _keystrokes(t)
    out: list[Signal] = []
    window = cfg.typing_window_s * 1000
    best, best_at, left, chars = 0.0, 0, 0, 0
    for right, e in enumerate(keys):
        chars += len(_text(e))
        while e.t_ms - keys[left].t_ms > window:
            chars -= len(_text(keys[left]))
            left += 1
        if chars < cfg.typing_min_chars:
            continue
        # Over the full window, so one large "keyboard" insert cannot divide by almost nothing
        # and honest short flurries are not stretched into a high rate.
        rate = chars / cfg.typing_window_s
        if rate > best:
            best, best_at = rate, keys[right].t_ms
    if best > cfg.max_typing_chars_per_s:
        out.append(
            Signal(
                "superhuman_typing",
                S.high,
                best_at,
                {"task_id": t.task_id, "chars_per_s": round(best, 1)},
            )
        )
    gaps = [
        b.t_ms - a.t_ms
        for a, b in pairwise(keys)
        if 0 < b.t_ms - a.t_ms <= cfg.keystroke_max_gap_s * 1000
    ]
    if len(gaps) >= cfg.keystroke_min_samples:
        cv = statistics.pstdev(gaps) / statistics.fmean(gaps)
        if cv < cfg.min_keystroke_interval_cv:
            out.append(
                Signal(
                    "robotic_typing",
                    S.high,
                    keys[0].t_ms,
                    {"task_id": t.task_id, "interval_cv": round(cv, 3), "samples": len(gaps)},
                )
            )
    return out


def _linear_writing(t: TaskInput, cfg: IntegrityThresholds) -> list[Signal]:
    added = sum(len(_text(e)) for e in t.events if e.type in (E.insert, E.replace))
    if added < cfg.linear_min_chars:
        return []
    removed = sum(
        int(e.payload.get("length") or 0)
        for e in t.events
        if e.type is E.delete and isinstance(e.payload.get("length"), int)
    ) + sum(len(_text(e)) for e in t.events if e.type is E.replace)
    jumps, line = 0, 0
    for e in t.events:
        if e.type is E.cursor and isinstance(e.payload.get("line"), int):
            if e.payload["line"] < line:
                jumps += 1
            line = e.payload["line"]
    ratio = removed / added
    if ratio > cfg.linear_max_edit_ratio or jumps > cfg.linear_max_back_jumps:
        return []
    return [
        Signal(
            "linear_writing",
            S.medium,
            t.start_ms,
            {
                "task_id": t.task_id,
                "chars": added,
                "edit_ratio": round(ratio, 3),
                "back_jumps": jumps,
            },
        )
    ]


def _no_run_cycle(t: TaskInput, cfg: IntegrityThresholds) -> list[Signal]:
    written = len(t.final_code) - len(t.starter_code)
    if not t.all_hidden_passed or written < cfg.no_run_min_chars:
        return []
    runs = [e.t_ms for e in t.events if e.type is E.run]
    if not runs:
        return [Signal("no_run_cycle", S.medium, None, {"task_id": t.task_id, "runs": 0})]
    if not any(e.type in _EDITS and e.t_ms > runs[0] for e in t.events):
        return [
            Signal(
                "no_edits_after_first_run",
                S.low,
                runs[0],
                {"task_id": t.task_id, "runs": len(runs)},
            )
        ]
    return []


def _focus(t: TaskInput, cfg: IntegrityThresholds) -> list[Signal]:
    away = _away_periods(t)
    exits = [e.t_ms for e in t.events if e.type is E.fullscreen_exit]
    if not away and not exits:
        return []
    total = sum(b - a for a, b in away)
    if total >= cfg.focus_long_total_s * 1000 or len(away) >= cfg.focus_many_count:
        severity = S.medium
    elif total > cfg.focus_brief_s * 1000 or len(away) > 1 or exits:
        severity = S.low
    else:
        severity = S.info
    return [
        Signal(
            "focus_loss",
            severity,
            away[0][0] if away else exits[0],
            {
                "task_id": t.task_id,
                "count": len(away),
                "total_s": _s(total),
                "fullscreen_exits": len(exits),
            },
        )
    ]


def detect(t: TaskInput, cfg: IntegrityThresholds) -> list[Signal]:
    return [
        *_idle_signals(t, cfg),
        *_burst_after_idle(t, cfg),
        *_typing_signals(t, cfg),
        *_linear_writing(t, cfg),
        *_no_run_cycle(t, cfg),
        *_focus(t, cfg),
    ]


def suspicion(signals: list[tuple[str, S]], cfg: IntegrityThresholds) -> tuple[int, str]:
    """Each signal independently closes part of the remaining distance to 100 (§7.4). A paste over
    the limit is 100; running out of time to act (`inactivity`) is not evidence of outside help
    by itself, so it counts as a medium signal."""
    weights = {
        S.info: cfg.weight_info,
        S.low: cfg.weight_low,
        S.medium: cfg.weight_medium,
        S.high: cfg.weight_high,
        S.disqualifying: 100.0,
    }
    clean = 1.0
    for kind, severity in signals:
        weight = cfg.weight_medium if kind == "inactivity" else weights[severity]
        clean *= 1 - weight / 100
    percent = round(100 * (1 - clean))
    if percent >= cfg.suspicion_high_from:
        return percent, "high"
    if percent >= cfg.suspicion_medium_from:
        return percent, "medium"
    return percent, "low"
