import type { BodyOf, ResponseOf } from '@/lib/api';

export type HrReport = ResponseOf<
  '/api/v1/companies/{company_id}/applications/{application_id}/report',
  'get'
>;
export type ReportPoint = HrReport['strengths'][number];
export type HrStage2 = NonNullable<HrReport['stage2']>;
export type HrTurn = HrStage2['turns'][number];
export type OverrideEntry = HrReport['overrides'][number];
export type TimelineSignal = HrReport['signals'][number];
export type Note = ResponseOf<
  '/api/v1/companies/{company_id}/applications/{application_id}/notes',
  'get'
>[number];
export type OverrideBody = BodyOf<
  '/api/v1/companies/{company_id}/applications/{application_id}/overrides',
  'post'
>;

/** What the page shows for the report as a whole. */
export type ReportPhase = 'evaluating' | 'failed' | 'ready';

/** `state` null (not written yet) and `pending` are the same to the reader: it is being evaluated. */
export function reportPhase(report: Pick<HrReport, 'state'>): ReportPhase {
  if (report.state === 'failed') return 'failed';
  return report.state === 'done' ? 'ready' : 'evaluating';
}

/** The writer gave no checked summary: scores are valid, a person has to read the answers. */
export function summaryUnavailable(report: Pick<HrReport, 'summary' | 'needs_review' | 'state'>) {
  return report.state === 'done' && report.summary.trim() === '' && report.needs_review;
}

/** Everything came from verified skills, so nothing was written: no summary, strengths or gaps. */
export function writtenByReuse(
  report: Pick<HrReport, 'summary' | 'strengths' | 'gaps' | 'reused_skills' | 'state'>,
) {
  return (
    report.state === 'done' &&
    report.reused_skills.length > 0 &&
    report.summary.trim() === '' &&
    report.strengths.length === 0 &&
    report.gaps.length === 0
  );
}

/** Signals that only Stage 2 produces (docs/INTEGRITY.md); shared types reuse the Stage 1 wording. */
export const STAGE2_SIGNALS = [
  'long_silence',
  'long_silence_then_fluent',
  'repeated_long_silences',
  'cannot_explain_own_code',
  'reading_style',
  'asked_for_answer',
  'text_paste_blocked',
  'voice_fallback',
] as const;
export type Stage2Signal = (typeof STAGE2_SIGNALS)[number];
export const isStage2Signal = (type: string): type is Stage2Signal =>
  (STAGE2_SIGNALS as readonly string[]).includes(type);

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** ICU values for the Stage 2 signal sentences. */
export function stage2EvidenceValues(evidence: Record<string, unknown>) {
  return {
    turn: num(evidence.turn),
    silenceS: num(evidence.silence_s),
    words: num(evidence.words),
    count: num(evidence.count),
    ownCodePercent: num(evidence.own_code_percent),
    stage1Percent: num(evidence.stage1_percent),
    answers: num(evidence.answers),
  };
}

export const KNOWN_FLAGS = [
  'thinking_phrase',
  'help_request',
  'injection_attempt',
  'stt_failed',
] as const;
export const isKnownFlag = (f: string): f is (typeof KNOWN_FLAGS)[number] =>
  (KNOWN_FLAGS as readonly string[]).includes(f);

/** Flags of a Stage 2 turn that are true; the UI words the ones it knows. */
export function activeFlags(flags: Record<string, unknown>): string[] {
  return Object.entries(flags)
    .filter(([, v]) => v === true || (typeof v === 'number' && v > 0))
    .map(([k]) => k);
}

export type OverrideField = OverrideBody['field'];
export const SCORE_FIELDS = ['stage1_score', 'stage2_score', 'overall_score'] as const;

export function isDisqualified(report: Pick<HrReport, 'status' | 'disqualification_reason'>) {
  return report.status.endsWith('_disqualified') || report.disqualification_reason != null;
}

/** `disqualification` is offered only on a disqualified application. */
export function overrideFields(report: Pick<HrReport, 'status' | 'disqualification_reason'>) {
  const fields: OverrideField[] = [...SCORE_FIELDS, 'recommendation'];
  if (isDisqualified(report)) fields.push('disqualification');
  return fields;
}

export const COMMENT_MIN = 3;
export const COMMENT_MAX = 2000;

export interface OverrideDraft {
  field: OverrideField;
  /** Raw input: a number as text, a recommendation key, or empty. */
  value: string;
  comment: string;
}

export type OverrideErrors = { value?: 'required' | 'range'; comment?: 'short' | 'long' };

/** Client-side check only; the server (`422 invalid_override`) has the last word. */
export function validateOverride(draft: OverrideDraft): OverrideErrors {
  const errors: OverrideErrors = {};
  const comment = draft.comment.trim();
  if (comment.length < COMMENT_MIN) errors.comment = 'short';
  else if (comment.length > COMMENT_MAX) errors.comment = 'long';
  if (draft.field === 'disqualification') return errors;
  if (draft.value.trim() === '') errors.value = 'required';
  else if (draft.field !== 'recommendation') {
    const n = Number(draft.value);
    if (!Number.isFinite(n) || n < 0 || n > 100) errors.value = 'range';
  }
  return errors;
}

/** Request body: `disqualification` lifts with `value: null`; scores are numbers. */
export function overrideBody(draft: OverrideDraft): OverrideBody {
  const comment = draft.comment.trim();
  if (draft.field === 'disqualification') return { field: draft.field, value: null, comment };
  if (draft.field === 'recommendation') return { field: draft.field, value: draft.value, comment };
  return { field: draft.field, value: Number(draft.value), comment };
}

/** "72" → "72%"; recommendation keys and `null` are left to the caller to word. */
export function scoreOrRaw(field: string, value: string | null): string | null {
  if (value === null) return null;
  if (field.endsWith('_score')) {
    const n = Number(value);
    return Number.isFinite(n) ? `${Math.round(n * 10) / 10}%` : value;
  }
  return value;
}

export const audioUrl = (companyId: string, applicationId: string, turnId: string) => {
  const base = (process.env.NEXT_PUBLIC_API_URL || '/api').replace(/\/$/, '');
  return `${base}/api/v1/companies/${encodeURIComponent(companyId)}/applications/${encodeURIComponent(applicationId)}/stage2/turns/${encodeURIComponent(turnId)}/answer-audio`;
};
