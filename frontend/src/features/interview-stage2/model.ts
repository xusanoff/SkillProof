import type { ResponseOf } from '@/lib/api';

export type Stage2State = ResponseOf<'/api/v1/interview-sessions/{session_id}/stage2', 'get'>;
export type Turn = NonNullable<Stage2State['current_turn']>;

export const POLL_PREPARING_MS = 2000;

export function stage2WsUrl(sessionId: string): string {
  const base = (process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000').replace(/\/$/, '');
  return `${base}/api/v1/interview-sessions/${sessionId}/stage2/events`;
}

export function isLive(s: Stage2State): boolean {
  return s.status === 'in_progress';
}

/** `text` mode (or a voice session that fell back) shows the textarea. */
export function isTextMode(s: Stage2State): boolean {
  return s.mode === 'text';
}

/** Whole-number percent of the planned questions that have an answer (follow-ups are extra). */
export function progressPercent(s: Pick<Stage2State, 'answered_count' | 'question_count'>): number {
  if (s.question_count <= 0) return 0;
  return Math.min(100, Math.round((s.answered_count / s.question_count) * 100));
}

/** Position of the question being asked among the planned ones (never beyond the total). */
export function questionNumber(s: Pick<Stage2State, 'answered_count' | 'question_count'>): number {
  return Math.min(s.answered_count + 1, Math.max(1, s.question_count));
}

/** The answer clock ran out: send what there is, once. */
export function shouldAutoSubmit(secondsLeft: number | null, submitted: boolean): boolean {
  return secondsLeft === 0 && !submitted;
}

/** The first matching event must carry the turn that is open now. */
export function turnPayload(turnId: string): { turn_id: string } {
  return { turn_id: turnId };
}

/** Lines of the code panel: `lines` are 1-based numbers the question is about. */
export function codeRows(code: string, highlighted: number[]) {
  const set = new Set(highlighted);
  return code.split('\n').map((text, i) => ({ n: i + 1, text, marked: set.has(i + 1) }));
}

/** Which end screen: the reason decides the wording for disqualified sessions. */
export function endKind(
  s: Pick<Stage2State, 'status' | 'reason'>,
): 'completed' | 'expired' | 'inactivity' | 'abandoned' | 'disqualified' | null {
  if (s.status === 'completed') return 'completed';
  if (s.status === 'expired') return 'expired';
  if (s.status === 'abandoned') return 'abandoned';
  if (s.status === 'disqualified') return s.reason === 'inactivity' ? 'inactivity' : 'disqualified';
  return null;
}

/** Draft of a text answer, per turn: survives a reload. Storage can be blocked, so never throws. */
const draftKey = (turnId: string) => `sp-s2-draft:${turnId}`;

export function readDraft(turnId: string, storage?: Storage): string {
  try {
    return (storage ?? window.sessionStorage).getItem(draftKey(turnId)) ?? '';
  } catch {
    return '';
  }
}

export function writeDraft(turnId: string, text: string, storage?: Storage) {
  try {
    const st = storage ?? window.sessionStorage;
    if (text) st.setItem(draftKey(turnId), text);
    else st.removeItem(draftKey(turnId));
  } catch {
    // Private mode / blocked storage: the draft is simply not kept.
  }
}

export interface AnswerPayload {
  turnId: string;
  text?: string;
  audio?: { blob: Blob; filename: string };
  transcriptHint?: string;
  silenceMs?: number;
}

/** Multipart body of the answer: only the fields that are set. */
export function answerForm(a: AnswerPayload): FormData {
  const form = new FormData();
  if (a.text !== undefined) form.append('text', a.text);
  if (a.audio) form.append('audio', a.audio.blob, a.audio.filename);
  if (a.transcriptHint?.trim()) form.append('transcript_hint', a.transcriptHint.trim());
  if (a.silenceMs !== undefined)
    form.append('silence_ms', String(Math.max(0, Math.round(a.silenceMs))));
  return form;
}
