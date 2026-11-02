import { describe, expect, it } from 'vitest';
import {
  applyChange,
  applyEvents,
  buildMarkers,
  countMarkers,
  ReplayCursor,
  stateAt,
  type ReplayEvent,
} from './model';

const r = (sl: number, sc: number, el: number, ec: number) => ({
  startLineNumber: sl,
  startColumn: sc,
  endLineNumber: el,
  endColumn: ec,
});
let seq = 0;
const ev = (t_ms: number, type: string, payload: Record<string, unknown> = {}): ReplayEvent =>
  ({ seq: ++seq, t_ms, type, payload }) as ReplayEvent;
const ins = (t: number, line: number, col: number, text: string) =>
  ev(t, 'insert', { range: r(line, col, line, col), text, source: 'keyboard' });

describe('applyEvents', () => {
  it('insert, delete and replace on a single line', () => {
    const events = [
      ins(10, 1, 1, 'print(1)'),
      ev(20, 'replace', { range: r(1, 7, 1, 8), text: '42', source: 'keyboard' }),
      ev(30, 'delete', { range: r(1, 1, 1, 7), length: 6, source: 'keyboard' }),
    ];
    expect(applyEvents('', events, 10)).toBe('print(1)');
    expect(applyEvents('', events, 20)).toBe('print(42)');
    expect(applyEvents('', events, 30)).toBe('42)');
  });

  it('multi-line edits and ranges that span lines', () => {
    const events = [
      ins(1, 1, 1, 'a\nb\nc'),
      ev(2, 'delete', { range: r(1, 2, 3, 1), length: 4, source: 'keyboard' }),
      ins(3, 2, 1, '\n'),
    ];
    expect(applyEvents('', events, 2)).toBe('ac');
    expect(applyEvents('', events, 3)).toBe('ac\n');
  });

  it('several changes of one Monaco event (descending order) apply one after another', () => {
    // Two cursors on lines 1 and 2 type "x": Monaco reports line 2 first, then line 1.
    const events = [ins(5, 2, 4, 'x'), ins(5, 1, 4, 'x')];
    expect(applyEvents('abc\ndef', events, 5)).toBe('abcx\ndefx');
  });

  it('editor_reset replaces the whole content (language switch, restored draft)', () => {
    const events = [
      ins(1, 1, 1, 'python code'),
      ev(2, 'editor_reset', { language: 'javascript', code: 'let a = 1;' }),
      ins(3, 1, 11, '!'),
    ];
    expect(applyEvents('', events, 1)).toBe('python code');
    expect(applyEvents('', events, 2)).toBe('let a = 1;');
    expect(applyEvents('', events, 3)).toBe('let a = 1;!');
    expect(stateAt({ code: '', language: 'python' }, events, 2).language).toBe('javascript');
  });

  it('ignores cursor, copy, focus and malformed events', () => {
    const events = [
      ev(1, 'cursor', { line: 1, column: 1 }),
      ev(2, 'copy', { text: 'x' }),
      ev(3, 'insert', { text: 'no range' }),
      ev(4, 'focus_lost'),
    ];
    expect(applyEvents('start', events, 10)).toBe('start');
  });

  it('clamps positions past the end instead of throwing', () => {
    expect(applyChange('ab', r(9, 9, 9, 9), 'X')).toBe('abX');
  });

  it('scrubbing back gives the earlier state again (pure, from the start)', () => {
    const events = [ins(10, 1, 1, 'a'), ins(20, 1, 2, 'b'), ins(30, 1, 3, 'c')];
    expect(applyEvents('', events, 30)).toBe('abc');
    expect(applyEvents('', events, 10)).toBe('a');
    expect(applyEvents('', events, 0)).toBe('');
  });
});

describe('ReplayCursor (snapshots)', () => {
  it('forward, backward and jumps give the same result as applyEvents', () => {
    const events: ReplayEvent[] = [];
    let text = '';
    for (let i = 0; i < 1000; i++) {
      events.push(ins(i * 10, 1, text.length + 1, String.fromCharCode(97 + (i % 26))));
      text += String.fromCharCode(97 + (i % 26));
    }
    const c = new ReplayCursor({ code: '', language: null }, events, 50);
    for (const t of [5000, 100, 9990, 0, 4321, 4320, 9999]) {
      expect(c.at(t).code).toBe(applyEvents('', events, t));
    }
    expect(c.at(1e9).code).toBe(text);
  });
});

describe('buildMarkers', () => {
  it('marks paste attempts, runs, time away and idle gaps (30 s)', () => {
    const events = [
      ev(35_000, 'insert', { range: r(1, 1, 1, 1), text: 'a' }), // 35 s after the start: idle at start
      ev(36_000, 'paste_external_blocked', { length: 120, lines: 6 }),
      ev(40_000, 'focus_lost'),
      ev(52_000, 'focus_gained'),
      ev(60_000, 'run'),
      ev(100_000, 'insert', { range: r(1, 2, 1, 2), text: 'b' }), // 40 s gap after the run
      ev(101_000, 'paste_internal', { text: 'ab' }),
    ];
    const m = buildMarkers(events, 0, 30);
    expect(countMarkers(m)).toEqual({ paste: 2, idle: 2, focus: 1, run: 1 });
    const idle = m.filter((x) => x.kind === 'idle').map((x) => [x.atMs, x.endMs]);
    expect(idle).toEqual([
      [0, 35_000],
      [60_000, 100_000],
    ]);
    expect(m.find((x) => x.kind === 'focus')).toMatchObject({ atMs: 40_000, endMs: 52_000 });
    const blocked = m.find((x) => x.kind === 'paste' && x.blocked)!;
    expect(blocked).toMatchObject({ atMs: 36_000, length: 120, lines: 6 });
    expect(m.map((x) => x.atMs)).toEqual([...m.map((x) => x.atMs)].sort((a, b) => a - b));
  });

  it('typing without long gaps has no idle marker', () => {
    const events = [ins(1000, 1, 1, 'a'), ins(20_000, 1, 2, 'b'), ev(45_000, 'cursor')];
    expect(buildMarkers(events, 0, 30)).toEqual([]);
  });
});
