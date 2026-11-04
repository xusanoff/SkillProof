import { describe, expect, it } from 'vitest';
import { feedbackMissing, isDisqualifiedResult, percentText, reasonKey } from './model';

describe('candidate-results model', () => {
  it('words only the known disqualification reasons', () => {
    expect(reasonKey('external_paste')).toBe('external_paste');
    expect(reasonKey('inactivity')).toBe('inactivity');
    expect(reasonKey('abandoned')).toBe('abandoned');
    expect(reasonKey('something_else')).toBe('other');
    expect(reasonKey(null)).toBeNull();
  });

  it('a missing score is a dash, never 0', () => {
    expect(percentText(null)).toBe('—');
    expect(percentText(undefined)).toBe('—');
    expect(percentText(0)).toBe('0%');
    expect(percentText(66.66)).toBe('66.7%');
  });

  it('empty feedback is reported only for a finished result', () => {
    expect(feedbackMissing({ state: 'done', mistakes: [], learn_next: [] })).toBe(true);
    expect(feedbackMissing({ state: 'pending', mistakes: [], learn_next: [] })).toBe(false);
    expect(
      feedbackMissing({ state: 'done', mistakes: [{ text: 'x', about: 'y' }], learn_next: [] }),
    ).toBe(false);
  });

  it('a disqualified status or reason counts', () => {
    expect(
      isDisqualifiedResult({ status: 'stage2_disqualified', disqualification_reason: null }),
    ).toBe(true);
    expect(
      isDisqualifiedResult({ status: 'evaluated', disqualification_reason: 'inactivity' }),
    ).toBe(true);
    expect(isDisqualifiedResult({ status: 'evaluated', disqualification_reason: null })).toBe(
      false,
    );
  });
});
