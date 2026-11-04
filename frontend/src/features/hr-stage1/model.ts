import type { ResponseOf } from '@/lib/api';

export type Stage1Report = ResponseOf<
  '/api/v1/companies/{company_id}/applications/{application_id}/stage1',
  'get'
>;
export type TaskReport = Stage1Report['tasks'][number];
export type Reason = Stage1Report['reasons'][number];
export type Signal = Stage1Report['signals'][number];

/** Signal types the UI has a sentence for (docs/INTEGRITY.md). Others fall back to the raw type. */
export const KNOWN_SIGNALS = [
  'idle_periods',
  'idle_with_focus_loss',
  'burst_after_idle',
  'superhuman_typing',
  'robotic_typing',
  'linear_writing',
  'no_run_cycle',
  'no_edits_after_first_run',
  'focus_loss',
  'evaluator_injection_attempt',
  'paste_external',
  'external_insertion',
  'unverified_internal_paste',
  'external_paste',
  'inactivity',
] as const;
export type KnownSignal = (typeof KNOWN_SIGNALS)[number];

export const isKnownSignal = (t: string): t is KnownSignal =>
  (KNOWN_SIGNALS as readonly string[]).includes(t);

const num = (v: unknown, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

/** ICU values for a signal sentence, from its `evidence` (missing numbers become 0). */
export function evidenceValues(evidence: Record<string, unknown>) {
  const seconds = Array.isArray(evidence.seconds) ? evidence.seconds.map((x) => num(x)) : [];
  return {
    count: num(evidence.count),
    seconds: seconds.length ? seconds.join(', ') : '—',
    atStart: evidence.at_start === true ? 1 : 0,
    chars: num(evidence.chars),
    lines: num(evidence.lines),
    windowS: num(evidence.window_s),
    charsPerS: num(evidence.chars_per_s),
    cv: num(evidence.interval_cv),
    samples: num(evidence.samples),
    editPercent: Math.round(num(evidence.edit_ratio) * 1000) / 10,
    backJumps: num(evidence.back_jumps),
    runs: num(evidence.runs),
    totalS: num(evidence.total_s),
    exits: num(evidence.fullscreen_exits),
  };
}

export const SUSPICION_LEVELS = ['low', 'medium', 'high'] as const;
export type SuspicionLevelName = (typeof SUSPICION_LEVELS)[number];

export function suspicionLevel(label: string | null | undefined): SuspicionLevelName | null {
  return (SUSPICION_LEVELS as readonly string[]).includes(label ?? '')
    ? (label as SuspicionLevelName)
    : null;
}

/** Percent for display: `null` (no score) is "—", never 0%. */
export function percentText(v: number | null | undefined): string {
  return v == null ? '—' : `${Math.round(v * 10) / 10}%`;
}

export function mmss(ms: number | null | undefined): string | null {
  if (ms == null) return null;
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Link target of a review "lines" reference inside the final code view. */
export const lineAnchor = (taskId: string, line: number) => `code-${taskId}-L${line}`;

/** Disqualified: the reason the server gave; anything unknown is shown as "other". */
export function disqualificationKey(
  reason: string | null,
): 'external_paste' | 'inactivity' | 'abandoned' | 'other' {
  return reason === 'external_paste' || reason === 'inactivity' || reason === 'abandoned'
    ? reason
    : 'other';
}

export const RECOMMENDATIONS = ['strong_yes', 'yes', 'maybe', 'no'] as const;
export type RecommendationName = (typeof RECOMMENDATIONS)[number];

/** The server's recommendation if it is one the UI knows; otherwise `null` (hidden). */
export function recommendationKey(value: string | null | undefined): RecommendationName | null {
  return (RECOMMENDATIONS as readonly string[]).includes(value ?? '')
    ? (value as RecommendationName)
    : null;
}
