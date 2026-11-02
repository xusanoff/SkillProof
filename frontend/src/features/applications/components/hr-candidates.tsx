'use client';

import { Download, MapPin, UsersRound } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useId, useState } from 'react';
import { ApplicationStatusBadge } from '@/components/common/application-status-badge';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { Pagination } from '@/components/common/pagination';
import { Salary } from '@/components/common/salary';
import { TabLinks } from '@/components/common/tab-links';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { SuspicionBadge } from '@/components/common/suspicion-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { NeedsCompany, useActiveCompany } from '@/features/companies';
import { suspicionLevel } from '@/features/hr-stage1';
import { useHrVacancies } from '@/features/hr-vacancies';
import { Link, useRouter } from '@/i18n/navigation';
import { useFormat } from '@/lib/format';
import { useErrorText } from '@/lib/forms';
import { pageCount } from '@/lib/pagination';
import { cn } from '@/lib/utils';
import { resumeUrl, useCompanyApplications, useSetApplicationStatus } from '../api';
import { HR_TABS, hrActions, type HrApplication, type HrStatus } from '../model';

/** "Nomzodlar" (hh "Отклики"): applications per vacancy and status. No AI ranking yet. */
export function HrCandidates() {
  const { active } = useActiveCompany();
  if (!active) return <NeedsCompany />;
  return <Candidates companyId={active.id} />;
}

function Candidates({ companyId }: { companyId: string }) {
  const t = useTranslations('hrCandidates');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const router = useRouter();
  const selectId = useId();
  const params = useSearchParams();
  const vacancyId = params.get('vacancy');
  const raw = params.get('status');
  const status: HrStatus = (HR_TABS as readonly string[]).includes(raw ?? '')
    ? (raw as HrStatus)
    : 'applied';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const vacancies = useHrVacancies(companyId, null, 1, 50);
  const list = useCompanyApplications(companyId, { vacancyId, status, page });

  const href = (next: { vacancy?: string | null; status?: HrStatus }) => {
    const p = new URLSearchParams();
    const v = next.vacancy === undefined ? vacancyId : next.vacancy;
    if (v) p.set('vacancy', v);
    p.set('status', next.status ?? status);
    return `/hr/candidates?${p.toString()}`;
  };

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted">{t('lead')}</p>
        </div>
        <div className="grid w-full gap-1.5 sm:w-80">
          <label htmlFor={selectId} className="text-sm text-muted">
            {t('vacancyFilter')}
          </label>
          <NativeSelect
            id={selectId}
            value={vacancyId ?? ''}
            onChange={(e) => router.replace(href({ vacancy: e.target.value || null }))}
          >
            <option value="">{t('allVacancies')}</option>
            {(vacancies.data?.items ?? []).map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <TabLinks
        label={t('tabsLabel')}
        active={status}
        items={HR_TABS.map((s) => ({ key: s, label: t(`tabs.${s}`), href: href({ status: s }) }))}
      />

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
            <Skeleton key={i} className="h-36 w-full rounded-xl" />
          ))}
        </div>
      ) : list.data.items.length === 0 ? (
        <EmptyState icon={UsersRound} title={t(`empty.${status}`)} description={t('emptyBody')} />
      ) : (
        <>
          <p className="text-sm text-muted">{t('total', { count: list.data.total })}</p>
          <ul className={cn('grid gap-3', list.isPlaceholderData && 'opacity-60')}>
            {list.data.items.map((a) => (
              <li key={a.id}>
                <CandidateRow application={a} companyId={companyId} showVacancy={!vacancyId} />
              </li>
            ))}
          </ul>
          <Pagination
            page={page}
            totalPages={pageCount(list.data.total, list.data.page_size)}
            pathname="/hr/candidates"
            query={new URLSearchParams(href({}).split('?')[1]).toString()}
          />
        </>
      )}
    </div>
  );
}

