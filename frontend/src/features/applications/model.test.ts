import { describe, expect, it } from 'vitest';
import {
  CANDIDATE_TABS,
  canViewResults,
  canWithdraw,
  hrActions,
  hrListHref,
  parseHrQuery,
  parseMinScore,
  parseTab,
} from './model';

describe('applications model', () => {
  it('withdraw only before the interview starts (D-055)', () => {
    expect(canWithdraw('applied')).toBe(true);
    expect(canWithdraw('shortlisted')).toBe(true);
    expect(canWithdraw('stage1_in_progress')).toBe(false);
    expect(canWithdraw('rejected')).toBe(false);
    expect(canWithdraw('withdrawn')).toBe(false);
  });

  it('HR actions by status; withdrawn is locked', () => {
    expect(hrActions('applied')).toEqual(['shortlisted', 'rejected']);
    expect(hrActions('shortlisted')).toEqual(['applied', 'hired', 'rejected']);
    expect(hrActions('evaluated')).toContain('hired');
    expect(hrActions('withdrawn')).toEqual([]);
    expect(hrActions('hired')).toEqual([]);
  });

  it('HR list filters come from the URL and unknown values fall back', () => {
    expect(parseHrQuery(new URLSearchParams(''))).toEqual({
      vacancyId: null,
      tab: 'ranked',
      status: null,
      minScore: null,
      page: 1,
    });
    const q = parseHrQuery(new URLSearchParams('tab=excluded&status=evaluated&min=65&page=3'));
    expect(q).toMatchObject({ tab: 'excluded', status: 'evaluated', minScore: 65, page: 3 });
    expect(parseHrQuery(new URLSearchParams('tab=evil&status=evil&min=abc')).tab).toBe('ranked');
    expect(hrListHref(q, { tab: 'ranked', page: 1 })).toBe(
      '/hr/candidates?tab=ranked&status=evaluated&min=65',
    );
  });

  it('min score is clamped to 0-100; empty means no minimum', () => {
    expect(parseMinScore('')).toBeNull();
    expect(parseMinScore('150')).toBe(100);
    expect(parseMinScore('-4')).toBe(0);
    expect(parseMinScore('0')).toBe(0);
  });

  it('the candidate may open results after a stage ended or the report exists', () => {
    for (const s of ['stage1_failed', 'stage2_disqualified', 'evaluated', 'hired'] as const) {
      expect(canViewResults(s)).toBe(true);
    }
    for (const s of ['applied', 'stage1_in_progress', 'stage2_in_progress', 'withdrawn'] as const) {
      expect(canViewResults(s)).toBe(false);
    }
  });

  it('unknown tab values fall back to "all"', () => {
    expect(parseTab('rejected', CANDIDATE_TABS)).toBe('rejected');
    expect(parseTab('evil', CANDIDATE_TABS)).toBeNull();
  });
});
