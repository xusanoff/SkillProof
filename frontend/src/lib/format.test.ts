import { describe, expect, it } from 'vitest';
import { fileSize, formatDate, relativeDay } from './format';

describe('format', () => {
  it('uz dates use dd.mm.yyyy (ICU uz data is incomplete)', () => {
    expect(formatDate('2026-10-30T09:21:00Z', 'uz', 'Asia/Tashkent', true)).toBe(
      '30.10.2026, 14:21',
    );
    expect(formatDate('2026-10-30T09:21:00Z', 'en', 'Asia/Tashkent')).toBe('10/30/2026');
  });

  it('file sizes switch from KB to MB', () => {
    expect(fileSize(600, 'uz')).toEqual({ value: '1', unit: 'kb' });
    expect(fileSize(300 * 1024, 'en')).toEqual({ value: '300', unit: 'kb' });
    expect(fileSize(1.5 * 1024 * 1024, 'uz')).toEqual({ value: '1,5', unit: 'mb' });
  });
});

describe('relativeDay', () => {
  const now = new Date('2026-10-30T10:00:00Z'); // 15:00 in Tashkent
  const tz = 'Asia/Tashkent';

  it('counts calendar days in the display time zone', () => {
    expect(relativeDay('2026-10-30T01:00:00Z', now, tz)).toEqual({ kind: 'today' });
    // 23:30 Tashkent the previous evening = yesterday, though < 24 h ago.
    expect(relativeDay('2026-10-29T18:30:00Z', now, tz)).toEqual({ kind: 'yesterday' });
    // Same instant is "today" in Tashkent but would be the 29th in UTC−5.
    expect(relativeDay('2026-10-29T19:30:00Z', now, tz)).toEqual({ kind: 'today' });
    expect(relativeDay('2026-10-25T09:00:00Z', now, tz)).toEqual({ kind: 'days', days: 5 });
  });

  it('old dates become a date; future (clock skew) counts as today', () => {
    expect(relativeDay('2026-09-01T09:00:00Z', now, tz)).toEqual({ kind: 'date' });
    expect(relativeDay('2026-10-30T11:00:00Z', now, tz)).toEqual({ kind: 'today' });
  });
});
