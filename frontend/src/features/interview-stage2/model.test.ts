import { describe, expect, it } from 'vitest';
import {
  answerForm,
  codeRows,
  endKind,
  progressPercent,
  questionNumber,
  readDraft,
  shouldAutoSubmit,
  writeDraft,
} from './model';

describe('progress', () => {
  it('counts planned questions only and never passes 100%', () => {
    expect(progressPercent({ answered_count: 2, question_count: 8 })).toBe(25);
    expect(progressPercent({ answered_count: 9, question_count: 8 })).toBe(100);
    expect(progressPercent({ answered_count: 0, question_count: 0 })).toBe(0);
    expect(questionNumber({ answered_count: 8, question_count: 8 })).toBe(8);
    expect(questionNumber({ answered_count: 0, question_count: 8 })).toBe(1);
  });
});

describe('shouldAutoSubmit', () => {
  it('fires once when the clock is at zero', () => {
    expect(shouldAutoSubmit(0, false)).toBe(true);
    expect(shouldAutoSubmit(0, true)).toBe(false);
    expect(shouldAutoSubmit(5, false)).toBe(false);
    expect(shouldAutoSubmit(null, false)).toBe(false);
  });
});

describe('codeRows', () => {
  it('numbers lines from 1 and marks the question lines', () => {
    expect(codeRows('a\nb\nc', [2])).toEqual([
      { n: 1, text: 'a', marked: false },
      { n: 2, text: 'b', marked: true },
      { n: 3, text: 'c', marked: false },
    ]);
  });
});

describe('endKind', () => {
  it('maps status and reason', () => {
    expect(endKind({ status: 'in_progress', reason: null })).toBeNull();
    expect(endKind({ status: 'completed', reason: null })).toBe('completed');
    expect(endKind({ status: 'expired', reason: null })).toBe('expired');
    expect(endKind({ status: 'abandoned', reason: null })).toBe('abandoned');
    expect(endKind({ status: 'disqualified', reason: 'inactivity' })).toBe('inactivity');
    expect(endKind({ status: 'disqualified', reason: 'other' })).toBe('disqualified');
  });
});

describe('drafts', () => {
  function fakeStorage(): Storage {
    const m = new Map<string, string>();
    return {
      getItem: (k) => m.get(k) ?? null,
      setItem: (k, v) => void m.set(k, v),
      removeItem: (k) => void m.delete(k),
    } as Storage;
  }
  it('are kept per turn and removed when empty', () => {
    const st = fakeStorage();
    writeDraft('t1', 'salom', st);
    expect(readDraft('t1', st)).toBe('salom');
    expect(readDraft('t2', st)).toBe('');
    writeDraft('t1', '', st);
    expect(readDraft('t1', st)).toBe('');
  });
  it('never throw when storage is blocked', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    expect(readDraft('t', blocked)).toBe('');
    expect(() => writeDraft('t', 'x', blocked)).not.toThrow();
  });
});

describe('answerForm', () => {
  it('sends text, or audio with the hint and silence', () => {
    const text = answerForm({ turnId: 't', text: 'javob' });
    expect(text.get('text')).toBe('javob');
    expect(text.has('audio')).toBe(false);
    const voice = answerForm({
      turnId: 't',
      audio: { blob: new Blob(['x'], { type: 'audio/webm' }), filename: 'answer.webm' },
      transcriptHint: '  aytgan gapim ',
      silenceMs: 1234.6,
    });
    expect((voice.get('audio') as File).name).toBe('answer.webm');
    expect(voice.get('transcript_hint')).toBe('aytgan gapim');
    expect(voice.get('silence_ms')).toBe('1235');
    expect(voice.has('text')).toBe(false);
  });
  it('leaves out an empty hint', () => {
    const f = answerForm({
      turnId: 't',
      audio: { blob: new Blob(['x']), filename: 'a.webm' },
      transcriptHint: '   ',
    });
    expect(f.has('transcript_hint')).toBe(false);
  });
});
