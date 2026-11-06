'use client';

import { CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Notice } from '@/components/common/notice';
import { issueTotals, type AssessmentOut, type ReadinessIssue } from '../model';

const KNOWN = [
  'stage1_no_tasks',
  'task_not_approved',
  'task_not_sandbox_validated',
  'question_not_approved',
  'question_language_mismatch',
  'stage2_not_enough_questions',
  'too_many_mandatory_questions',
] as const;

/** Server-computed readiness: ready = no blocking issue. Warnings never block. */
export function ReadinessPanel({ assessment }: { assessment: AssessmentOut | null }) {
  const t = useTranslations('hrAssessment.readiness');
  if (!assessment) {
    return (
      <Notice tone="info" title={t('notSavedTitle')}>
        {t('notSavedBody')}
      </Notice>
    );
  }
  const { blocking, warnings } = issueTotals(assessment.issues);
  const title = (id: unknown) => {
    const all = [
      ...assessment.tasks.map((x) => [x.id, x.title]),
      ...assessment.questions.map((x) => [x.id, x.text]),
    ];
    const found = all.find(([i]) => i === id)?.[1];
    return found ? found.slice(0, 60) : '—';
  };
  const text = (i: ReadinessIssue) => {
    const d = i.details as Record<string, unknown>;
    if (!(KNOWN as readonly string[]).includes(i.code))
      return t('issues.unknown', { code: i.code });
    return t(`issues.${i.code as (typeof KNOWN)[number]}`, {
      item: title(d.id),
      needed: Number(d.needed ?? 0),
      approved: Number(d.approved ?? 0),
      mandatory: Number(d.mandatory ?? 0),
      count: Number(d.question_count ?? 0),
    });
  };

  return (
    <section aria-labelledby="readiness-h" className="sp-card grid gap-3 p-4">
      <h2 id="readiness-h" className="flex items-center gap-2 text-lg font-semibold">
        {assessment.ready ? (
          <CircleCheck aria-hidden="true" className="size-5 text-success" />
        ) : (
          <CircleAlert aria-hidden="true" className="size-5 text-danger" />
        )}
        {assessment.ready ? t('ready') : t('notReady')}
      </h2>
      {blocking.length ? (
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <CircleAlert aria-hidden="true" className="size-4 text-danger" />
            {t('blocking', { count: blocking.length })}
          </h3>
          <ul className="mt-1 list-disc pl-6 text-sm">
            {blocking.map((i, n) => (
              <li key={`${i.code}-${n}`}>{text(i)}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {warnings.length ? (
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <TriangleAlert aria-hidden="true" className="size-4 text-warning" />
            {t('warnings', { count: warnings.length })}
          </h3>
          <ul className="mt-1 list-disc pl-6 text-sm">
            {warnings.map((i, n) => (
              <li key={`${i.code}-${n}`}>{text(i)}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {!blocking.length && !warnings.length ? (
        <p className="text-sm text-muted">{t('noIssues')}</p>
      ) : null}
    </section>
  );
}
