'use client';

import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorState } from '@/components/common/error-state';
import { Notice } from '@/components/common/notice';
import { Skeleton } from '@/components/ui/skeleton';
import { NeedsCompany, useActiveCompany } from '@/features/companies';
import { useHrVacancy } from '@/features/hr-vacancies';
import { Link } from '@/i18n/navigation';
import { useErrorText } from '@/lib/forms';
import { useAssessment } from '../api';
import { AssessmentForm } from './assessment-form';
import { GeneratePanel } from './generate-panel';
import { ReadinessPanel } from './readiness-panel';

/** Assessment page of one vacancy. `GET` 404 = nothing saved yet → empty form. */
export function AssessmentEditor({ vacancyId }: { vacancyId: string }) {
  const { active } = useActiveCompany();
  if (!active) return <NeedsCompany />;
  return <Editor companyId={active.id} vacancyId={vacancyId} />;
}

function Editor({ companyId, vacancyId }: { companyId: string; vacancyId: string }) {
  const t = useTranslations('hrAssessment');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const vacancy = useHrVacancy(companyId, vacancyId);
  const assessment = useAssessment(companyId, vacancyId);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="grid max-w-4xl gap-5">
      <div>
        <Link
          href="/hr/vacancies"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted hover:text-fg"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {t('back')}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{t('title')}</h1>
        {vacancy.data ? <p className="text-muted">{vacancy.data.title}</p> : null}
      </div>

      <div aria-live="polite" className="empty:hidden">
        {notice ? (
          <Notice tone="success" role="status">
            {notice}
          </Notice>
        ) : null}
      </div>

      {assessment.isError ? (
        <ErrorState
          title={errorText(assessment.error)}
          onRetry={() => assessment.refetch()}
          retryLabel={tc('retry')}
          retrying={assessment.isFetching}
        />
      ) : assessment.data === undefined ? (
        <div className="grid gap-3" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <ReadinessPanel assessment={assessment.data} />
          <GeneratePanel
            companyId={companyId}
            vacancyId={vacancyId}
            autoApprove={assessment.data?.auto_approve_ai_items ?? false}
          />
          {/* Remounts with fresh defaults when the server copy changes (save / generation). */}
          <AssessmentForm
            key={assessment.data?.updated_at ?? 'new'}
            companyId={companyId}
            vacancyId={vacancyId}
            assessment={assessment.data}
            onSaved={setNotice}
          />
        </>
      )}
    </div>
  );
}
