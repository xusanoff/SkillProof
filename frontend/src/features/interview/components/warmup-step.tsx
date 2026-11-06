'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Notice } from '@/components/common/notice';
import { Button } from '@/components/ui/button';
import { useWarmupRun } from '../api';
import { starterFor, type InterviewState } from '../model';
import { TimerChip, useNow } from './clock';
import { TaskWorkspace } from './task-workspace';

/**
 * Warm-up: add two numbers. Not scored, nothing recorded (no telemetry, no submit), may be skipped.
 * The countdown here is a local hint only (nothing is enforced).
 */
export function WarmupStep({ state, onDone }: { state: InterviewState; onDone: () => void }) {
  const t = useTranslations('interview.warmup');
  const w = state.warmup!;
  const run = useWarmupRun(state.application_id);
  const now = useNow();
  const [start] = useState(() => performance.now());
  const left = Math.max(0, w.minutes * 60 - Math.floor((now - start) / 1000));
  const first = w.languages.includes('python') ? 'python' : w.languages[0];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="sp-page-title">{t('title')}</h1>
        <TimerChip seconds={left} label={t('timer')} />
        <Button variant="ghost" className="ml-auto min-h-11" onClick={onDone}>
          {t('skip')}
        </Button>
      </div>
      <Notice tone="info">{t('notice')}</Notice>
      <TaskWorkspace
        title={t('taskTitle')}
        statement={t('statement')}
        languages={w.languages}
        labels={w.language_labels}
        starterCode={w.starter_code}
        visibleTests={w.visible_tests}
        initial={{ language: first, code: starterFor(w.starter_code, first) }}
        results={run.data?.results ?? null}
        running={run.isPending}
        runError={run.error}
        onRun={(language, code) => run.mutate({ language, code })}
        extraActions={
          <Button className="min-h-11 px-4" onClick={onDone}>
            {t('done')}
          </Button>
        }
      />
    </div>
  );
}
