'use client';

import { SearchForm } from '@/features/search';
import { SearchX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { Pagination } from '@/components/common/pagination';
import { Button } from '@/components/ui/button';
import { useErrorText } from '@/lib/forms';
import { cn } from '@/lib/utils';
import { useVacancyList, type InitialPage } from '../api';
import {
  countActive,
  EMPTY_FILTERS,
  filtersToSearchParams,
  pageCount,
  resetFilters,
  updateFilters,
  type VacancyFilters,
} from '../model';
import { useUrlFilters } from '../use-filters';
import { ActiveFilters } from './active-filters';
import { FilterSheet } from './filter-sheet';
import { FiltersPanel } from './filters-panel';
import { ResultsHeading, SortSelect } from './results-toolbar';
import { VacancyCard } from './vacancy-card';
import { VacancyListSkeleton } from './vacancy-list-skeleton';

/**
 * `/vacancies` (hh "Вакансии"): heading with count + sort, filter column (desktop) or
 * sheet (phone), active chips, cards, numbered pages. The first page comes from the
 * server (`initial`); later changes are client-side.
 */
export function VacancySearch({ initial }: { initial: InitialPage | null }) {
  const t = useTranslations('vacancies');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const { filters, navigate } = useUrlFilters();
  const list = useVacancyList(filters, { initial });
  const data = list.data;
  const change = (next: VacancyFilters) => navigate(next);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:py-8">
      <SearchForm idPrefix="vacancy-search" size="lg" className="sp-card mb-7 p-3" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <ResultsHeading total={data ? data.total : null} q={filters.q} />
        <div className="flex w-full items-center justify-between gap-2 sm:w-auto">
          <div className="lg:hidden">
            <FilterSheet filters={filters} onApply={change} />
          </div>
          <SortSelect filters={filters} onChange={change} />
        </div>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-8">
        <aside aria-label={t('filters.title')} className="sp-card hidden self-start p-5 lg:block">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">{t('filters.title')}</h2>
            {countActive(filters) ? (
              <button
                type="button"
                onClick={() => change(resetFilters(filters))}
                className="min-h-9 text-sm font-medium text-accent hover:underline"
              >
                {t('filters.reset')}
              </button>
            ) : null}
          </div>
          <div className="mt-4">
            <FiltersPanel
              filters={filters}
              facets={data?.facets}
              onChange={change}
              idPrefix="side-filters"
            />
          </div>
        </aside>

        <section aria-label={t('resultsLabel')} className="grid min-w-0 content-start gap-4">
          <ActiveFilters filters={filters} onChange={change} />

          {list.isError && !data ? (
            <ErrorState
              title={errorText(list.error)}
              onRetry={() => list.refetch()}
              retryLabel={tc('retry')}
              retrying={list.isFetching}
            />
          ) : !data ? (
            <VacancyListSkeleton />
          ) : data.items.length === 0 ? (
            <NoResults filters={filters} onChange={change} />
          ) : (
            <>
              <ul
                className={cn(
                  'grid gap-3 transition-opacity',
                  list.isPlaceholderData && 'opacity-60',
                )}
                aria-busy={list.isFetching || undefined}
              >
                {data.items.map((v) => (
                  <li key={v.id}>
                    <VacancyCard vacancy={v} />
                  </li>
                ))}
              </ul>
              <Pagination
                className="mt-4"
                page={filters.page}
                totalPages={pageCount(data.total, data.page_size)}
                pathname="/vacancies"
                query={filtersToSearchParams(filters).toString()}
                onPageChange={(page) =>
                  navigate(updateFilters(filters, { page }), { scroll: true })
                }
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function NoResults({
  filters,
  onChange,
}: {
  filters: VacancyFilters;
  onChange: (next: VacancyFilters) => void;
}) {
  const t = useTranslations('vacancies.empty');
  const hasFilters = countActive(filters) > 0;
  return (
    <EmptyState
      icon={SearchX}
      title={filters.q ? t('titleFor', { q: filters.q }) : t('title')}
      description={
        <ul className="grid list-disc gap-1 pl-5">
          {filters.q ? <li>{t('tipQuery')}</li> : null}
          {hasFilters ? <li>{t('tipFilters')}</li> : null}
          <li>{t('tipRegion')}</li>
        </ul>
      }
    >
      {hasFilters ? (
        <Button size="lg" className="min-h-11 px-4" onClick={() => onChange(resetFilters(filters))}>
          {t('resetFilters')}
        </Button>
      ) : null}
      {filters.q ? (
        <Button
          variant="outline"
          size="lg"
          className="min-h-11 px-4"
          onClick={() => onChange({ ...EMPTY_FILTERS })}
        >
          {t('showAll')}
        </Button>
      ) : null}
    </EmptyState>
  );
}
