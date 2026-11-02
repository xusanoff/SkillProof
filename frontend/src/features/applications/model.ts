import type { ResponseOf } from '@/lib/api';

export type ApplicationPage = ResponseOf<'/api/v1/candidate/applications', 'get'>;
export type Application = ApplicationPage['items'][number];
export type ApplicationStatus = Application['status'];
export type HrApplicationPage = ResponseOf<'/api/v1/companies/{company_id}/applications', 'get'>;
export type HrApplication = HrApplicationPage['items'][number];
export type HrStatus = 'applied' | 'shortlisted' | 'rejected';

/** Candidate "Arizalarim" tabs (null = all). */
export const CANDIDATE_TABS = [null, 'applied', 'shortlisted', 'rejected', 'withdrawn'] as const;
export type CandidateTab = (typeof CANDIDATE_TABS)[number];

/** HR "Nomzodlar" tabs (hh "Отклики": new / shortlisted / rejected). */
export const HR_TABS = [
  'applied',
  'shortlisted',
  'rejected',
] as const satisfies readonly HrStatus[];

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

/** HR actions available for an application's current status. */
export function hrActions(status: ApplicationStatus): HrStatus[] {
  if (status === 'withdrawn') return [];
  if (status === 'shortlisted') return ['applied', 'rejected'];
  if (status === 'rejected') return ['applied', 'shortlisted'];
  return ['shortlisted', 'rejected'];
}
