/** Pure helpers for recording an answer: recorder format, loudness, speech / silence bookkeeping. */

/** Root-mean-square level of a block of samples in -1..1. */
export function rmsOf(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

/** RMS at or above this counts as speech. Quiet rooms sit around 0.003; speech is 0.03 and up. */
export const SPEECH_RMS = 0.02;
export const SPEECH_HANGOVER_MS = 600;
export const ACTIVITY_EVERY_MS = 3000;

/** Meter position 0..1 for an RMS value (speech at 0.1 fills it), in steps of 0.05. */
export function levelOf(rms: number): number {
  return Math.min(1, Math.round((rms / 0.1) * 20) / 20);
}

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
] as const;

/** Best recorder format the browser supports (Chrome / Firefox: webm, Safari: mp4); '' = browser default. */
export function pickRecorderMime(isSupported: (mime: string) => boolean): string {
  return MIME_CANDIDATES.find((m) => isSupported(m)) ?? '';
}

export function audioExtension(mime: string): string {
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

export interface VadStep {
  speaking: boolean;
  /** True at most every `ACTIVITY_EVERY_MS` while speech goes on: send `speech_activity`. */
  emitActivity: boolean;
}

/**
 * Speech / silence tracking from loudness readings. `silenceMs` counts the wait before the first
 * speech plus the pauses between speech (never the tail after the last word).
 */
export class VadTracker {
  private speaking = false;
  private hasSpoken = false;
  private lastLoudAt = 0;
  private silenceFrom: number;
  private silence = 0;
  private lastEmit: number | null = null;

  constructor(
    startMs: number,
    private readonly threshold = SPEECH_RMS,
    private readonly hangoverMs = SPEECH_HANGOVER_MS,
    private readonly activityEveryMs = ACTIVITY_EVERY_MS,
  ) {
    this.silenceFrom = startMs;
  }

  update(rms: number, nowMs: number): VadStep {
    const loud = rms >= this.threshold;
    if (loud) {
      if (!this.speaking) {
        // Silence ends where this speech begins.
        this.silence += Math.max(0, nowMs - this.silenceFrom);
        this.speaking = true;
        this.hasSpoken = true;
      }
      this.lastLoudAt = nowMs;
    } else if (this.speaking && nowMs - this.lastLoudAt >= this.hangoverMs) {
      this.speaking = false;
      this.silenceFrom = this.lastLoudAt;
    }
    let emitActivity = false;
    if (
      this.speaking &&
      (this.lastEmit === null || nowMs - this.lastEmit >= this.activityEveryMs)
    ) {
      this.lastEmit = nowMs;
      emitActivity = true;
    }
    return { speaking: this.speaking, emitActivity };
  }

  /** Total silence in ms at the end of the recording; a recording with no speech is all silence. */
  finish(nowMs: number): number {
    const tail = !this.hasSpoken ? Math.max(0, nowMs - this.silenceFrom) : 0;
    return Math.round(this.silence + tail);
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }
}

/** True when `everyMs` has passed since the last emit (or none yet): typing activity pacing. */
export function dueAfter(lastMs: number | null, nowMs: number, everyMs = ACTIVITY_EVERY_MS) {
  return lastMs === null || nowMs - lastMs >= everyMs;
}
