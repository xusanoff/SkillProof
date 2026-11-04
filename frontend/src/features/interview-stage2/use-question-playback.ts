'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type PlaybackState = 'loading' | 'playing' | 'blocked' | 'done';

/**
 * Plays the question once when it is new. `onPlayed` fires exactly once: when the audio ended, when
 * playback failed, when there is no audio, or when the browser blocked autoplay and the candidate
 * pressed play. A question that was already asked (reload) is not played on its own: `replay()`.
 */
export function useQuestionPlayback(opts: {
  turnId: string;
  hasAudio: boolean;
  asked: boolean;
  fetchAudio: (turnId: string) => Promise<string>;
  onPlayed: () => void;
}) {
  const { turnId, hasAudio, asked } = opts;
  const [state, setState] = useState<PlaybackState>(asked || !hasAudio ? 'done' : 'loading');
  const audio = useRef<HTMLAudioElement | null>(null);
  const url = useRef<string | null>(null);
  const played = useRef(false);
  const started = useRef(false);
  const latest = useRef(opts);
  useEffect(() => {
    latest.current = opts;
  });

  const finish = useCallback(() => {
    setState('done');
    if (!played.current) {
      played.current = true;
      latest.current.onPlayed();
    }
  }, []);

  const attach = useCallback(
    async (autoplay: boolean) => {
      if (!audio.current) {
        let src: string;
        try {
          src = await latest.current.fetchAudio(turnId);
        } catch {
          finish();
          return;
        }
        url.current = src;
        const el = new Audio(src);
        el.onended = finish;
        el.onerror = finish;
        audio.current = el;
      }
      try {
        setState('playing');
        await audio.current.play();
      } catch {
        // Autoplay blocked (or a failed decode that also fires `error`): ask for a press.
        setState(autoplay ? 'blocked' : 'done');
        if (!autoplay) finish();
      }
    },
    [turnId, finish],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (asked) {
      // Reload: the clocks already run. Nothing plays by itself.
      played.current = true;
      return;
    }
    if (!hasAudio) {
      // Nothing to play: the text on screen is the question.
      played.current = true;
      latest.current.onPlayed();
      return;
    }
    // After mount: the fetch and `play()` are external work, not part of rendering.
    void Promise.resolve().then(() => attach(true));
  }, [asked, hasAudio, attach, finish]);

  useEffect(
    () => () => {
      audio.current?.pause();
      audio.current = null;
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = null;
    },
    [],
  );

  return {
    state,
    /** Press play after a blocked autoplay, or replay the question (changes no clocks). */
    play: () => void attach(false),
  };
}
