'use client';

import { useTranslations } from 'next-intl';
import { lineAnchor, type TaskReport } from '../model';

interface Point {
  text?: unknown;
  lines?: unknown;
  line?: unknown;
  comment?: unknown;
}

function lineNumbers(p: Point): number[] {
  const arr = Array.isArray(p.lines) ? p.lines : p.line !== undefined ? [p.line] : [];
  return arr.filter((n): n is number => typeof n === 'number');
}

function PointList({ taskId, items }: { taskId: string; items: Point[] }) {
  const t = useTranslations('hrStage1.review');
  return (
    <ul className="grid gap-1.5">
      {items.map((p, i) => (
        <li key={i} className="text-sm">
          {String(p.text ?? p.comment ?? '')}{' '}
          {lineNumbers(p).map((n) => (
            <a
              key={n}
              href={`#${lineAnchor(taskId, n)}`}
              className="mr-1 inline-flex min-h-6 items-center rounded bg-surface-2 px-1.5 text-xs font-medium underline-offset-2 hover:underline"
            >
              {t('line', { n })}
            </a>
          ))}
        </li>
      ))}
    </ul>
  );
}

/** Strengths and weaknesses with links to the code lines they talk about. */
export function ReviewSection({ task }: { task: TaskReport }) {
  const t = useTranslations('hrStage1.review');
  const r = task.review;
  if (!r) return <p className="text-sm text-muted">{t('none')}</p>;
  const strengths = r.strengths as Point[];
  const weaknesses = r.weaknesses as Point[];
  const findings = r.findings as Point[];
  return (
    <div className="grid gap-3">
      <p className="tabular-nums text-sm">
        {t('score')}: <strong>{r.score_percent == null ? '—' : `${r.score_percent}%`}</strong>
        {r.status === 'needs_review' ? ` · ${t('needsReview')}` : ''}
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h4 className="text-sm font-semibold">{t('strengths')}</h4>
          {strengths.length ? (
            <PointList taskId={task.id} items={strengths} />
          ) : (
            <p className="text-sm text-muted">—</p>
          )}
        </div>
        <div>
          <h4 className="text-sm font-semibold">{t('weaknesses')}</h4>
          {weaknesses.length ? (
            <PointList taskId={task.id} items={weaknesses} />
          ) : (
            <p className="text-sm text-muted">—</p>
          )}
        </div>
      </div>
      {findings.length ? (
        <div>
          <h4 className="text-sm font-semibold">{t('findings')}</h4>
          <PointList taskId={task.id} items={findings} />
        </div>
      ) : null}
      {r.criteria.length ? (
        <details>
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
            {t('criteria')}
          </summary>
          <ul className="grid gap-1.5 text-sm">
            {r.criteria.map((c) => (
              <li key={c.key}>
                <span className="font-medium">{c.key}</span>{' '}
                <span className="tabular-nums">
                  {c.score}/{c.max_score}
                </span>
                : {c.rationale}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {r.rationale ? <p className="max-w-prose text-sm text-muted">{r.rationale}</p> : null}
    </div>
  );
}
