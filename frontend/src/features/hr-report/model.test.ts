import { describe, expect, it } from 'vitest';
import {
  activeFlags,
  overrideBody,
  overrideFields,
  reportPhase,
  scoreOrRaw,
  summaryUnavailable,
  validateOverride,
} from './model';

describe('hr-report model', () => {
  it('null and pending state are "evaluating"; failed and done are their own', () => {
    expect(reportPhase({ state: null })).toBe('evaluating');
    expect(reportPhase({ state: 'pending' })).toBe('evaluating');
    expect(reportPhase({ state: 'done' })).toBe('ready');
    expect(reportPhase({ state: 'failed' })).toBe('failed');
  });

  it('an empty summary with needs_review on a finished report means "unavailable"', () => {
    expect(summaryUnavailable({ state: 'done', summary: '', needs_review: true })).toBe(true);
    expect(summaryUnavailable({ state: 'done', summary: ' ', needs_review: true })).toBe(true);
    expect(summaryUnavailable({ state: 'done', summary: 'Yaxshi', needs_review: true })).toBe(
      false,
    );
    expect(summaryUnavailable({ state: 'pending', summary: '', needs_review: true })).toBe(false);
  });

  it('disqualification can be overridden only on a disqualified application', () => {
    expect(overrideFields({ status: 'evaluated', disqualification_reason: null })).not.toContain(
      'disqualification',
    );
    expect(
      overrideFields({ status: 'stage1_disqualified', disqualification_reason: 'inactivity' }),
    ).toContain('disqualification');
  });

  it('validates the comment (3+ chars) and the value range', () => {
    expect(validateOverride({ field: 'overall_score', value: '70', comment: 'ok' })).toEqual({
      comment: 'short',
    });
    expect(
      validateOverride({ field: 'overall_score', value: '', comment: 'Intervyu bo‘ldi' }),
    ).toEqual({
      value: 'required',
    });
    expect(validateOverride({ field: 'stage1_score', value: '101', comment: 'Sabab bor' })).toEqual(
      {
        value: 'range',
      },
    );
    expect(validateOverride({ field: 'stage2_score', value: '-1', comment: 'Sabab bor' })).toEqual({
      value: 'range',
    });
    expect(validateOverride({ field: 'recommendation', value: '', comment: 'Sabab bor' })).toEqual({
      value: 'required',
    });
    expect(validateOverride({ field: 'overall_score', value: '0', comment: 'Sabab bor' })).toEqual(
      {},
    );
    // Lifting needs no value.
    expect(validateOverride({ field: 'disqualification', value: '', comment: 'Xato edi' })).toEqual(
      {},
    );
  });

  it('builds the request body: numbers, recommendation keys, null to lift', () => {
    expect(overrideBody({ field: 'overall_score', value: '72.5', comment: ' Sabab ' })).toEqual({
      field: 'overall_score',
      value: 72.5,
      comment: 'Sabab',
    });
    expect(overrideBody({ field: 'recommendation', value: 'maybe', comment: 'Sabab' }).value).toBe(
      'maybe',
    );
    expect(overrideBody({ field: 'disqualification', value: 'x', comment: 'Sabab' })).toEqual({
      field: 'disqualification',
      value: null,
      comment: 'Sabab',
    });
  });

  it('formats history values', () => {
    expect(scoreOrRaw('overall_score', '72')).toBe('72%');
    expect(scoreOrRaw('recommendation', 'yes')).toBe('yes');
    expect(scoreOrRaw('overall_score', null)).toBeNull();
  });

  it('lists only the flags that are set', () => {
    expect(activeFlags({ thinking_phrase: true, help_request: false, n: 2, z: 0 })).toEqual([
      'thinking_phrase',
      'n',
    ]);
  });
});
