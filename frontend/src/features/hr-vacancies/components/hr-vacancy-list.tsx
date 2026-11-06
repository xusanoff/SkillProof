'use client';

import { BriefcaseBusiness, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { Notice } from '@/components/common/notice';
import { Pagination } from '@/components/common/pagination';
import { TabLinks } from '@/components/common/tab-links';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useRegionLabel } from '@/features/catalog';
import { NeedsCompany, useActiveCompany } from '@/features/companies';
import { Link } from '@/i18n/navigation';
import { useFormat } from '@/lib/format';
import { useErrorText } from '@/lib/forms';
import { pageCount } from '@/lib/pagination';
import { cn } from '@/lib/utils';
import { useHrVacancies } from '../api';
import { STATUS_TABS, type HrVacancy, type VacancyStatus } from '../model';
import { VacancyActions } from './vacancy-actions';

/** "Vakansiyalarim": status tabs with counts, dense rows, per-status actions. */
export function HrVacancyList() {
  const { active } = useActiveCompany();
  if (!active) return <NeedsCompany />;
  return <List companyId={active.id} />;
}

function List({ companyId }: { companyId: string }) {
  const t = useTranslations('hrVacancies');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const params = useSearchParams();
  const raw = params.get('status');
  const status: VacancyStatus = (STATUS_TABS as readonly string[]).includes(raw ?? '')
    ? (raw as VacancyStatus)
    : 'published';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const list = useHrVacancies(companyId, status, page);
  // Whole-company counts from the API (ignores the status filter).
  const counts = list.data?.counts_by_status;
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="sp-page-title">{t('title')}</h1>
        <Button asChild size="lg" className="min-h-11 gap-2 px-4">
          <Link href="/hr/vacancies/new">
            <Plus aria-hidden="true" />
            {t('post')}
          </Link>
        </Button>
      </div>

      <TabLinks
        label={t('tabsLabel')}
        active={status}
        items={STATUS_TABS.map((s) => ({
          key: s,
          label: t(`tabs.${s}`),
          href: `/hr/vacancies?status=${s}`,
          count: counts ? (counts[s] ?? 0) : null,
        }))}
      />

      <div aria-live="polite" className="empty:hidden">
        {notice ? (
          <Notice tone="success" role="status">
            {notice}
          </Notice>
        ) : null}
      </div>

      {list.isError && !list.data ? (
        <ErrorState
          title={errorText(list.error)}
          onRetry={() => list.refetch()}
          retryLabel={tc('retry')}
          retrying={list.isFetching}
        />
      ) : !list.data ? (
        <div className="grid gap-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : list.data.items.length === 0 ? (
        <EmptyState icon={BriefcaseBusiness} title={t(`empty.${status}`)}>
          {status === 'published' || status === 'draft' ? (
            <Button asChild size="lg" className="min-h-11 px-4">
              <Link href="/hr/vacancies/new">{t('post')}</Link>
            </Button>
          ) : null}
        </EmptyState>
      ) : (
        <>
          <div
            aria-hidden="true"
            className="hidden grid-cols-[minmax(0,1fr)_10rem_9rem_14rem] gap-4 px-4 text-xs font-medium text-muted lg:grid"
          >
            <span>{t('columns.vacancy')}</span>
            <span>{t('columns.applications')}</span>
            <span>{t('columns.updated')}</span>
            <span className="text-right">{t('columns.actions')}</span>
          </div>
          <ul className={cn('grid gap-2', list.isPlaceholderData && 'opacity-60')}>
            {list.data.items.map((v) => (
              <li key={v.id}>
                <Row vacancy={v} companyId={companyId} onDone={setNotice} />
              </li>
            ))}
          </ul>
          <Pagination
            page={page}
            totalPages={pageCount(list.data.total, list.data.page_size)}
            pathname="/hr/vacancies"
            query={`status=${status}`}
          />
        </>
      )}
    </div>
  );
}

function Row({
  vacancy: v,
  companyId,
  onDone,
}: {
  vacancy: HrVacancy;
  companyId: string;
  onDone: (message: string) => void;
}) {
  const t = useTranslations('hrVacancies');
  const format = useFormat();
  const regionLabel = useRegionLabel();
  const place = [v.city, regionLabel(v.region_code)].filter(Boolean).join(', ');

  return (
    <article
      aria-labelledby={`hv-${v.id}`}
      className="sp-card grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_10rem_9rem_14rem] lg:items-center lg:gap-4"
    >
      <div className="min-w-0">
        <h2 id={`hv-${v.id}`} className="font-semibold">
          <Link
            href={v.status === 'archived' ? `/vacancies/${v.id}` : `/hr/vacancies/${v.id}/edit`}
            className="underline-offset-4 hover:underline"
          >
            {v.title}
          </Link>
        </h2>
        <p className="mt-0.5 flex min-w-0 items-center gap-2 text-sm text-muted">
          <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-fg">
            {t(`status.${v.status}`)}
          </span>
          {v.is_hidden ? (
            <span
              className="shrink-0 rounded bg-warning-soft px-1.5 py-0.5 text-xs font-medium text-fg"
              title={v.hidden_reason ?? undefined}
            >
              {t('hiddenByPlatform')}
            </span>
          ) : null}
          {v.has_assessment ? <span className="shrink-0 text-xs">{t('hasAssessment')}</span> : null}
          <span className="truncate">{place || t('noRegion')}</span>
        </p>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted lg:sr-only">{t('columns.applications')}:</span>
        <Link
          href={`/hr/candidates?vacancy=${v.id}`}
          className="tabular-nums font-medium underline-offset-4 hover:underline"
        >
          {t('applicationsCount', { count: v.applications_count })}
        </Link>
        {v.new_applications_count > 0 ? (
          <span className="rounded-full bg-accent px-1.5 tabular-nums text-xs font-semibold text-accent-fg">
            {t('newCount', { count: v.new_applications_count })}
          </span>
        ) : null}
      </div>
      <p className="tabular-nums text-sm text-muted">
        <span className="lg:sr-only">{t('columns.updated')}: </span>
        {format.date(v.updated_at)}
      </p>
      <VacancyActions vacancy={v} companyId={companyId} onDone={onDone} />
    </article>
  );
}
