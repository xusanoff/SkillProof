'use client';

import { useTranslations } from 'next-intl';
import { Notice } from '@/components/common/notice';
import { disqualificationKey, percentText, type Stage1Report } from '../model';

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="grid gap-0.5 rounded-lg border border-border p-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
      {hint ? <dd className="text-xs text-muted">{hint}</dd> : null}
    </div>
  );
}

/** Stage 1 %, hidden tests %, code review %; evaluation state, needs_review and disqualification. */
export function ScoresSection({ report }: { report: Stage1Report }) {
  const t = useTranslations('hrStage1.scores');
  const reason =
    report.status === 'disqualified' ? disqualificationKey(report.disqualification_reason) : null;
  return (
    <section
      aria-labelledby="scores-h"
      className="grid gap-3 rounded-xl border border-border p-4 sm:p-5"
    >
      <h2 id="scores-h" className="text-lg font-semibold">
        {t('title')}
      </h2>
      {reason ? (
        <Notice tone="danger" role="alert" title={t('disqualifiedTitle')}>
          {t(`disqualified.${reason}`)}
        </Notice>
      ) : null}
      {report.evaluation_state === 'pending' ? (
        <Notice tone="info" role="status">
          {t('pending')}
        </Notice>
      ) : null}
      {report.evaluation_state === 'failed' ? (
        <Notice tone="warning" role="alert" title={t('failedTitle')}>
          {t('failedBody')}
        </Notice>
      ) : null}
      {report.needs_review ? (
        <Notice tone="warning" role="status" title={t('needsReviewTitle')}>
          {t('needsReviewBody')}
        </Notice>
      ) : null}
      <dl className="grid gap-3 sm:grid-cols-3">
        <Stat
          label={t('stage1')}
          value={percentText(report.score_percent)}
          hint={
            report.pass_threshold != null
              ? `${t('threshold', { value: report.pass_threshold })}${report.passed == null ? '' : ` · ${report.passed ? t('passed') : t('notPassed')}`}`
              : undefined
          }
        />
        <Stat label={t('hidden')} value={percentText(report.hidden_tests_percent)} />
        <Stat label={t('review')} value={percentText(report.code_review_percent)} />
      </dl>
      <p className="max-w-prose text-sm text-muted">{t('notAutomatic')}</p>
    </section>
  );
}
