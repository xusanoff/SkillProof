import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { VacancyListSkeleton, VacancySearch } from '@/features/vacancies';
import { parseFilters } from '@/features/vacancies/model';
import { fetchVacancyPage } from '@/features/vacancies/server';

export async function generateMetadata({
  searchParams,
}: PageProps<'/[locale]/vacancies'>): Promise<Metadata> {
  const t = await getTranslations('vacancies');
  const { q } = parseFilters(await searchParams);
  return { title: q ? t('metaTitleFor', { q }) : t('title') };
}

/** hh-style results page. The first page is rendered on the server (SEO), then the client takes over. */
export default function Page({ searchParams }: PageProps<'/[locale]/vacancies'>) {
  return (
    <Suspense fallback={<SearchFallback />}>
      <Results searchParams={searchParams} />
    </Suspense>
  );
}

async function Results({ searchParams }: Pick<PageProps<'/[locale]/vacancies'>, 'searchParams'>) {
  const locale = await getLocale();
  const filters = parseFilters(await searchParams);
  const first = await fetchVacancyPage(locale, filters);
  // Unreachable API / 5xx: the client query retries in the browser and shows its own states.
  return <VacancySearch initial={first.ok ? first.data : null} />;
}

function SearchFallback() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:py-8">
      <div className="h-8 w-56 animate-pulse rounded-md bg-surface-2" />
      <div className="mt-5 grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-8">
        <div className="hidden lg:block" />
        <VacancyListSkeleton />
      </div>
    </div>
  );
}
