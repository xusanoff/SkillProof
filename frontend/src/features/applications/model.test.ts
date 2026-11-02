import { describe, expect, it } from 'vitest';
import { canWithdraw, hrActions, parseTab, CANDIDATE_TABS } from './model';

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
    expect(hrActions('shortlisted')).toEqual(['applied', 'rejected']);
    expect(hrActions('withdrawn')).toEqual([]);
  });

  it('unknown tab values fall back to "all"', () => {
    expect(parseTab('rejected', CANDIDATE_TABS)).toBe('rejected');
    expect(parseTab('evil', CANDIDATE_TABS)).toBeNull();
  });
});
