# Integrity signals (Stage 1)

Signals inform HR. Only two rules end a stage automatically: external paste (§7.1) and inactivity (§7.1b). Suspicion never changes the skill score (§7.4).

Detectors live in `backend/app/ai/integrity/stage1.py`. They read `editor_events`, use no LLM, and run once after the stage ends. Every number below is in `IntegrityThresholds` (`backend/app/core/thresholds.py`), with a global default and a per-assessment override; a session uses the values captured when it started.

## Stage 1 signals
| Signal | Fires when | Severity |
|---|---|---|
| `idle_periods` | no edit or run for `idle_signal_min_s` (30 s) | one pause mid-task: `info`; at task start or 2 pauses: `low`; `idle_repeat_count` (3) or more: `medium` |
| `idle_with_focus_loss` | such a pause overlaps time away from the tab | once: `medium`; repeated: `high` |
| `burst_after_idle` | `burst_after_idle_chars` (200) arrive within `burst_window_s` (20 s) after a pause | `high` |
| `superhuman_typing` | over `max_typing_chars_per_s` (15) across `typing_window_s` (5 s), at least `typing_min_chars` (40) | `high` |
| `robotic_typing` | intervals between keys vary less than `min_keystroke_interval_cv` (0.15), from `keystroke_min_samples` (50) | `high` |
| `linear_writing` | `linear_min_chars` (300) written with edits at most `linear_max_edit_ratio` (3%) and at most `linear_max_back_jumps` (2) moves back | `medium` |
| `no_run_cycle` | all hidden tests pass, `no_run_min_chars` (200) written, never ran | `medium` |
| `no_edits_after_first_run` | as above, ran, but changed nothing after the first run | `low` |
| `focus_loss` | tab hidden, window blur or fullscreen exit | one under `focus_brief_s` (5 s): `info`; otherwise `low`; total over `focus_long_total_s` (60 s) or `focus_many_count` (5) times: `medium` |
| `evaluator_injection_attempt` | code holds instructions for the evaluator (regex in uz/ru/en, or the model reports it) | `high` |
| `paste_external`, `external_insertion`, `unverified_internal_paste` | under the paste limit (written live, Phase 4) | `low` |
| `external_paste`, `inactivity` | the two automatic rules | `disqualifying` |

**Not implemented:** style mismatch against the warm-up (§7.2, low weight). The warm-up is deliberately not recorded (D-086).

## Evidence
Every signal's `evidence` carries `task_id` (except live paste signals) and `at_ms` (ms from session start, or null).

| Signal | Other keys |
|---|---|
| `idle_periods` | `count`, `at_start`, `seconds[]` |
| `idle_with_focus_loss` | `count`, `seconds[]` |
| `burst_after_idle` | `chars`, `window_s` |
| `superhuman_typing` | `chars_per_s` |
| `robotic_typing` | `interval_cv`, `samples` |
| `linear_writing` | `chars`, `edit_ratio`, `back_jumps` |
| `no_run_cycle`, `no_edits_after_first_run` | `runs` |
| `focus_loss` | `count`, `total_s`, `fullscreen_exits` |
| `evaluator_injection_attempt` | `lines[]`; empty when only the model reported it |
| `paste_external`, `external_insertion`, `unverified_internal_paste`, `external_paste` | `lines`, `chars`, `kind` |
| `inactivity` | `idle_s` |

## Suspicion %
`100 × (1 − ∏(1 − weight/100))`, one factor per signal, so each signal closes part of the remaining distance to 100.

| Severity | Weight |
|---|---|
| `info` | 0 |
| `low` | 8 (`weight_low`) |
| `medium` | 20 (`weight_medium`) |
| `high` | 45 (`weight_high`) |
| `disqualifying` | 100 |

`inactivity` counts as `medium`: going quiet ends the stage, but does not show outside help. Labels: `low` under 30, `medium` 30–69, `high` from 70 (`suspicion_medium_from`, `suspicion_high_from`).

**What these numbers are not:** the weights and detector limits are starting values chosen by reasoning, not calibrated on real candidates. The percentage is a ranking aid for a human, not a measured probability. Recheck them once there is real data.

## Known limits
- A client that fakes its whole event stream can avoid the typing signals. Hidden tests, the code review and Stage 2 questions about the candidate's own code are the backstop.
- `editor_reset` replaces the editor's content and is not checked against the rules, so a modified client could bring in outside code through it. A normal browser only sends it on a language switch or a restored draft.
- Fast honest typists and people who plan on paper can trigger `linear_writing` or `burst_after_idle`. That is why these inform HR and decide nothing.
