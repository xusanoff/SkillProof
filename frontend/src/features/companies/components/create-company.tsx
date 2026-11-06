'use client';

import { useTranslations } from 'next-intl';
import { useCreateCompany } from '../api';
import { useActiveCompany } from '../active-company';
import { emptyCompanyValues } from '../model';
import { CompanyForm } from './company-form';

/** `/hr` when the HR user has no company yet. The creator becomes owner (API). */
export function CreateCompany() {
  const t = useTranslations('hr.create');
  const create = useCreateCompany();
  const { select } = useActiveCompany();

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="sp-page-title">{t('title')}</h1>
      <p className="mt-2 max-w-prose text-muted">{t('lead')}</p>
      <div className="mt-8">
        <CompanyForm
          defaultValues={emptyCompanyValues}
          mutation={create}
          submitLabel={t('submit')}
          pendingLabel={t('submitting')}
          onSaved={(company) => select(company.id)}
        />
      </div>
    </div>
  );
}
