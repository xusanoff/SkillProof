'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { levelOf, pickRecorderMime, rmsOf, VadTracker } from './vad';

export type MicState = 'idle' | 'starting' | 'recording' | 'denied' | 'unavailable';

export interface Recording {
  blob: Blob;
  mime: string;
  durationMs: number;
  silenceMs: number;
}

export function micSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

/**
 * Microphone → MediaRecorder + a loudness meter (Web Audio). The stream is released after every
 * `stop()`. `onSpeech` fires at most every ~3 s while speech is detected.
 */
export function useMicRecorder(opts: { onSpeech?: () => void } = {}) {
  const [state, setState] = useState<MicState>('idle');
  const [level, setLevel] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const live = useRef<{
    stream: MediaStream;
    recorder: MediaRecorder;
    ctx: AudioContext | null;
    timer: ReturnType<typeof setInterval> | null;
    chunks: Blob[];
    vad: VadTracker;
    startedAt: number;
    mime: string;
  } | null>(null);
  const onSpeech = useRef(opts.onSpeech);
  useEffect(() => {
    onSpeech.current = opts.onSpeech;
  });

  const release = useCallback(() => {
    const l = live.current;
    live.current = null;
    if (!l) return;
    if (l.timer) clearInterval(l.timer);
    l.stream.getTracks().forEach((t) => t.stop());
    void l.ctx?.close().catch(() => {});
    setLevel(0);
    setSpeaking(false);
  }, []);

  useEffect(() => release, [release]);

  const start = useCallback(async (): Promise<boolean> => {
    if (live.current) return true;
    if (!micSupported()) {
      setState('unavailable');
      return false;
    }
    setState('starting');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const name = (e as { name?: string }).name;
      setState(name === 'NotFoundError' || name === 'NotReadableError' ? 'unavailable' : 'denied');
      return false;
    }
    try {
      const mime = pickRecorderMime((m) => MediaRecorder.isTypeSupported(m));
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      const startedAt = performance.now();
      const vad = new VadTracker(startedAt);
      let ctx: AudioContext | null = null;
      let timer: ReturnType<typeof setInterval> | null = null;
      try {
        ctx = new AudioContext();
        void ctx.resume().catch(() => {});
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        timer = setInterval(() => {
          analyser.getFloatTimeDomainData(buf);
          const rms = rmsOf(buf);
          const step = vad.update(rms, performance.now());
          setLevel(levelOf(rms));
          setSpeaking(step.speaking);
          if (step.emitActivity) onSpeech.current?.();
        }, 100);
      } catch {
        // No meter: the recording itself still works.
      }
      recorder.start(1000);
      live.current = { stream, recorder, ctx, timer, chunks, vad, startedAt, mime };
      setState('recording');
      return true;
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      setState('unavailable');
      return false;
    }
  }, []);

  /** Stops and resolves with the recording (null if nothing was recording). */
  const stop = useCallback((): Promise<Recording | null> => {
    const l = live.current;
    if (!l) return Promise.resolve(null);
    return new Promise((resolve) => {
      const done = () => {
        const now = performance.now();
        const mime = l.recorder.mimeType || l.mime || 'audio/webm';
        const out = {
          blob: new Blob(l.chunks, { type: mime }),
          mime,
          durationMs: Math.round(now - l.startedAt),
          silenceMs: l.vad.finish(now),
        };
        release();
        setState('idle');
        resolve(out);
      };
      if (l.recorder.state === 'inactive') return done();
      l.recorder.onstop = done;
      l.recorder.stop();
    });
  }, [release]);

  return { state, level, speaking, start, stop };
}
