'use client';

import { Heart } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { Pagination } from '@/components/common/pagination';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { useErrorText } from '@/lib/forms';
import { useSavedVacancies } from '../api';
import { pageCount } from '../model';
import { VacancyCard } from './vacancy-card';
import { VacancyListSkeleton } from './vacancy-list-skeleton';

/** "Saqlanganlar": the same cards as the search results. */
export function SavedVacancies() {
  const t = useTranslations('saved');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const page = Math.max(1, Number(useSearchParams().get('page')) || 1);
  const list = useSavedVacancies(page);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:py-10">
      <h1 className="sp-page-title">{t('title')}</h1>
      <p className="mt-1 text-muted">
        {list.data && list.data.total > 0 ? t('count', { count: list.data.total }) : t('lead')}
      </p>
      <div className="mt-6">
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
          <EmptyState icon={Heart} title={t('emptyTitle')} description={t('emptyBody')}>
            <Button asChild size="lg" className="min-h-11 px-4">
              <Link href="/vacancies">{t('findVacancies')}</Link>
            </Button>
          </EmptyState>
        ) : (
          <>
            <ul className="grid gap-3">
              {list.data.items.map((v) => (
                <li key={v.id}>
                  <VacancyCard vacancy={v} />
                </li>
              ))}
            </ul>
            <Pagination
              className="mt-6"
              page={page}
              totalPages={pageCount(list.data.total, list.data.page_size)}
              pathname="/candidate/saved"
            />
          </>
        )}
      </div>
    </div>
  );
}
