import type { ResponseOf } from '@/lib/api';

export type ApplicationPage = ResponseOf<'/api/v1/candidate/applications', 'get'>;
export type Application = ApplicationPage['items'][number];
export type ApplicationStatus = Application['status'];
export type HrApplicationPage = ResponseOf<'/api/v1/companies/{company_id}/applications', 'get'>;
export type HrApplication = HrApplicationPage['items'][number];
export type HrStatus = 'applied' | 'shortlisted' | 'rejected' | 'hired';

/** Candidate "Arizalarim" tabs (null = all). */
export const CANDIDATE_TABS = [null, 'applied', 'shortlisted', 'rejected', 'withdrawn'] as const;
export type CandidateTab = (typeof CANDIDATE_TABS)[number];

/** HR "Nomzodlar": the ranking and the failed / disqualified list (spec §8). */
export const HR_LIST_TABS = ['ranked', 'excluded'] as const;
export type HrListTab = (typeof HR_LIST_TABS)[number];

/** Stage status filter of the HR list (API `status`). */
export const HR_STATUS_FILTERS = [
  'applied',
  'stage1_in_progress',
  'stage1_failed',
  'stage1_disqualified',
  'stage2_pending',
  'stage2_in_progress',
  'stage2_disqualified',
  'evaluated',
  'shortlisted',
  'rejected',
  'hired',
] as const satisfies readonly ApplicationStatus[];
export type HrStatusFilter = (typeof HR_STATUS_FILTERS)[number];

export interface HrListQuery {
  vacancyId: string | null;
  tab: HrListTab;
  status: HrStatusFilter | null;
  /** 0–100, `null` = no minimum. */
  minScore: number | null;
  page: number;
}

/** Reads the list filters from the URL; anything unknown falls back to the default. */
export function parseHrQuery(params: URLSearchParams): HrListQuery {
  const tab = parseTab<HrListTab>(params.get('tab'), HR_LIST_TABS) ?? 'ranked';
  const status = parseTab<HrStatusFilter>(params.get('status'), HR_STATUS_FILTERS);
  return {
    vacancyId: params.get('vacancy') || null,
    tab,
    status,
    minScore: parseMinScore(params.get('min')),
    page: Math.max(1, Number(params.get('page')) || 1),
  };
}

/** Empty or invalid → `null`; otherwise clamped to 0–100. */
export function parseMinScore(raw: string | null | undefined): number | null {
  if (raw == null || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : null;
}

/** URL for the list with some filters changed (a changed filter resets the page). */
export function hrListHref(current: HrListQuery, next: Partial<HrListQuery>): string {
  const q = { ...current, ...next };
  const p = new URLSearchParams();
  if (q.vacancyId) p.set('vacancy', q.vacancyId);
  p.set('tab', q.tab);
  if (q.status) p.set('status', q.status);
  if (q.minScore !== null) p.set('min', String(q.minScore));
  if (q.page > 1) p.set('page', String(q.page));
  return `/hr/candidates?${p.toString()}`;
}

/** Scores and the "needs review" mark are shown only when the server has produced them. */
export function hasScores(a: HrApplication): boolean {
  return a.final_score != null || a.stage1_score != null || a.stage2_score != null;
}

/** Statuses for which the candidate may open "Mening natijalarim" (the page itself says "not ready"). */
const RESULT_STATUSES: readonly ApplicationStatus[] = [
  'stage1_failed',
  'stage1_disqualified',
  'stage2_disqualified',
  'evaluated',
  'shortlisted',
  'rejected',
  'hired',
];
export function canViewResults(status: ApplicationStatus): boolean {
  return RESULT_STATUSES.includes(status);
}

export function parseTab<T extends string>(
  value: string | null,
  allowed: readonly (T | null)[],
): T | null {
  return (allowed as readonly (string | null)[]).includes(value) ? (value as T) : null;
}

/**
 * Withdraw is possible only before the interview starts (DECISIONS D-055); elsewhere the API
 * answers `409 cannot_withdraw`, so the button is hidden. The server still decides.
 */
const WITHDRAWABLE: readonly ApplicationStatus[] = ['applied', 'interview_pending', 'shortlisted'];
export function canWithdraw(status: ApplicationStatus): boolean {
  return WITHDRAWABLE.includes(status);
}

/** HR actions available for an application's current status. The server still decides. */
export function hrActions(status: ApplicationStatus): HrStatus[] {
  if (status === 'withdrawn' || status === 'hired') return [];
  if (status === 'shortlisted') return ['applied', 'hired', 'rejected'];
  if (status === 'rejected') return ['applied', 'shortlisted'];
  if (status === 'evaluated') return ['shortlisted', 'hired', 'rejected'];
  return ['shortlisted', 'rejected'];
}
