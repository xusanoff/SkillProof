'use client';

import { ClipboardList } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ApplicationStatusBadge } from '@/components/common/application-status-badge';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { Notice } from '@/components/common/notice';
import { Pagination } from '@/components/common/pagination';
import { Salary } from '@/components/common/salary';
import { TabLinks } from '@/components/common/tab-links';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { canEnterInterview, canViewInterviewResult, entryLabelKey } from '@/features/interview';
import { Link } from '@/i18n/navigation';
import { useFormat } from '@/lib/format';
import { useErrorText } from '@/lib/forms';
import { pageCount } from '@/lib/pagination';
import { cn } from '@/lib/utils';
import { useMyApplications, useWithdraw } from '../api';
import {
  CANDIDATE_TABS,
  canWithdraw,
  parseTab,
  type Application,
  type ApplicationStatus,
} from '../model';

/** "Arizalarim": the candidate's applications with status tabs and withdraw. */
export function CandidateApplications() {
  const t = useTranslations('applications');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const params = useSearchParams();
  const status = parseTab<ApplicationStatus>(params.get('status'), CANDIDATE_TABS);
  const page = Math.max(1, Number(params.get('page')) || 1);
  const list = useMyApplications(status, page);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:py-10">
      <h1 className="text-2xl font-semibold sm:text-3xl">{t('title')}</h1>
      <p className="mt-1 text-muted">{t('lead')}</p>

      <TabLinks
        className="mt-6"
        label={t('tabsLabel')}
        active={status ?? 'all'}
        items={CANDIDATE_TABS.map((s) => ({
          key: s ?? 'all',
          label: t(`tabs.${s ?? 'all'}`),
          href: s ? `/candidate/applications?status=${s}` : '/candidate/applications',
        }))}
      />

      <div aria-live="polite" className="mt-4 empty:hidden">
        {notice ? (
          <Notice tone="success" role="status">
            {notice}
          </Notice>
        ) : null}
      </div>

      <div className="mt-4">
        {list.isError && !list.data ? (
          <ErrorState
            title={errorText(list.error)}
            onRetry={() => list.refetch()}
            retryLabel={tc('retry')}
            retrying={list.isFetching}
          />
        ) : !list.data ? (
          <div className="grid gap-3" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-32 w-full rounded-xl" />
            ))}
          </div>
        ) : list.data.items.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={status ? t('emptyFiltered') : t('emptyTitle')}
            description={status ? undefined : t('emptyBody')}
          >
            <Button asChild size="lg" className="min-h-11 px-4">
              <Link href="/vacancies">{t('findVacancies')}</Link>
            </Button>
          </EmptyState>
        ) : (
          <>
            <ul className={cn('grid gap-3', list.isPlaceholderData && 'opacity-60')}>
              {list.data.items.map((a) => (
                <li key={a.id}>
                  <ApplicationRow application={a} onWithdrawn={() => setNotice(t('withdrawn'))} />
                </li>
              ))}
            </ul>
            <Pagination
              className="mt-6"
              page={page}
              totalPages={pageCount(list.data.total, list.data.page_size)}
              pathname="/candidate/applications"
              query={status ? `status=${status}` : ''}
            />
          </>
        )}
      </div>
    </div>
  );
}

function ApplicationRow({
  application: a,
  onWithdrawn,
}: {
  application: Application;
  onWithdrawn: () => void;
}) {
  const t = useTranslations('applications');
  const tc = useTranslations('common');
  const format = useFormat();
  const errorText = useErrorText();
  const withdraw = useWithdraw();
  const v = a.vacancy;

  return (
    <article
      aria-labelledby={`app-${a.id}`}
      className="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:p-5"
    >
      <div className="min-w-0">
        <h2 id={`app-${a.id}`} className="text-lg leading-snug font-semibold">
          <Link
            href={`/vacancies/${v.id}`}
            className="text-accent underline-offset-4 hover:underline"
          >
            {v.title}
          </Link>
        </h2>
        <p className="mt-1 text-sm">
          <Link
            href={`/companies/${v.company.slug}`}
            className="underline-offset-4 hover:underline"
          >
            {v.company.name}
          </Link>
        </p>
        <Salary
          min={v.salary_min}
          max={v.salary_max}
          currency={v.currency}
          className="mt-1 text-sm"
        />
        {a.cover_note ? (
          <p className="mt-2 line-clamp-2 max-w-prose text-sm text-muted">
            <span className="font-medium text-fg">{t('coverNote')}: </span>
            {a.cover_note}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:flex-col sm:items-end sm:justify-between">
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <ApplicationStatusBadge status={a.status} />
          <p className="text-xs text-muted tabular-nums">
            {t('appliedOn', { date: format.date(a.created_at) })}
          </p>
        </div>
        {canViewInterviewResult(a.status) ? (
          <Button asChild variant="outline" size="lg" className="min-h-11 px-4">
            <Link href={`/candidate/interview/${a.id}`}>{t('interviewResult')}</Link>
          </Button>
        ) : null}
        {canEnterInterview(a.status) ? (
          <Button asChild size="lg" className="min-h-11 px-4">
            <Link href={`/candidate/interview/${a.id}`}>
              {t(entryLabelKey(a.status) === 'resume' ? 'interviewResume' : 'interviewStart')}
            </Link>
          </Button>
        ) : null}
        {canWithdraw(a.status) ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="lg" className="min-h-11 px-3 text-muted">
                {t('withdraw')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogTitle>{t('withdrawTitle')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('withdrawBody', { title: v.title })}
              </AlertDialogDescription>
              {withdraw.isError ? (
                <Notice tone="danger" role="alert">
                  {errorText(withdraw.error)}
                </Notice>
              ) : null}
              <AlertDialogFooter>
                <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  disabled={withdraw.isPending}
                  onClick={(e) => {
                    // Keep the dialog open until the server answers.
                    e.preventDefault();
                    withdraw.mutate(a.id, { onSuccess: onWithdrawn });
                  }}
                >
                  {withdraw.isPending ? t('withdrawing') : t('withdrawConfirm')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : a.status === 'withdrawn' ? (
          <Button asChild variant="outline" size="lg" className="min-h-11 px-3">
            <Link href={`/vacancies/${v.id}?apply=1`}>{t('reapply')}</Link>
          </Button>
        ) : null}
      </div>
    </article>
  );
}
