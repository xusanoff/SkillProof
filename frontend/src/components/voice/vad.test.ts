import { describe, expect, it } from 'vitest';
import {
  audioExtension,
  dueAfter,
  levelOf,
  pickRecorderMime,
  rmsOf,
  SPEECH_RMS,
  VadTracker,
} from './vad';

describe('rmsOf / levelOf', () => {
  it('is 0 for silence and the amplitude for a constant signal', () => {
    expect(rmsOf([])).toBe(0);
    expect(rmsOf(new Float32Array(100))).toBe(0);
    expect(rmsOf(new Float32Array(100).fill(0.5))).toBeCloseTo(0.5);
    expect(rmsOf([1, -1, 1, -1])).toBeCloseTo(1);
  });
  it('meter stays within 0..1', () => {
    expect(levelOf(0)).toBe(0);
    expect(levelOf(5)).toBe(1);
    expect(levelOf(0.05)).toBeCloseTo(0.5);
    expect(levelOf(0.02)).toBeCloseTo(0.2);
  });
});

describe('pickRecorderMime', () => {
  it('prefers webm/opus, falls back to what the browser supports (Safari: mp4)', () => {
    expect(pickRecorderMime(() => true)).toBe('audio/webm;codecs=opus');
    expect(pickRecorderMime((m) => m === 'audio/mp4')).toBe('audio/mp4');
    expect(pickRecorderMime(() => false)).toBe('');
  });
  it('maps the type to a file extension', () => {
    expect(audioExtension('audio/mp4')).toBe('mp4');
    expect(audioExtension('audio/webm;codecs=opus')).toBe('webm');
    expect(audioExtension('audio/ogg;codecs=opus')).toBe('ogg');
  });
});

describe('VadTracker', () => {
  const loud = SPEECH_RMS * 3;
  it('counts the wait before the first speech and the gaps, not the tail', () => {
    const v = new VadTracker(0);
    v.update(0, 500);
    expect(v.update(loud, 2000).speaking).toBe(true); // 2000 ms of leading silence
    v.update(loud, 3000);
    v.update(0, 3400); // within the hangover: still speaking
    expect(v.isSpeaking).toBe(true);
    v.update(0, 3700); // 700 ms after the last loud reading: speech ended at 3000
    expect(v.isSpeaking).toBe(false);
    v.update(0, 5000);
    v.update(loud, 6000); // gap 3000 -> 6000
    v.update(loud, 6500);
    v.update(0, 8000); // tail: not counted
    expect(v.finish(9000)).toBe(2000 + 3000);
  });
  it('a recording with no speech is all silence', () => {
    const v = new VadTracker(100);
    v.update(0.001, 1000);
    expect(v.finish(4100)).toBe(4000);
  });
  it('emits speech activity at most every 3 s while speaking', () => {
    const v = new VadTracker(0);
    const emitted: number[] = [];
    for (let t = 0; t <= 7000; t += 100) {
      if (v.update(loud, t).emitActivity) emitted.push(t);
    }
    expect(emitted).toEqual([0, 3000, 6000]);
    const q = new VadTracker(0);
    expect(q.update(0, 100).emitActivity).toBe(false);
  });
});

describe('dueAfter', () => {
  it('is due the first time and after the interval', () => {
    expect(dueAfter(null, 10)).toBe(true);
    expect(dueAfter(1000, 3999)).toBe(false);
    expect(dueAfter(1000, 4000)).toBe(true);
  });
});
