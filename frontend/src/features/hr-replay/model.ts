import type { ResponseOf } from '@/lib/api';

export type Replay = ResponseOf<
  '/api/v1/companies/{company_id}/applications/{application_id}/stage1/replay/{task_id}',
  'get'
>;
export type ReplayEvent = Replay['events'][number];

/** Monaco `IRange`: 1-based lines and columns, end exclusive. */
export interface Range {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

export interface EditorState {
  code: string;
  language: string | null;
}

// ------------------------------------------------------------------ text edits

/** Offset of (line, column) in `text`; positions past the end are clamped like Monaco does. */
export function offsetAt(text: string, line: number, column: number): number {
  let start = 0;
  for (let l = 1; l < line; l++) {
    const nl = text.indexOf('\n', start);
    if (nl === -1) return text.length;
    start = nl + 1;
  }
  const nl = text.indexOf('\n', start);
  const lineEnd = nl === -1 ? text.length : nl;
  return Math.min(start + Math.max(column - 1, 0), lineEnd);
}

function asRange(v: unknown): Range | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const keys = ['startLineNumber', 'startColumn', 'endLineNumber', 'endColumn'] as const;
  if (!keys.every((k) => typeof r[k] === 'number')) return null;
  return r as unknown as Range;
}

/** Replace `range` with `text` (insert: empty range; delete: empty text). */
export function applyChange(code: string, range: Range, text: string): string {
  const a = offsetAt(code, range.startLineNumber, range.startColumn);
  const b = offsetAt(code, range.endLineNumber, range.endColumn);
  return code.slice(0, Math.min(a, b)) + text + code.slice(Math.max(a, b));
}

/**
 * One event on the editor state. Monaco reports the several changes of one edit (multi-cursor,
 * move line) in descending document order, and the browser sends them as consecutive events,
 * so applying them one after another is correct.
 */
export function applyEvent(state: EditorState, e: ReplayEvent): EditorState {
  const p = e.payload;
  if (e.type === 'editor_reset') {
    return {
      code: typeof p.code === 'string' ? p.code : state.code,
      language: typeof p.language === 'string' ? p.language : state.language,
    };
  }
  if (e.type !== 'insert' && e.type !== 'replace' && e.type !== 'delete') return state;
  const range = asRange(p.range);
  if (!range) return state;
  const text = e.type === 'delete' ? '' : typeof p.text === 'string' ? p.text : '';
  return { ...state, code: applyChange(state.code, range, text) };
}

/** Number of leading events with `t_ms <= upToMs` (events are in play order). */
export function countUpTo(events: readonly ReplayEvent[], upToMs: number): number {
  let n = 0;
  while (n < events.length && events[n].t_ms <= upToMs) n++;
  return n;
}

/** The code after every event up to `upToMs`, starting from `initial`. Pure. */
export function applyEvents(
  initial: string,
  events: readonly ReplayEvent[],
  upToMs: number,
): string {
  return stateAt({ code: initial, language: null }, events, upToMs).code;
}

export function stateAt(
  initial: EditorState,
  events: readonly ReplayEvent[],
  upToMs: number,
): EditorState {
  const n = countUpTo(events, upToMs);
  let s = initial;
  for (let i = 0; i < n; i++) s = applyEvent(s, events[i]);
  return s;
}

/**
 * Seeking with snapshots: forward play continues from the last state, a seek back restarts from
 * the nearest checkpoint (every `step` events) instead of the beginning.
 */
export class ReplayCursor {
  private checkpoints: { index: number; state: EditorState }[];
  private index = 0;
  private state: EditorState;

  constructor(
    private readonly initial: EditorState,
    private readonly events: readonly ReplayEvent[],
    private readonly step = 200,
  ) {
    this.state = initial;
    this.checkpoints = [{ index: 0, state: initial }];
  }

  at(upToMs: number): EditorState {
    const target = countUpTo(this.events, upToMs);
    if (target < this.index) {
      const cp = [...this.checkpoints].reverse().find((c) => c.index <= target)!;
      this.index = cp.index;
      this.state = cp.state;
    }
    while (this.index < target) {
      this.state = applyEvent(this.state, this.events[this.index]);
      this.index++;
      if (this.index % this.step === 0 && !this.checkpoints.some((c) => c.index === this.index)) {
        this.checkpoints.push({ index: this.index, state: this.state });
      }
    }
    return this.state;
  }
}

// --------------------------------------------------------------------- markers

export type MarkerKind = 'paste' | 'idle' | 'focus' | 'run';

export interface Marker {
  id: string;
  kind: MarkerKind;
  /** Timeline position, ms from session start. */
  atMs: number;
  /** Idle and focus periods have an end. */
  endMs?: number;
  /** `paste`: true when the text was blocked (outside the editor). */
  blocked?: boolean;
  /** `paste`: size reported by the browser (never the text). */
  length?: number;
  lines?: number;
}

export const IDLE_SIGNAL_MIN_S = 30;

const ACTIVITY = new Set(['insert', 'replace', 'delete', 'run']);
const AWAY_START = new Set(['focus_lost', 'visibility_hidden', 'fullscreen_exit']);
const AWAY_END = new Set(['focus_gained', 'visibility_visible']);

/** Timeline marks for paste attempts, idle gaps, time away from the tab, and runs. */
export function buildMarkers(
  events: readonly ReplayEvent[],
  startMs: number,
  idleMinS = IDLE_SIGNAL_MIN_S,
): Marker[] {
  const out: Marker[] = [];
  let lastActivity = startMs;
  let away: Marker | null = null;

  for (const e of events) {
    if (e.type === 'paste_external_blocked') {
      out.push({
        id: `p${e.seq}`,
        kind: 'paste',
        atMs: e.t_ms,
        blocked: true,
        length: Number(e.payload.length) || 0,
        lines: Number(e.payload.lines) || 0,
      });
    } else if (e.type === 'paste_internal') {
      out.push({ id: `p${e.seq}`, kind: 'paste', atMs: e.t_ms, blocked: false });
    } else if (AWAY_START.has(e.type)) {
      if (!away || e.type !== 'fullscreen_exit') {
        away = { id: `f${e.seq}`, kind: 'focus', atMs: e.t_ms };
        out.push(away);
      }
    } else if (AWAY_END.has(e.type) && away) {
      away.endMs = e.t_ms;
      away = null;
    }
    if (e.type === 'run') out.push({ id: `r${e.seq}`, kind: 'run', atMs: e.t_ms });
    if (ACTIVITY.has(e.type)) {
      if ((e.t_ms - lastActivity) / 1000 >= idleMinS) {
        out.push({ id: `i${e.seq}`, kind: 'idle', atMs: lastActivity, endMs: e.t_ms });
      }
      lastActivity = Math.max(lastActivity, e.t_ms);
    }
  }
  return out.sort((a, b) => a.atMs - b.atMs);
}

export function countMarkers(markers: readonly Marker[]): Record<MarkerKind, number> {
  const c: Record<MarkerKind, number> = { paste: 0, idle: 0, focus: 0, run: 0 };
  for (const m of markers) c[m.kind]++;
  return c;
}

export const SPEEDS = [1, 2, 4, 8] as const;

export function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
