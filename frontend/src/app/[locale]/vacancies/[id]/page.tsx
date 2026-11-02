import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import {
  VacancyDetailFallback,
  VacancyDetailSkeleton,
  VacancyDetailView,
} from '@/features/vacancies';
import { fetchVacancy, isSafeId } from '@/features/vacancies/server';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/vacancies/[id]'>): Promise<Metadata> {
  const { id } = await params;
  const t = await getTranslations('vacancy');
  if (!isSafeId(id)) return { title: t('metaFallback') };
  const res = await fetchVacancy(await getLocale(), id);
  if (!res.ok) return { title: t('metaFallback') };
  const v = res.data;
  return {
    title: t('metaTitle', { title: v.title, company: v.company.name }),
    description: v.description.slice(0, 160),
    robots: v.status === 'published' ? undefined : { index: false },
  };
}

export default function Page({ params }: PageProps<'/[locale]/vacancies/[id]'>) {
  return (
    <Suspense fallback={<VacancyDetailSkeleton />}>
      <Detail params={params} />
    </Suspense>
  );
}

async function Detail({ params }: Pick<PageProps<'/[locale]/vacancies/[id]'>, 'params'>) {
  const { id } = await params;
  if (!isSafeId(id)) notFound();
  const res = await fetchVacancy(await getLocale(), id);
  if (res.ok) return <VacancyDetailView vacancy={res.data} />;
  if (res.status === 404 || res.status === 422) notFound();
  // API unreachable from the server: let the browser try (and show its own states).
  return <VacancyDetailFallback id={id} />;
}
