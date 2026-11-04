'use client';

import { useTranslations } from 'next-intl';
import { Notice } from '@/components/common/notice';
import { summaryUnavailable, writtenByReuse, type HrReport, type ReportPoint } from '../model';

/** "task_2" → "Task 2", "turn_3" → "Question 3"; anything else is shown as sent. */
function RefLabel({ refValue }: { refValue: string }) {
  const t = useTranslations('hrReport.points');
  const m = /^(task|turn)_(\d+)$/.exec(refValue);
  if (!m) return refValue ? <>{refValue}</> : null;
  return <>{m[1] === 'task' ? t('task', { n: m[2] }) : t('turn', { n: m[2] })}</>;
}

function Point({ point }: { point: ReportPoint }) {
  const t = useTranslations('hrReport.points');
  return (
    <li className="grid gap-2 rounded-lg border border-border p-3">
      <p>{point.text}</p>
      {point.ref ? (
        <p className="text-sm text-muted">
          <RefLabel refValue={point.ref} />
        </p>
      ) : null}
      {point.quote ? (
        <blockquote className="border-l-2 border-border-strong pl-3 text-sm italic">
          {point.quote}
        </blockquote>
      ) : null}
      {point.excerpt ? (
        <figure className="grid gap-1">
          {point.lines.length ? (
            <figcaption className="text-xs text-muted tabular-nums">
              {t('lines', { lines: point.lines.join(', ') })}
            </figcaption>
          ) : null}
          <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 text-sm">
            <code className="font-mono">{point.excerpt}</code>
          </pre>
        </figure>
      ) : null}
    </li>
  );
}

function PointList({ id, title, items }: { id: string; title: string; items: ReportPoint[] }) {
  const t = useTranslations('hrReport.points');
  return (
    <div>
      <h3 id={id} className="font-semibold">
        {title}
      </h3>
      {items.length ? (
        <ul aria-labelledby={id} className="mt-2 grid gap-2">
          {items.map((p, i) => (
            <Point key={i} point={p} />
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted">{t('none')}</p>
      )}
    </div>
  );
}

/** Spec §8 item 3: the AI summary, strengths and gaps with their evidence. */
export function PointsSection({ report }: { report: HrReport }) {
  const t = useTranslations('hrReport.points');
  const unavailable = summaryUnavailable(report);
  const reused = writtenByReuse(report);
  return (
    <section
      aria-labelledby="points-h"
      className="grid gap-4 rounded-xl border border-border p-4 sm:p-5"
    >
      <h2 id="points-h" className="text-lg font-semibold">
        {t('title')}
      </h2>
      {reused ? (
        <Notice tone="info" role="status">
          {t('reusedBody')}
        </Notice>
      ) : unavailable ? (
        <Notice tone="warning" role="status" title={t('unavailableTitle')}>
          {t('unavailableBody')}
        </Notice>
      ) : report.summary ? (
        <p className="max-w-prose whitespace-pre-line">{report.summary}</p>
      ) : null}
      {reused || (unavailable && !report.strengths.length && !report.gaps.length) ? null : (
        <div className="grid gap-4 lg:grid-cols-2">
          <PointList id="strengths-h" title={t('strengths')} items={report.strengths} />
          <PointList id="gaps-h" title={t('gaps')} items={report.gaps} />
        </div>
      )}
      <p className="text-xs text-muted">
        {t('model', { model: report.model, version: report.prompt_version })}
      </p>
    </section>
  );
}
