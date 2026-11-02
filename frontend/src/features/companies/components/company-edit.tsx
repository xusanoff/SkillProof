'use client';

import { useTranslations } from 'next-intl';
import { ErrorState } from '@/components/common/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useErrorText } from '@/lib/forms';
import { useCompany, useUpdateCompany } from '../api';
import { useActiveCompany } from '../active-company';
import { toCompanyValues, type Company } from '../model';
import { CompanyForm } from './company-form';
import { LogoUpload } from './logo-upload';
import { NeedsCompany } from './needs-company';

export function CompanyEdit() {
  const { active } = useActiveCompany();
  if (!active) return <NeedsCompany />;
  return <CompanyEditLoaded id={active.id} />;
}

function CompanyEditLoaded({ id }: { id: string }) {
  const t = useTranslations('hr.company');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const company = useCompany(id);

  return (
    <div className="grid gap-8">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="mt-2 max-w-prose text-muted">{t('lead')}</p>
      </div>
      {company.isPending ? (
        <div className="grid gap-4" aria-hidden="true">
          <Skeleton className="h-20 w-64" />
          <Skeleton className="h-80" />
        </div>
      ) : company.isError ? (
        <ErrorState
          title={errorText(company.error)}
          onRetry={() => company.refetch()}
          retryLabel={tc('retry')}
          retrying={company.isFetching}
        />
      ) : (
        // key: reset the form when switching companies.
        <Loaded key={company.data.id} company={company.data} />
      )}
    </div>
  );
}

function Loaded({ company }: { company: Company }) {
  const t = useTranslations('hr.company');
  const tc = useTranslations('common');
  const update = useUpdateCompany(company.id);
  return (
    <>
      <LogoUpload company={company} />
      <section
        aria-labelledby="company-details-title"
        className="grid gap-4 border-t border-border pt-8"
      >
        <h2 id="company-details-title" className="text-lg font-semibold">
          {t('details')}
        </h2>
        <CompanyForm
          defaultValues={toCompanyValues(company)}
          mutation={update}
          submitLabel={tc('save')}
          pendingLabel={tc('saving')}
          confirmSaved
        />
      </section>
    </>
  );
}
