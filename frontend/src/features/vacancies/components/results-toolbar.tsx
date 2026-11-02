'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useId } from 'react';
import { NativeSelect } from '@/components/ui/native-select';
import { formatAmount } from '@/lib/money';
import { SORTS, updateFilters, type VacancyFilters, type VacancySort } from '../model';

/** "N ta vakansiya «q»" heading (the page h1) + sort select. */
export function ResultsHeading({ total, q }: { total: number | null; q: string }) {
  const t = useTranslations('vacancies');
  const locale = useLocale();
  if (total === null) return <h1 className="text-2xl font-semibold">{t('title')}</h1>;
  const count = formatAmount(total, locale);
  return (
    <h1 className="text-xl leading-tight font-semibold sm:text-2xl" aria-live="polite">
      {q ? t('countFor', { total, count, q }) : t('count', { total, count })}
    </h1>
  );
}

export function SortSelect({
  filters,
  onChange,
}: {
  filters: VacancyFilters;
  onChange: (next: VacancyFilters) => void;
}) {
  const t = useTranslations('vacancies.sort');
  const id = useId();
  // API default: relevance with a text query, otherwise date.
  const value: VacancySort = filters.sort ?? (filters.q ? 'relevance' : 'date');
  return (
    <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:flex-none">
      <label htmlFor={id} className="shrink-0 text-sm text-muted max-sm:sr-only">
        {t('label')}
      </label>
      <NativeSelect
        id={id}
        value={value}
        className="min-w-0 flex-1 sm:w-52 sm:flex-none"
        onChange={(e) => onChange(updateFilters(filters, { sort: e.target.value as VacancySort }))}
      >
        {SORTS.filter((s) => s !== 'relevance' || filters.q).map((s) => (
          <option key={s} value={s}>
            {t(s)}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
