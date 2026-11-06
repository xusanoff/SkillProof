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
import { useHrVacancy } from '../api';
import { emptyVacancyValues, toVacancyValues } from '../model';
import { VacancyForm } from './vacancy-form';

function Header({ title }: { title: string }) {
  const t = useTranslations('vacancyForm');
  return (
    <div className="mb-6">
      <Link
        href="/hr/vacancies"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted hover:text-fg"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {t('back')}
      </Link>
      <h1 className="sp-page-title mt-1">{title}</h1>
    </div>
  );
}

export function NewVacancy() {
  const t = useTranslations('vacancyForm');
  const { active } = useActiveCompany();
  if (!active) return <NeedsCompany />;
  return (
    <div className="max-w-3xl">
      <Header title={t('titleNew')} />
      <VacancyForm companyId={active.id} defaultValues={emptyVacancyValues} />
    </div>
  );
}

export function EditVacancy({ id }: { id: string }) {
  const { active } = useActiveCompany();
  if (!active) return <NeedsCompany />;
  return <EditLoaded companyId={active.id} id={id} />;
}

function EditLoaded({ companyId, id }: { companyId: string; id: string }) {
  const t = useTranslations('vacancyForm');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const query = useHrVacancy(companyId, id);

  if (query.error instanceof ApiError && query.error.status === 404) {
    return <EmptyState headingLevel={1} title={t('notFound')} />;
  }
  if (query.isError) {
    return (
      <ErrorState
        headingLevel={1}
        title={errorText(query.error)}
        onRetry={() => query.refetch()}
        retryLabel={tc('retry')}
      />
    );
  }
  if (!query.data) {
    return (
      <div className="grid max-w-3xl gap-4" aria-hidden="true">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  return (
    <div className="max-w-3xl">
      <Header title={t('titleEdit')} />
      <p className="-mt-3 mb-5">
        <Link
          href={`/hr/vacancies/${query.data.id}/assessment`}
          className="inline-flex min-h-11 items-center text-sm font-medium text-accent underline-offset-4 hover:underline"
        >
          {t('assessmentLink')}
        </Link>
      </p>
      <VacancyForm
        key={query.data.id}
        companyId={companyId}
        vacancyId={query.data.id}
        status={query.data.status}
        defaultValues={toVacancyValues(query.data)}
      />
    </div>
  );
}
