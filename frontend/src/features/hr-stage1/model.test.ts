import { describe, expect, it } from 'vitest';
import {
  disqualificationKey,
  evidenceValues,
  isKnownSignal,
  lineAnchor,
  mmss,
  percentText,
  suspicionLevel,
} from './model';

describe('hr stage 1 model', () => {
  it('a missing score is a dash, never 0%', () => {
    expect(percentText(null)).toBe('—');
    expect(percentText(undefined)).toBe('—');
    expect(percentText(0)).toBe('0%');
    expect(percentText(72.456)).toBe('72.5%');
  });
  it('reason time and line anchors', () => {
    expect(mmss(252_000)).toBe('04:12');
    expect(mmss(null)).toBeNull();
    expect(lineAnchor('t1', 12)).toBe('code-t1-L12');
  });
  it('evidence numbers are read defensively', () => {
    expect(
      evidenceValues({ count: 2, seconds: [31, 44], at_start: true, edit_ratio: 0.021 }),
    ).toMatchObject({
      count: 2,
      seconds: '31, 44',
      atStart: 1,
      editPercent: 2.1,
    });
    expect(evidenceValues({}).chars).toBe(0);
    expect(evidenceValues({ seconds: 'x' }).seconds).toBe('—');
  });
  it('known signals and labels', () => {
    expect(isKnownSignal('burst_after_idle')).toBe(true);
    expect(isKnownSignal('brand_new')).toBe(false);
    expect(suspicionLevel('high')).toBe('high');
    expect(suspicionLevel('x')).toBeNull();
    expect(disqualificationKey('weird')).toBe('other');
  });
});
