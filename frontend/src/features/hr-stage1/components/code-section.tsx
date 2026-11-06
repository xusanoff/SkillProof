'use client';

import { CircleAlert, CircleCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { lineAnchor, type TaskReport } from '../model';

type Result = TaskReport['visible_results'][number];

function Results({ title, items }: { title: string; items: Result[] }) {
  const t = useTranslations('hrStage1.code');
  const passed = items.filter((r) => r.passed).length;
  return (
    <div>
      <h4 className="tabular-nums text-sm font-semibold">
        {title}: {passed} / {items.length}
      </h4>
      <ul className="mt-1 grid gap-1 text-sm">
        {items.map((r, i) => (
          <li key={i} className="flex items-center gap-2">
            {r.passed ? (
              <CircleCheck aria-hidden="true" className="size-4 text-success" />
            ) : (
              <CircleAlert aria-hidden="true" className="size-4 text-danger" />
            )}
            <span>{r.name}</span>
            <span className="text-muted">{t(`status.${r.status as 'passed'}`)}</span>
            <span className="ml-auto tabular-nums text-xs text-muted">{r.time_ms} ms</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Final code with numbered lines (review links jump here) and the test results. */
export function CodeSection({ task }: { task: TaskReport }) {
  const t = useTranslations('hrStage1.code');
  const lines = task.final_code.split('\n');
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted">
        {task.language} · {t('runs', { count: task.run_count })}
      </p>
      <ol
        tabIndex={0}
        aria-label={t('finalCode')}
        className="overflow-x-auto rounded-lg border border-border bg-surface-2 py-2 font-mono text-sm"
      >
        {lines.map((line, i) => (
          <li
            key={i}
            id={lineAnchor(task.id, i + 1)}
            className="grid grid-cols-[3rem_1fr] target:bg-warning-soft"
          >
            <span
              aria-hidden="true"
              className="pr-3 text-right tabular-nums text-muted select-none"
            >
              {i + 1}
            </span>
            <code className="whitespace-pre">{line || ' '}</code>
          </li>
        ))}
      </ol>
      <div className="grid gap-4 md:grid-cols-2">
        <Results title={t('visible')} items={task.visible_results} />
        <Results title={t('hidden')} items={task.hidden_results} />
      </div>
    </div>
  );
}
