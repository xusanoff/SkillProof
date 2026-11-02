'use client';

import { BriefcaseBusiness } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { Pagination } from '@/components/common/pagination';
import { useErrorText } from '@/lib/forms';
import { useCompanyVacancies } from '../api';
import { pageCount, type VacancyPage } from '../model';
import { VacancyCard } from './vacancy-card';
import { VacancyListSkeleton } from './vacancy-list-skeleton';

/** A company's open vacancies, paged (`?page=` → server render of that page). */
export function CompanyVacancies({
  slug,
  page,
  initial,
}: {
  slug: string;
  page: number;
  initial: VacancyPage | null;
}) {
  const t = useTranslations('companyPage');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const list = useCompanyVacancies(slug, page, initial);

  return (
    <section aria-labelledby="company-vacancies" className="grid gap-4">
      <h2 id="company-vacancies" className="text-xl font-semibold">
        {list.data ? t('openVacanciesCount', { count: list.data.total }) : t('openVacancies')}
      </h2>
      {list.isError && !list.data ? (
        <ErrorState
          title={errorText(list.error)}
          onRetry={() => list.refetch()}
          retryLabel={tc('retry')}
          retrying={list.isFetching}
        />
      ) : !list.data ? (
        <VacancyListSkeleton count={3} />
      ) : list.data.items.length === 0 ? (
        <EmptyState icon={BriefcaseBusiness} title={t('noVacancies')} headingLevel={3} />
      ) : (
        <>
          <ul className="grid gap-3">
            {list.data.items.map((v) => (
              <li key={v.id}>
                <VacancyCard vacancy={v} headingLevel={3} showCompany={false} />
              </li>
            ))}
          </ul>
          <Pagination
            page={page}
            totalPages={pageCount(list.data.total, list.data.page_size)}
            pathname={`/companies/${slug}`}
          />
        </>
      )}
    </section>
  );
}
