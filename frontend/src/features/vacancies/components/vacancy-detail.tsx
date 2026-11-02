'use client';

import {
  BadgeCheck,
  Briefcase,
  Clock,
  GraduationCap,
  MapPin,
  MonitorSmartphone,
} from 'lucide-react';
import { useLocale, useTimeZone, useTranslations } from 'next-intl';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { ErrorState } from '@/components/common/error-state';
import { PlainText } from '@/components/common/plain-text';
import { Salary } from '@/components/common/salary';
import { Notice } from '@/components/common/notice';
import { Skeleton } from '@/components/ui/skeleton';
import { useRegionLabel } from '@/features/catalog';
import { CompanyLogo } from '@/features/companies';
import { Link } from '@/i18n/navigation';
import { ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format-locale';
import { useErrorText } from '@/lib/forms';
import { useCompanyVacancies, useVacancy } from '../api';
import type { VacancyDetail } from '../model';
import { SimilarVacancies } from './similar-vacancies';
import { VacancyApply } from './vacancy-apply';

/**
 * hh-style vacancy page: main column (title, salary, conditions, skills, text) and a
 * sticky right column (company + apply). Rendered on the server for SEO; interactive
 * pieces are client leaves. Text from HR is plain text (no HTML).
 */
export function VacancyDetailView({ vacancy: v }: { vacancy: VacancyDetail }) {
  const t = useTranslations('vacancy');
  const locale = useLocale();
  const timeZone = useTimeZone();
  const regionLabel = useRegionLabel();
  const place = [v.city, regionLabel(v.region_code)].filter(Boolean).join(', ');
  const open = v.status === 'published';
  const required = v.skills.filter((s) => s.is_required);
  const optional = v.skills.filter((s) => !s.is_required);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-5 pb-28 sm:px-6 lg:pt-8 lg:pb-12">
      <Link
        href="/vacancies"
        className="inline-flex min-h-11 items-center text-sm text-muted hover:text-fg"
      >
        {t('backToSearch')}
      </Link>
      <div className="mt-2 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-10">
        <article className="min-w-0 rounded-xl border border-border bg-surface p-5 sm:p-7">
          {!open ? (
            <Notice tone="warning" className="mb-5">
              {t('closedNotice')}
            </Notice>
          ) : null}
          <h1 className="text-2xl leading-tight font-semibold text-balance sm:text-3xl">
            {v.title}
          </h1>
          <Salary
            min={v.salary_min}
            max={v.salary_max}
            currency={v.currency}
            className="mt-3 text-xl"
          />
          <dl className="mt-5 grid gap-2 text-sm">
            <Line icon={GraduationCap} label={t('experienceLabel')}>
              {t(`experience.${v.experience_level}`)}
            </Line>
            <Line icon={Briefcase} label={t('employmentLabel')}>
              {t(`employmentType.${v.employment_type}`)}
            </Line>
            <Line icon={MonitorSmartphone} label={t('remoteLabel')}>
              {t(`remoteType.${v.remote_type}`)}
            </Line>
            {place ? (
              <Line icon={MapPin} label={t('placeLabel')}>
                {place}
              </Line>
            ) : null}
          </dl>

          {v.skills.length ? (
            <section aria-labelledby="skills-title" className="mt-7">
              <h2 id="skills-title" className="text-lg font-semibold">
                {t('skillsTitle')}
              </h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {[...required, ...optional].map((s) => (
                  <li
                    key={s.id}
                    className={
                      s.is_required
                        ? 'rounded-md border border-accent/30 bg-accent-soft px-2.5 py-1 text-sm font-medium'
                        : 'rounded-md border border-border px-2.5 py-1 text-sm'
                    }
                  >
                    {s.name}
                    {s.is_required ? (
                      <span className="sr-only">{` (${t('required')})`}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
              {required.length ? (
                <p className="mt-2 text-xs text-muted">{t('requiredHint')}</p>
              ) : null}
            </section>
          ) : null}

          {v.description ? (
            <section aria-labelledby="description-title" className="mt-7">
              <h2 id="description-title" className="text-lg font-semibold">
                {t('descriptionTitle')}
              </h2>
              <PlainText text={v.description} className="mt-3" />
            </section>
          ) : null}
          {v.requirements ? (
            <section aria-labelledby="requirements-title" className="mt-7">
              <h2 id="requirements-title" className="text-lg font-semibold">
                {t('requirementsTitle')}
              </h2>
              <PlainText text={v.requirements} className="mt-3" />
            </section>
          ) : null}

          {v.published_at ? (
            <p className="mt-8 flex items-center gap-1.5 border-t border-border pt-4 text-sm text-muted">
              <Clock aria-hidden="true" className="size-4" />
              {t('publishedOn', { date: formatDate(v.published_at, locale, timeZone) })}
            </p>
          ) : null}
        </article>

        <aside className="grid content-start gap-4 lg:sticky lg:top-24 lg:self-start">
          <CompanyBox vacancy={v} />
          <VacancyApply vacancy={v} />
        </aside>
      </div>
      <SimilarVacancies vacancy={v} />
    </div>
  );
}

function Line({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof MapPin;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted" />
      <dt className="text-muted">{label}:</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

function CompanyBox({ vacancy: v }: { vacancy: VacancyDetail }) {
  const t = useTranslations('vacancy');
  const count = useCompanyVacancies(v.company.slug, 1);
  return (
    <section
      aria-label={t('companyLabel')}
      className="rounded-xl border border-border bg-surface p-5"
    >
      <div className="flex items-center gap-3">
        <CompanyLogo logoUrl={v.company.logo_url} name={v.company.name} size={56} />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-semibold">
            <Link
              href={`/companies/${v.company.slug}`}
              className="truncate underline-offset-4 hover:underline"
            >
              {v.company.name}
            </Link>
            {v.company.is_verified ? (
              <BadgeCheck
                aria-label={t('verified')}
                role="img"
                className="size-4 shrink-0 text-accent"
              />
            ) : null}
          </p>
          {v.company.is_verified ? <p className="text-xs text-muted">{t('verified')}</p> : null}
        </div>
      </div>
      <Link
        href={`/companies/${v.company.slug}`}
        className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline"
      >
        {count.data ? t('companyVacancies', { count: count.data.total }) : t('toCompany')}
      </Link>
    </section>
  );
}

/** Used when the server could not reach the API: the browser loads the vacancy itself. */
export function VacancyDetailFallback({ id }: { id: string }) {
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const query = useVacancy(id);
  if (query.data) return <VacancyDetailView vacancy={query.data} />;
  if (query.error instanceof ApiError && query.error.status === 404) notFound();
  if (query.isError) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <ErrorState
          headingLevel={1}
          title={errorText(query.error)}
          onRetry={() => query.refetch()}
          retryLabel={tc('retry')}
          retrying={query.isFetching}
        />
      </div>
    );
  }
  return <VacancyDetailSkeleton />;
}

export function VacancyDetailSkeleton() {
  return (
    <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 pt-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid gap-3 rounded-xl border border-border bg-surface p-7" aria-hidden="true">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-7 w-1/3" />
        <Skeleton className="mt-3 h-4 w-1/2" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="mt-6 h-40 w-full" />
      </div>
      <Skeleton className="hidden h-48 lg:block" />
    </div>
  );
}
