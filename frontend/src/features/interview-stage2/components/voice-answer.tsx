'use client';

import { Check, Mic, Play, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Notice } from '@/components/common/notice';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { LevelMeter } from '@/components/voice/level-meter';
import { useMicRecorder } from '@/components/voice/use-mic-recorder';
import { audioExtension, dueAfter } from '@/components/voice/vad';
import { useDeadlineSeconds } from '@/features/interview/components/clock';
import { useErrorText } from '@/lib/forms';
import { useQuestionAudioFetcher, type useSubmitAnswer } from '../api';
import { shouldAutoSubmit, type AnswerPayload, type Stage2State, type Turn } from '../model';
import type { Stage2Telemetry } from '../use-stage2-telemetry';
import { useQuestionPlayback } from '../use-question-playback';
import { AnswerError } from './answer-error';
import { FallbackButton } from './fallback-button';
import { ThinkButton } from './think-button';

/**
 * Voice answer. New question: play it, then record. Reloaded question (`asked`): nothing starts by
 * itself; the candidate presses "Start answering" (also the gesture browsers need for audio).
 */
export function VoiceAnswer({
  state,
  turn,
  tel,
  submit,
}: {
  state: Stage2State;
  turn: Turn;
  tel: Stage2Telemetry;
  submit: ReturnType<typeof useSubmitAnswer>;
}) {
  const t = useTranslations('stage2.room');
  const errorText = useErrorText();
  const fetchAudio = useQuestionAudioFetcher(state.id);
  const rec = useMicRecorder({ onSpeech: () => tel.record('speech_activity', turn.id) });
  const startRec = rec.start;
  const playback = useQuestionPlayback({
    turnId: turn.id,
    hasAudio: turn.has_audio,
    asked: turn.asked,
    fetchAudio,
    onPlayed: () => tel.record('question_played', turn.id),
  });
  const [hint, setHint] = useState('');
  const hintRef = useRef('');
  const lastTyped = useRef<number | null>(null);
  const [initiallyAsked] = useState(turn.asked);
  const autoStarted = useRef(false);
  const [captured, setCaptured] = useState(false);
  const sent = useRef(false);
  const pending = useRef<AnswerPayload | null>(null);
  const left = useDeadlineSeconds(turn.answer_deadline, state.server_now);

  useEffect(() => {
    if (playback.state === 'done' && !initiallyAsked && !autoStarted.current) {
      autoStarted.current = true;
      void startRec();
    }
  }, [playback.state, initiallyAsked, startRec]);

  const send = async () => {
    if (sent.current) return;
    sent.current = true;
    tel.flush();
    if (!pending.current) {
      const out = await rec.stop();
      if (out && out.blob.size > 0) {
        setCaptured(true);
        pending.current = {
          turnId: turn.id,
          audio: { blob: out.blob, filename: `answer.${audioExtension(out.mime)}` },
          silenceMs: out.silenceMs,
        };
      }
    }
    if (!pending.current) {
      // Nothing was recorded: the server decides what happens to an unanswered turn.
      sent.current = false;
      return;
    }
    submit.mutate(
      { ...pending.current, transcriptHint: hintRef.current },
      { onError: () => (sent.current = false) },
    );
  };

  useEffect(() => {
    if (shouldAutoSubmit(left, sent.current)) void send();
    // Only the clock reaching zero triggers it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);

  const recording = rec.state === 'recording';
  const micProblem = rec.state === 'denied' || rec.state === 'unavailable';
  const status = recording
    ? rec.speaking
      ? t('hearing')
      : t('recording')
    : playback.state === 'playing' || playback.state === 'loading'
      ? t('playing')
      : '';

  return (
    <div className="grid gap-4">
      {micProblem ? (
        <Notice tone="danger" role="alert" title={t('micProblemTitle')}>
          {rec.state === 'denied' ? t('micDenied') : t('micUnavailable')}
        </Notice>
      ) : null}
      {playback.state === 'blocked' ? (
        <Notice tone="info" role="status">
          {t('autoplayBlocked')}
        </Notice>
      ) : null}

      <div className="grid gap-2" role="status">
        <LevelMeter level={recording ? rec.level : 0} />
        <p className="min-h-6 text-sm text-muted">{status}</p>
      </div>

      {state.transcript_hint_needed ? (
        <div className="grid gap-1 rounded-lg border border-warning/40 bg-warning-soft p-3">
          <label htmlFor="hint" className="text-sm font-medium">
            {t('hintLabel')}
          </label>
          <Textarea
            id="hint"
            value={hint}
            rows={3}
            className="text-base"
            onChange={(e) => {
              setHint(e.target.value);
              hintRef.current = e.target.value;
              const now = performance.now();
              if (dueAfter(lastTyped.current, now)) {
                lastTyped.current = now;
                tel.record('typing_activity', turn.id);
              }
            }}
          />
          <p className="text-xs text-muted">{t('hintHelp')}</p>
        </div>
      ) : null}

      {submit.isError ? (
        <AnswerError message={errorText(submit.error)} onRetry={() => void send()} />
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {!recording &&
        !captured &&
        rec.state !== 'starting' &&
        playback.state === 'done' &&
        (initiallyAsked || micProblem) ? (
          <Button type="button" className="min-h-11 gap-2" onClick={() => void rec.start()}>
            <Mic aria-hidden="true" />
            {t('startAnswer')}
          </Button>
        ) : null}
        <Button
          type="button"
          size="lg"
          className="min-h-11 gap-2 px-6"
          disabled={submit.isPending || (!recording && !captured)}
          onClick={() => void send()}
        >
          <Check aria-hidden="true" />
          {submit.isPending ? t('sending') : t('finish')}
        </Button>
        {playback.state === 'blocked' ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 gap-2"
            onClick={playback.play}
          >
            <Play aria-hidden="true" />
            {t('playQuestion')}
          </Button>
        ) : turn.has_audio && playback.state === 'done' ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 gap-2"
            onClick={playback.play}
          >
            <RotateCcw aria-hidden="true" />
            {t('replay')}
          </Button>
        ) : null}
        <ThinkButton turn={turn} tel={tel} />
      </div>
      {state.can_fall_back_to_text ? (
        <FallbackButton sid={state.id} prominent={micProblem} />
      ) : null}
    </div>
  );
}
