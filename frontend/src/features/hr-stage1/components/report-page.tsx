'use client';

import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { NeedsCompany, useActiveCompany } from '@/features/companies';
import { ReplayPlayer } from '@/features/hr-replay';
import { Link } from '@/i18n/navigation';
import { ApiError } from '@/lib/api';
import { useErrorText } from '@/lib/forms';
import { useStage1Report } from '../api';
import { CodeSection } from './code-section';
import { ReviewSection } from './review-section';
import { ScoresSection } from './scores-section';
import { SuspicionSection } from './suspicion-section';

/** HR Stage 1 report, in the order of spec §8: suspicion → scores → strengths → replay → code. */
export function Stage1ReportPage({ applicationId }: { applicationId: string }) {
  const { active } = useActiveCompany();
  if (!active) return <NeedsCompany />;
  return <Report companyId={active.id} applicationId={applicationId} />;
}

function Report({ companyId, applicationId }: { companyId: string; applicationId: string }) {
  const t = useTranslations('hrStage1');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const query = useStage1Report(companyId, applicationId);
  const [taskId, setTaskId] = useState<string | null>(null);

  const back = (
    <Link
      href="/hr/candidates"
      className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted hover:text-fg"
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      {t('back')}
    </Link>
  );

  if (query.error instanceof ApiError && query.error.status === 404) {
    return (
      <div className="grid gap-3">
        {back}
        <EmptyState headingLevel={1} title={t('notStarted')} description={t('notStartedBody')} />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="grid gap-3">
        {back}
        <ErrorState
          headingLevel={1}
          title={errorText(query.error)}
          onRetry={() => query.refetch()}
          retryLabel={tc('retry')}
        />
      </div>
    );
  }
  if (!query.data) {
    return (
      <div className="grid gap-4" aria-hidden="true">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const report = query.data;
  const current = report.tasks.find((x) => x.id === taskId) ?? report.tasks[0];

  return (
    <div className="grid max-w-5xl gap-5">
      <div>
        {back}
        <h1 className="mt-1 text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted">{t(`status.${report.status}`)}</p>
      </div>

      <SuspicionSection report={report} />
      <ScoresSection report={report} />

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
    </div>
  );
}
