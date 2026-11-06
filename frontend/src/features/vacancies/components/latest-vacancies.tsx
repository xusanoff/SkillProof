'use client';

import { useTranslations } from 'next-intl';
import { FadeIn } from '@/components/motion';
import { Link } from '@/i18n/navigation';
import { useVacancyList, type InitialPage } from '../api';
import { LATEST_FILTERS, LATEST_COUNT } from '../model';
import { VacancyCard } from './vacancy-card';

/**
 * Home "Yangi vakansiyalar": the latest published vacancies. Server-rendered (`initial`);
 * signed-in candidates re-read them with their saved/applied state.
 */
export function LatestVacancies({ initial }: { initial: InitialPage | null }) {
  const t = useTranslations('vacancies.latest');
  const list = useVacancyList(LATEST_FILTERS, { initial, pageSize: LATEST_COUNT });
  const items = list.data?.items ?? [];
  if (!items.length) return null;
  return (
    <section aria-labelledby="latest-title" className="border-b border-border">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:py-14">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="latest-title" className="font-display text-2xl font-semibold sm:text-3xl">
            {t('title')}
          </h2>
          <Link
            href="/vacancies?sort=date"
            className="inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline"
          >
            {t('all')}
          </Link>
        </div>
        <ul className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((v, i) => (
            <FadeIn as="li" key={v.id} index={i % 2}>
              <VacancyCard vacancy={v} headingLevel={3} className="h-full" />
            </FadeIn>
          ))}
        </ul>
      </div>
    </section>
  );
}
