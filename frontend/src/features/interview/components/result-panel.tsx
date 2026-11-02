'use client';

import { CircleAlert, CircleCheck, LoaderCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Notice } from '@/components/common/notice';
import { resultState, type Session } from '../model';

/**
 * Candidate result after Stage 1 (server state only). No suspicion or integrity data is ever
 * shown here. `pending` polls (see `useSession`), `failed` shows no score.
 */
export function ResultPanel({ session }: { session: Session }) {
  const t = useTranslations('interview.result');
  const state = resultState(session);
  const r = session.result;
  if (!state) return null;

  if (state === 'pending') {
    return (
      <p role="status" className="flex items-center gap-2 rounded-lg border border-border p-4">
        <LoaderCircle aria-hidden="true" className="size-5 animate-spin text-muted" />
        {t('pending')}
      </p>
    );
  }
  if (state === 'failed' || !r) {
    return (
      <Notice tone="info" role="status" title={t('delayedTitle')}>
        {t('delayedBody')}
      </Notice>
    );
  }
  const passed = r.passed === true;
  return (
    <section
      aria-labelledby="result-h"
      className="grid gap-4 rounded-xl border border-border p-4 sm:p-5"
    >
      <h2 id="result-h" className="text-lg font-semibold">
        {t('title')}
      </h2>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <p className="text-4xl font-semibold tabular-nums">
          {r.score_percent ?? '—'}
          <span className="text-2xl">%</span>
        </p>
        <p className="grid gap-0.5 text-sm">
          {r.pass_threshold != null ? (
            <span className="text-muted tabular-nums">
              {t('threshold', { value: r.pass_threshold })}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5 font-medium">
            {passed ? (
              <CircleCheck aria-hidden="true" className="size-4 text-success" />
            ) : (
              <CircleAlert aria-hidden="true" className="size-4 text-danger" />
            )}
            {passed ? t('passed') : t('notPassed')}
          </span>
        </p>
      </div>
      <p className="max-w-prose">{passed ? t('nextStage2') : t('notPassedBody')}</p>
      <ul className="grid gap-3">
        {r.tasks.map((task, i) => (
          <li key={i} className="grid gap-2 rounded-lg border border-border p-3">
            <p className="flex flex-wrap items-baseline justify-between gap-2 font-medium">
              <span>{task.title}</span>
              <span className="text-sm text-muted tabular-nums">
                {t('hidden', { passed: task.hidden_passed, total: task.hidden_total })}
              </span>
            </p>
            {task.strengths.length ? (
              <div>
                <h3 className="text-sm font-semibold">{t('strengths')}</h3>
                <ul className="list-disc pl-5 text-sm">
                  {task.strengths.map((x, n) => (
                    <li key={n}>{x}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {task.weaknesses.length ? (
              <div>
                <h3 className="text-sm font-semibold">{t('weaknesses')}</h3>
                <ul className="list-disc pl-5 text-sm">
                  {task.weaknesses.map((x, n) => (
                    <li key={n}>{x}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
