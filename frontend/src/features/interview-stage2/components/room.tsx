'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Notice } from '@/components/common/notice';
import { LogoMark } from '@/components/layout/logo-mark';
import { TimerChip, useDeadlineSeconds } from '@/features/interview/components/clock';
import { useInterviewRoom } from '@/features/interview/components/use-interview-room';
import { useSubmitAnswer } from '../api';
import { isTextMode, progressPercent, questionNumber, type Stage2State } from '../model';
import { useStage2Telemetry } from '../use-stage2-telemetry';
import { CodePanel } from './code-panel';
import { InactivityBanner } from './inactivity-banner';
import { Preparing } from './preparing';
import { TextAnswer } from './text-answer';
import { VoiceAnswer } from './voice-answer';

/**
 * The compact oral-interview room: question (always visible, announced when it changes), progress,
 * clocks, the candidate's own code when the question is about it, and the answer area.
 */
export function Room({
  state,
  title,
  refetch,
}: {
  state: Stage2State;
  title: string;
  refetch: () => Promise<unknown>;
}) {
  const t = useTranslations('stage2.room');
  const turn = state.current_turn;
  const tel = useStage2Telemetry({
    sid: state.id,
    live: true,
    turnId: turn?.id,
    order: turn?.order,
    refetch,
  });
  useInterviewRoom(true);
  const submit = useSubmitAnswer(state.id);
  const total = useDeadlineSeconds(state.expires_at, state.server_now);
  const answerLeft = useDeadlineSeconds(turn?.answer_deadline, state.server_now);

  // Past the session deadline the server decides; ask until the status changes.
  useEffect(() => {
    if (total !== 0) return;
    const id = setInterval(() => void refetch(), 3000);
    return () => clearInterval(id);
  }, [total, refetch]);

  if (tel.connection === 'superseded') {
    return (
      <section className="mx-auto grid max-w-prose gap-3" role="alert">
        <h1 className="sp-page-title">{t('supersededTitle')}</h1>
        <p>{t('supersededBody')}</p>
      </section>
    );
  }

  return (
    <div
      data-stage2-room
      className="sp-dark mx-auto grid min-h-[calc(100dvh-3rem)] w-full max-w-7xl content-start gap-6 rounded-[22px] p-5 sm:p-8"
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border pb-5">
        <LogoMark className="[&_path]:stroke-dark-panel [&_rect]:fill-signal" />
        <div className="min-w-0">
          <h1 className="sp-page-title text-lg">{t('title')}</h1>
          <p className="truncate text-sm text-muted">{title}</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {tel.connection !== 'open' ? (
            <p role="status" className="text-sm text-muted">
              {t('offline')}
            </p>
          ) : null}
          <TimerChip seconds={answerLeft} label={t('answerTimer')} showLabel />
          <TimerChip seconds={total} label={t('totalTimer')} showLabel />
        </div>
      </header>

      <div className="grid gap-1">
        <p className="tabular-nums text-sm text-muted">
          {t('answered', { n: state.answered_count, total: state.question_count })}
        </p>
        <div
          role="progressbar"
          aria-label={t('progress')}
          aria-valuemin={0}
          aria-valuemax={state.question_count}
          aria-valuenow={state.answered_count}
          className="h-1.5 w-full overflow-hidden rounded-full bg-border"
        >
          <div
            className="h-full origin-left bg-accent"
            style={{ transform: `scaleX(${progressPercent(state) / 100})` }}
          />
        </div>
      </div>

      <InactivityBanner server={tel.server} />

      {!turn || state.preparing ? (
        <Preparing />
      ) : (
        <div
          className={`grid gap-6 ${turn.code ? 'lg:grid-cols-[minmax(0,1fr)_22rem]' : 'mx-auto w-full max-w-3xl'}`}
        >
          <div className="grid content-start gap-4">
            <section
              aria-labelledby="q-h"
              className="grid gap-4 rounded-xl border border-border bg-surface p-6"
            >
              <div aria-live="polite" aria-atomic="true" className="grid gap-2">
                <h2 id="q-h" className="tabular-nums text-sm font-semibold text-muted">
                  {turn.is_follow_up
                    ? t('followUp')
                    : t('questionN', { n: questionNumber(state), total: state.question_count })}
                </h2>
                <p className="text-2xl leading-relaxed font-semibold">{turn.text}</p>
              </div>
            </section>
            <div className="grid content-start gap-3">
              {turn.is_follow_up ? <Notice tone="info">{t('followUpNote')}</Notice> : null}
              {isTextMode(state) ? (
                <TextAnswer
                  key={`${turn.id}-t`}
                  state={state}
                  turn={turn}
                  tel={tel}
                  submit={submit}
                />
              ) : (
                <VoiceAnswer key={turn.id} state={state} turn={turn} tel={tel} submit={submit} />
              )}
            </div>
          </div>
          {turn.code ? (
            <aside className="grid min-w-0 content-start gap-4 rounded-xl border border-border bg-surface p-5">
              <CodePanel code={turn.code} />
            </aside>
          ) : null}
        </div>
      )}
    </div>
  );
}
