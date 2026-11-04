'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ReplayPlayer } from '@/features/hr-replay';
import type { Stage1Report } from '../model';
import { CodeSection } from './code-section';
import { ReviewSection } from './review-section';

/** Per-task code review, replay player and final code with test results (spec §8 item 5). */
export function Stage1Detail({
  report,
  companyId,
  applicationId,
}: {
  report: Stage1Report;
  companyId: string;
  applicationId: string;
}) {
  const t = useTranslations('hrStage1');
  const [taskId, setTaskId] = useState<string | null>(null);
  const current = report.tasks.find((x) => x.id === taskId) ?? report.tasks[0];

  // Every task was covered by verified skills: nothing was solved here, so no review, replay or code.
  if (!current) {
    return (
      <section
        aria-labelledby="sw-h"
        className="grid gap-2 rounded-xl border border-border p-4 sm:p-5"
      >
        <h2 id="sw-h" className="text-lg font-semibold">
          {t('reviewTitle')}
        </h2>
        <p className="max-w-prose text-sm text-muted">{t('noTasks')}</p>
      </section>
    );
  }

  return (
    <>
      <section
        aria-labelledby="sw-h"
        className="grid gap-4 rounded-xl border border-border p-4 sm:p-5"
      >
        <h2 id="sw-h" className="text-lg font-semibold">
          {t('reviewTitle')}
        </h2>
        {report.tasks.map((task) => (
          <div key={task.id} className="grid gap-2">
            <h3 className="font-semibold">{task.title}</h3>
            <ReviewSection task={task} />
          </div>
        ))}
      </section>

      <section
        aria-labelledby="replay-h"
        className="grid gap-3 rounded-xl border border-border p-4 sm:p-5"
      >
        <h2 id="replay-h" className="text-lg font-semibold">
          {t('replayTitle')}
        </h2>
        {report.tasks.length > 1 ? (
          <div role="tablist" aria-label={t('tasksLabel')} className="flex flex-wrap gap-1">
            {report.tasks.map((task, i) => (
              <button
                key={task.id}
                role="tab"
                aria-selected={task.id === current?.id}
                onClick={() => setTaskId(task.id)}
                className={`min-h-11 rounded-lg border px-3 text-sm ${task.id === current?.id ? 'border-accent bg-accent-soft font-medium' : 'border-border'}`}
              >
                {i + 1}. {task.title}
              </button>
            ))}
          </div>
        ) : null}
        {current ? (
          <ReplayPlayer companyId={companyId} applicationId={applicationId} taskId={current.id} />
        ) : null}
      </section>

      <section
        aria-labelledby="code-h"
        className="grid gap-4 rounded-xl border border-border p-4 sm:p-5"
      >
        <h2 id="code-h" className="text-lg font-semibold">
          {t('codeTitle')}
        </h2>
        {report.tasks.map((task) => (
          <div key={task.id} className="grid gap-2">
            <h3 className="font-semibold">{task.title}</h3>
            <CodeSection task={task} />
          </div>
        ))}
      </section>
    </>
  );
}
