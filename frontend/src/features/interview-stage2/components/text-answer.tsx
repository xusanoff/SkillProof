'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { dueAfter } from '@/components/voice/vad';
import { useDeadlineSeconds } from '@/features/interview/components/clock';
import { useErrorText } from '@/lib/forms';
import type { useSubmitAnswer } from '../api';
import { readDraft, shouldAutoSubmit, writeDraft, type Stage2State, type Turn } from '../model';
import type { Stage2Telemetry } from '../use-stage2-telemetry';
import { AnswerError } from './answer-error';
import { ThinkButton } from './think-button';

/** Text answer: no paste, no drop; the draft survives a reload; activity is counted, never the content. */
export function TextAnswer({
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
  const [text, setText] = useState(() => readDraft(turn.id));
  const textRef = useRef(text);
  const lastTyped = useRef<number | null>(null);
  const sent = useRef(false);
  const played = useRef(false);
  const left = useDeadlineSeconds(turn.answer_deadline, state.server_now);

  // The question is on screen: the answer clocks start.
  useEffect(() => {
    if (played.current) return;
    played.current = true;
    if (!turn.asked) tel.record('question_played', turn.id);
  });

  const send = () => {
    if (sent.current) return;
    sent.current = true;
    tel.flush();
    submit.mutate(
      { turnId: turn.id, text: textRef.current },
      {
        onSuccess: () => writeDraft(turn.id, ''),
        onError: () => (sent.current = false),
      },
    );
  };

  useEffect(() => {
    if (shouldAutoSubmit(left, sent.current)) send();
    // Only the clock reaching zero triggers it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);

  const blocked = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    tel.record('paste_external_blocked', turn.id);
  };

  return (
    <div className="grid gap-3">
      <label htmlFor="answer-text" className="font-medium">
        {t('yourAnswer')}
      </label>
      <Textarea
        id="answer-text"
        value={text}
        rows={8}
        maxLength={state.answer_max_chars}
        autoFocus
        aria-describedby="answer-text-hint"
        className="min-h-48 text-base"
        onChange={(e) => {
          setText(e.target.value);
          textRef.current = e.target.value;
          writeDraft(turn.id, e.target.value);
          const now = performance.now();
          if (dueAfter(lastTyped.current, now)) {
            lastTyped.current = now;
            tel.record('typing_activity', turn.id);
          }
        }}
        onPaste={blocked}
        onDrop={blocked}
      />
      <p id="answer-text-hint" className="text-sm text-muted">
        {t('noPaste')}{' '}
        <span className="tabular-nums">
          {t('charCount', { n: text.length, max: state.answer_max_chars })}
        </span>
      </p>
      {submit.isError ? <AnswerError message={errorText(submit.error)} onRetry={send} /> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="lg"
          className="min-h-11 px-6"
          disabled={submit.isPending || !text.trim()}
          onClick={send}
        >
          {submit.isPending ? t('sending') : t('send')}
        </Button>
        <ThinkButton turn={turn} tel={tel} />
      </div>
    </div>
  );
}
