import { describe, expect, it } from 'vitest';
import { buildOverrides, flattenThresholds, readPath } from './model';

const defaults = { stage1: { pass: 60, strict: true, langs: ['py'] }, note: 'x' };

describe('flattenThresholds', () => {
  it('keeps numbers and switches only', () => {
    expect(flattenThresholds(defaults)).toEqual([
      {
        group: 'stage1',
        fields: [
          { path: 'stage1.pass', key: 'pass', value: 60 },
          { path: 'stage1.strict', key: 'strict', value: true },
        ],
      },
    ]);
  });
});

describe('buildOverrides', () => {
  it('sends only what differs from the defaults', () => {
    expect(buildOverrides({ 'stage1.pass': 70, 'stage1.strict': true }, defaults)).toEqual({
      stage1: { pass: 70 },
    });
    expect(buildOverrides({ 'stage1.pass': 60 }, defaults)).toEqual({});
  });
});

describe('readPath', () => {
  it('reads a value and tolerates a missing group', () => {
    expect(readPath(defaults, 'stage1.pass')).toBe(60);
    expect(readPath(defaults, 'nope.pass')).toBeUndefined();
  });
});