function CandidateRow({
  application: a,
  companyId,
  showVacancy,
}: {
  application: HrApplication;
  companyId: string;
  showVacancy: boolean;
}) {
  const t = useTranslations('hrCandidates');
  const locale = useLocale();
  const format = useFormat();
  const errorText = useErrorText();
  const setStatus = useSetApplicationStatus(companyId);
  const [expanded, setExpanded] = useState(false);
  const c = a.candidate;
  const country = c.country
    ? new Intl.DisplayNames([locale], { type: 'region' }).of(c.country)
    : null;
  const place = [c.city, country].filter(Boolean).join(', ');
  const noteId = `note-${a.id}`;
  const hasSalary = c.desired_salary_min !== null || c.desired_salary_max !== null;

  return (
    <article
      aria-labelledby={`cand-${a.id}`}
      className="grid gap-4 rounded-xl border border-border bg-surface p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_11rem]"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id={`cand-${a.id}`} className="text-lg font-semibold">
            {c.full_name}
          </h2>
          <ApplicationStatusBadge status={a.status} />
        </div>
        {c.headline ? <p className="mt-0.5 font-medium">{c.headline}</p> : null}
        <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {place ? (
            <div className="flex items-center gap-1.5">
              <MapPin aria-hidden="true" className="size-3.5 text-muted" />
              <dt className="sr-only">{t('location')}</dt>
              <dd>{place}</dd>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-x-1.5">
            <dt className="text-muted">{t('experience')}:</dt>
            <dd>
              {c.experience_years === null
                ? t('notSpecified')
                : c.experience_years === 0
                  ? t('noExperience')
                  : t('years', { count: c.experience_years })}
            </dd>
          </div>
          <div className="flex flex-wrap gap-x-1.5">
            <dt className="text-muted">{t('expectedSalary')}:</dt>
            <dd>
              {hasSalary ? (
                <Salary
                  min={c.desired_salary_min}
                  max={c.desired_salary_max}
                  currency={c.currency}
                  className="inline font-medium"
                />
              ) : (
                t('notSpecified')
              )}
            </dd>
          </div>
          <div className="flex flex-wrap gap-x-1.5">
            <dt className="text-muted">{t('appliedOn')}:</dt>
            <dd className="tabular-nums">{format.date(a.created_at)}</dd>
          </div>
          {showVacancy ? (
            <div className="flex min-w-0 gap-1.5 sm:col-span-2">
              <dt className="text-muted">{t('forVacancy')}:</dt>
              <dd className="truncate">{a.vacancy.title}</dd>
            </div>
          ) : null}
        </dl>

        {a.cover_note ? (
          <div className="mt-3 rounded-lg bg-surface-2 p-3 text-sm">
            <p className="font-medium">{t('coverNote')}</p>
            <p
              id={noteId}
              className={cn('mt-1 max-w-prose whitespace-pre-line', !expanded && 'line-clamp-3')}
            >
              {a.cover_note}
            </p>
            {a.cover_note.length > 200 ? (
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={noteId}
                onClick={() => setExpanded((v) => !v)}
                className="mt-1 min-h-9 text-sm font-medium text-accent hover:underline"
              >
                {expanded ? t('collapse') : t('expand')}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {hrActions(a.status).map((next) => (
            <Button
              key={next}
              size="lg"
              variant={
                next === 'shortlisted' ? 'default' : next === 'rejected' ? 'destructive' : 'outline'
              }
              className="min-h-11 px-4"
              disabled={setStatus.isPending}
              aria-busy={(setStatus.isPending && setStatus.variables?.status === next) || undefined}
              onClick={() => setStatus.mutate({ id: a.id, status: next })}
            >
              {t(`actions.${next}`)}
            </Button>
          ))}
          {c.has_resume ? (
            <Button asChild variant="ghost" size="lg" className="min-h-11 gap-2 px-3">
              <a href={resumeUrl(companyId, a.id)} download>
                <Download aria-hidden="true" />
                {t('resume')}
              </a>
            </Button>
          ) : (
            <span className="text-sm text-muted">{t('noResume')}</span>
          )}
        </div>
        {setStatus.isError ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            {errorText(setStatus.error)}
          </p>
        ) : null}
      </div>

      <Stage1Cell application={a} />
    </article>
  );
}

/** Stage 1 summary for HR: suspicion badge (from the server) and the report link. Never decides anything. */
function Stage1Cell({ application: a }: { application: HrApplication }) {
  const t = useTranslations('hrCandidates.stage1');
  const level = suspicionLevel(a.suspicion_label);
  const started = a.suspicion_percent != null || a.status.startsWith('stage');
  return (
    <aside
      aria-label={t('label')}
      className="grid content-start gap-1.5 rounded-lg border border-border p-3 text-sm"
    >
      <p className="font-medium">{t('title')}</p>
      {a.suspicion_percent != null && level ? (
        <p className="flex flex-wrap items-center gap-2">
          <SuspicionBadge level={level} label={t(`level.${level}`)} />
          <span className="text-muted tabular-nums">{Math.round(a.suspicion_percent)}%</span>
        </p>
      ) : (
        <p className="text-muted">{started ? t('evaluating') : t('notStarted')}</p>
      )}
      {started ? (
        <Link
          href={`/hr/candidates/${a.id}/stage1`}
          className="inline-flex min-h-11 items-center font-medium text-accent underline-offset-4 hover:underline"
        >
          {t('open')}
        </Link>
      ) : null}
    </aside>
  );
}
