import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ErrorState } from '@/components/common/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { CompanyProfile } from '@/features/companies';
import { CompanyVacancies } from '@/features/vacancies';
import { parseFilters } from '@/features/vacancies/model';
import { fetchCompany, fetchCompanyVacancies, isSafeId } from '@/features/vacancies/server';

type Props = PageProps<'/[locale]/companies/[slug]'>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const t = await getTranslations('companyPage');
  if (!isSafeId(slug)) return { title: t('metaFallback') };
  const res = await fetchCompany(await getLocale(), slug);
  return res.ok
    ? {
        title: t('metaTitle', { name: res.data.name }),
        description: res.data.description?.slice(0, 160),
      }
    : { title: t('metaFallback') };
}

export default function Page({ params, searchParams }: Props) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:py-10">
      <Suspense fallback={<CompanySkeleton />}>
        <Company params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Company({ params, searchParams }: Pick<Props, 'params' | 'searchParams'>) {
  const { slug } = await params;
  if (!isSafeId(slug)) notFound();
  const locale = await getLocale();
  const { page } = parseFilters(await searchParams);
  const [company, vacancies] = await Promise.all([
    fetchCompany(locale, slug),
    fetchCompanyVacancies(locale, slug, page),
  ]);
  if (!company.ok) {
    if (company.status === 404) notFound();
    const t = await getTranslations('errors');
    return (
      <ErrorState
        headingLevel={1}
        title={t(company.status === 0 ? 'upstream_unavailable' : 'internal_error')}
      />
    );
  }
  return (
    <div className="grid gap-8">
      <CompanyProfile company={company.data} />
      <CompanyVacancies slug={slug} page={page} initial={vacancies.ok ? vacancies.data : null} />
    </div>
  );
}

function CompanySkeleton() {
  return (
    <div className="grid gap-4" aria-hidden="true">
      <div className="flex items-center gap-4">
        <Skeleton className="size-20" />
        <Skeleton className="h-8 w-64" />
      </div>
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
