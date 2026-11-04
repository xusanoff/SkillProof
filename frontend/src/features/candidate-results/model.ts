import type { ResponseOf } from '@/lib/api';

export type CandidateResults = ResponseOf<'/api/v1/applications/{application_id}/results', 'get'>;

export const resultsKeys = {
  one: (applicationId: string) => ['candidate-results', applicationId] as const,
};

/** Only these reasons are worded; anything else gets the generic neutral sentence. */
export function reasonKey(
  reason: string | null | undefined,
): 'external_paste' | 'inactivity' | 'abandoned' | 'other' | null {
  if (!reason) return null;
  return reason === 'external_paste' || reason === 'inactivity' || reason === 'abandoned'
    ? reason
    : 'other';
}

export function isDisqualifiedResult(
  r: Pick<CandidateResults, 'status' | 'disqualification_reason'>,
) {
  return r.status.endsWith('_disqualified') || !!r.disqualification_reason;
}

/** A finished result without any written feedback: say so instead of showing empty lists. */
export function feedbackMissing(r: Pick<CandidateResults, 'state' | 'mistakes' | 'learn_next'>) {
  return r.state === 'done' && r.mistakes.length === 0 && r.learn_next.length === 0;
}

/** Percent for display; a missing score is a dash, never 0. */
export function percentText(v: number | null | undefined): string {
  return v == null ? '—' : `${Math.round(v * 10) / 10}%`;
}

/** A finished result with no tasks, answers or feedback because verified skills covered it. */
export function fromVerifiedSkills(
  r: Pick<CandidateResults, 'state' | 'tasks' | 'answers' | 'per_skill'>,
) {
  return (
    r.state === 'done' &&
    r.tasks.length === 0 &&
    r.answers.length === 0 &&
    r.per_skill.some((s) => s.reused)
  );
}
