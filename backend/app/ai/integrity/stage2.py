"""Stage 2 suspicion signals (spec §7.3), computed from turns and events only: no LLM, no I/O.
Rules are described in docs/INTEGRITY.md. Audio heuristics (background voices, keyboard sounds) wait
for a later phase, behind the speech abstraction."""

import re
import statistics
from dataclasses import dataclass, field
from typing import Any

from app.ai.integrity.stage1 import Event, Signal, TaskInput, _focus
from app.core.thresholds import IntegrityThresholds
from app.models.enums import EditorEventType as E
from app.models.enums import SignalSeverity as S

_FILLER = re.compile(
    r"\b(eee+|mmm+|hmm+|uh+|um+|er+|э+|ммм+|ну|xo['\u02bb\u02bc]?sh|anu)\b", re.IGNORECASE
)


@dataclass(frozen=True)
class TurnInput:
    order: int
    kind: str
    source: str | None
    transcript: str
    latency_ms: int | None
    speech_ms: int | None
    percent: float | None
    at_ms: int | None = None
    flags: dict[str, Any] = field(default_factory=dict)
    think_used: bool = False


def _words(t: TurnInput) -> int:
    return len(t.transcript.split())


def _silences(turns: list[TurnInput], cfg: IntegrityThresholds) -> list[Signal]:
    out: list[Signal] = []
    long_ones = 0
    for t in turns:
        if t.latency_ms is None or t.latency_ms <= cfg.long_silence_s * 1000:
            continue
        long_ones += 1
        thought = t.think_used or bool(t.flags.get("thinking_phrase"))
        fluent = _words(t) >= cfg.fluent_answer_min_words and not thought
        evidence = {"turn": t.order, "silence_s": round(t.latency_ms / 1000, 1), "words": _words(t)}
        kind = "long_silence_then_fluent" if fluent else "long_silence"
        out.append(Signal(kind, S.medium if fluent else S.info, t.at_ms, evidence))
    if long_ones >= cfg.long_silence_repeat_count:
        out.append(Signal("repeated_long_silences", S.medium, None, {"count": long_ones}))
    return out


def _own_code(
    turns: list[TurnInput], stage1_percent: float | None, cfg: IntegrityThresholds
) -> list[Signal]:
    scores = [t.percent for t in turns if t.kind == "own_code" and t.percent is not None]
    if stage1_percent is None or len(scores) < cfg.own_code_min_answers:
        return []
    mean = statistics.fmean(scores)
    if stage1_percent < cfg.own_code_stage1_high_percent or mean >= cfg.own_code_low_percent:
        return []
    evidence = {"own_code_percent": round(mean, 1), "stage1_percent": stage1_percent}
    return [Signal("cannot_explain_own_code", S.high, None, evidence)]


def _reading_style(turns: list[TurnInput], cfg: IntegrityThresholds) -> list[Signal]:
    """Few fillers and a steady pace across answers. Low weight on purpose: a heuristic."""
    spoken = [
        t
        for t in turns
        if t.source == "voice" and t.speech_ms and _words(t) >= cfg.reading_min_words
    ]
    if len(spoken) < cfg.reading_min_answers:
        return []
    paces = [_words(t) / (t.speech_ms or 1) for t in spoken]
    words = sum(_words(t) for t in spoken)
    fillers = sum(len(_FILLER.findall(t.transcript)) for t in spoken)
    cv = statistics.pstdev(paces) / statistics.fmean(paces)
    if fillers / words > cfg.reading_max_filler_ratio or cv > cfg.reading_max_pace_cv:
        return []
    return [Signal("reading_style", S.low, None, {"answers": len(spoken), "pace_cv": round(cv, 3)})]


def _flags(turns: list[TurnInput]) -> list[Signal]:
    out = []
    for t in turns:
        if t.flags.get("injection_attempt"):
            out.append(Signal("evaluator_injection_attempt", S.high, t.at_ms, {"turn": t.order}))
        if t.flags.get("help_request"):
            out.append(Signal("asked_for_answer", S.info, t.at_ms, {"turn": t.order}))
    return out


def _pastes(events: list[Event]) -> list[Signal]:
    pastes = [e for e in events if e.type is E.paste_external_blocked]
    if not pastes:
        return []
    return [Signal("text_paste_blocked", S.low, pastes[0].t_ms, {"count": len(pastes)})]


def detect(
    turns: list[TurnInput],
    events: list[Event],
    end_ms: int,
    stage1_percent: float | None,
    cfg: IntegrityThresholds,
) -> list[Signal]:
    focus = TaskInput("stage2", 0, end_ms, events, "", "", False)
    return [
        *_silences(turns, cfg),
        *_own_code(turns, stage1_percent, cfg),
        *_reading_style(turns, cfg),
        *_flags(turns),
        *_pastes(events),
        *_focus(focus, cfg),
    ]
