import { describe, expect, it } from 'vitest';
import {
  canEnterInterview,
  formatClock,
  inactivityCountdown,
  interviewLang,
  phaseOf,
  secondsLeft,
  serverClock,
  type InterviewState,
} from './model';

const base = {
  application_id: 'a',
  application_status: 'applied',
  vacancy_id: 'v',
  vacancy_title: 'T',
  language: 'ru',
  rules_version: '2026-11',
  rules_accepted: false,
  blocked_reason: null,
  warmup: null,
  session: null,
} as unknown as InterviewState;
const session = (status: string) =>
  ({ ...base, rules_accepted: true, session: { status } }) as unknown as InterviewState;

describe('phaseOf', () => {
  const local = { checked: false, warmupDone: false };
  it('follows rules → check → warmup → stage1', () => {
    expect(phaseOf(base, local)).toBe('rules');
    const ok = { ...base, rules_accepted: true };
    expect(phaseOf(ok, local)).toBe('check');
    const wu = { ...ok, warmup: { minutes: 2 } } as unknown as InterviewState;
    expect(phaseOf(wu, { checked: true, warmupDone: false })).toBe('warmup');
    expect(phaseOf(wu, { checked: true, warmupDone: true })).toBe('stage1');
    expect(phaseOf(ok, { checked: true, warmupDone: false })).toBe('stage1');
  });
  it('blocked and ended states win', () => {
    expect(phaseOf({ ...base, blocked_reason: 'assessment_not_ready' }, local)).toBe('blocked');
    for (const s of ['completed', 'expired', 'abandoned', 'disqualified']) {
      expect(phaseOf(session(s), local)).toBe('ended');
    }
    expect(phaseOf(session('in_progress'), local)).toBe('stage1');
  });
});

describe('server clock', () => {
  it('uses the server time, not the browser wall clock', () => {
    const at = serverClock('2026-11-02T10:00:00Z', 5_000); // monotonic 5 s when it arrived
    const now = at(65_000); // 60 s later
    expect(secondsLeft('2026-11-02T10:05:00Z', now)).toBe(240);
    expect(secondsLeft('2026-11-02T09:00:00Z', now)).toBe(0);
    expect(secondsLeft(null, now)).toBeNull();
    expect(formatClock(240)).toBe('04:00');
  });
});

describe('helpers', () => {
  it('interview language, not site language', () => {
    expect(interviewLang(base, 'uz')).toBe('ru');
    expect(interviewLang({ ...base, language: null }, 'en')).toBe('en');
  });
  it('entry statuses', () => {
    expect(canEnterInterview('applied')).toBe(true);
    expect(canEnterInterview('stage1_in_progress')).toBe(true);
    expect(canEnterInterview('rejected')).toBe(false);
  });
  it('inactivity countdown starts at warning_s', () => {
    expect(inactivityCountdown({ inactive_s: 59, warning_s: 60, limit_s: 90 })).toBeNull();
    expect(inactivityCountdown({ inactive_s: 70, warning_s: 60, limit_s: 90 })).toBe(20);
    expect(inactivityCountdown(null)).toBeNull();
  });
});

describe('Stage 2 entry from the cabinet', () => {
  it('stage2_pending / stage2_in_progress open the room with their own label', async () => {
    const { canViewInterviewResult, entryLabelKey } = await import('./model');
    expect(canEnterInterview('stage2_pending')).toBe(true);
    expect(canEnterInterview('stage2_in_progress')).toBe(true);
    expect(entryLabelKey('stage2_pending')).toBe('stage2Start');
    expect(entryLabelKey('stage2_in_progress')).toBe('stage2Open');
    expect(entryLabelKey('stage1_in_progress')).toBe('resume');
    expect(entryLabelKey('applied')).toBe('start');
    expect(canViewInterviewResult('stage2_pending')).toBe(false);
    expect(canViewInterviewResult('stage2_disqualified')).toBe(true);
  });
});
