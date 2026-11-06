'use client';

import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { NeedsCompany, useActiveCompany } from '@/features/companies';
import { Link } from '@/i18n/navigation';
import { ApiError } from '@/lib/api';
import { useErrorText } from '@/lib/forms';
import { useStage1Report } from '../api';
import { ScoresSection } from './scores-section';
import { Stage1Detail } from './stage1-detail';
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
  return (
    <div className="grid max-w-5xl gap-5">
      <div>
        {back}
        <h1 className="sp-page-title mt-1">{t('title')}</h1>
        <p className="text-sm text-muted">{t(`status.${report.status}`)}</p>
      </div>

      <SuspicionSection report={report} />
      <ScoresSection report={report} />

      <Stage1Detail report={report} companyId={companyId} applicationId={applicationId} />
    </div>
  );
}
