'use client';

import { ArrowLeft, LoaderCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Avatar } from '@/components/common/design';
import { ApplicationStatusBadge } from '@/components/common/application-status-badge';
import { ErrorState } from '@/components/common/error-state';
import { Notice } from '@/components/common/notice';
import { Skeleton } from '@/components/ui/skeleton';
import { NeedsCompany, useActiveCompany } from '@/features/companies';
import { Stage1Detail, useStage1Report } from '@/features/hr-stage1';
import { Link } from '@/i18n/navigation';
import { ApiError } from '@/lib/api';
import { useErrorText } from '@/lib/forms';
import { useHrReport } from '../api';
import { reportPhase } from '../model';
import { ActionsPanel } from './actions-panel';
import { PointsSection } from './points-section';
import { RecommendationSection } from './recommendation-section';
import { ScoresSection } from './scores-section';
import { Stage2Section } from './stage2-section';
import { SuspicionSection } from './suspicion-section';

/** HR candidate report: score overview, integrity evidence, strengths/gaps, recommendation, replay and Stage 2. */
export function HrReportPage({ applicationId }: { applicationId: string }) {
  const { active } = useActiveCompany();
  if (!active) return <NeedsCompany />;
  return <Report companyId={active.id} applicationId={applicationId} />;
}

function Report({ companyId, applicationId }: { companyId: string; applicationId: string }) {
  const t = useTranslations('hrReport');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const query = useHrReport(companyId, applicationId);
  const stage1 = useStage1Report(companyId, applicationId);

  const back = (
    <Link
      href="/hr/candidates"
      className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted hover:text-fg"
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      {t('back')}
    </Link>
  );

  if (query.isError && !query.data) {
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
  const phase = reportPhase(report);
  // 404 = Stage 1 never started: that section is simply not there.
  const stage1Missing = stage1.error instanceof ApiError && stage1.error.status === 404;

  return (
    <div className="grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-5">
      <div className="sp-card p-5 sm:p-6">
        {back}
        <Avatar name={report.candidate_name} className="mt-3 mb-3 size-14 text-xl" />
        <h1 className="sp-page-title mt-1">{report.candidate_name}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
          <span>{report.vacancy_title}</span>
          <ApplicationStatusBadge status={report.status} />
        </div>
      </div>

      {phase === 'evaluating' ? (
        <Notice tone="info" role="status" title={t('evaluating.title')}>
          <span className="flex items-center gap-2">
            <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />
            {t('evaluating.body')}
          </span>
        </Notice>
      ) : null}
      {phase === 'failed' ? (
        <Notice tone="danger" role="alert" title={t('failed.title')}>
          {t('failed.body')}
        </Notice>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
          <ScoresSection report={report} />
          <SuspicionSection report={report} />
          {phase === 'ready' ? <PointsSection report={report} /> : null}
          {phase === 'ready' ? <RecommendationSection report={report} /> : null}
          {stage1.data && !stage1Missing ? (
            <Stage1Detail
              report={stage1.data}
              companyId={companyId}
              applicationId={applicationId}
            />
          ) : null}
          {report.stage2 ? (
            <Stage2Section
              stage2={report.stage2}
              companyId={companyId}
              applicationId={applicationId}
            />
          ) : null}
        </div>
        <ActionsPanel report={report} companyId={companyId} />
      </div>
    </div>
  );
}
