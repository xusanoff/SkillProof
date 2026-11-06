'use client';

import { Download, MapPin, TriangleAlert, UsersRound } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Fragment, useId, useState, type KeyboardEvent } from 'react';
import { Avatar, StatCard } from '@/components/common/design';
import { ApplicationStatusBadge } from '@/components/common/application-status-badge';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { Pagination } from '@/components/common/pagination';
import { Salary } from '@/components/common/salary';
import { TabLinks } from '@/components/common/tab-links';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { SuspicionBadge } from '@/components/common/suspicion-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { NeedsCompany, useActiveCompany } from '@/features/companies';
import { percentText, recommendationKey, suspicionLevel } from '@/features/hr-stage1';
import { useHrVacancies } from '@/features/hr-vacancies';
import { Link, useRouter } from '@/i18n/navigation';
import { useFormat } from '@/lib/format';
import { useErrorText } from '@/lib/forms';
import { pageCount } from '@/lib/pagination';
import { cn } from '@/lib/utils';
import { resumeUrl, useCompanyApplications, useSetApplicationStatus } from '../api';
import {
  HR_LIST_TABS,
  HR_STATUS_FILTERS,
  hasScores,
  hrActions,
  hrListHref,
  parseHrQuery,
  parseMinScore,
  type HrApplication,
  type HrStatusFilter,
} from '../model';

/** "Nomzodlar": the ranking by test result and the failed / disqualified tab (spec §8). */
export function HrCandidates() {
  const { active } = useActiveCompany();
  if (!active) return <NeedsCompany />;
  return <Candidates companyId={active.id} />;
}

function Candidates({ companyId }: { companyId: string }) {
  const t = useTranslations('hrCandidates');
  const design = useTranslations('design');
  const tc = useTranslations('common');
  const ts = useTranslations('applicationStatus');
  const errorText = useErrorText();
  const router = useRouter();
  const selectId = useId();
  const params = useSearchParams();
  const query = parseHrQuery(new URLSearchParams(params.toString()));
  const { tab, status, minScore, page } = query;
  const statusId = useId();
  const minId = useId();
  const vacancies = useHrVacancies(companyId, null, 1, 50);
  const list = useCompanyApplications(companyId, query);
  const href = (next: Parameters<typeof hrListHref>[1]) => hrListHref(query, { page: 1, ...next });

  const applyMin = (raw: string) => {
    const next = parseMinScore(raw);
    if (next !== minScore) router.replace(href({ minScore: next }));
  };

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="sp-page-title">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('lead')}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_8rem]">
        <div className="grid gap-1.5">
          <label htmlFor={selectId} className="text-sm text-muted">
            {t('vacancyFilter')}
          </label>
          <NativeSelect
            id={selectId}
            value={query.vacancyId ?? ''}
            onChange={(e) => router.replace(href({ vacancyId: e.target.value || null }))}
          >
            <option value="">{t('allVacancies')}</option>
            {(vacancies.data?.items ?? []).map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={statusId} className="text-sm text-muted">
            {t('statusFilter')}
          </label>
          <NativeSelect
            id={statusId}
            value={status ?? ''}
            onChange={(e) =>
              router.replace(href({ status: (e.target.value || null) as HrStatusFilter | null }))
            }
          >
            <option value="">{t('allStatuses')}</option>
            {HR_STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {ts(s)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={minId} className="text-sm text-muted">
            {t('minScore')}
          </label>
          <Input
            key={minScore ?? 'none'}
            id={minId}
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            defaultValue={minScore ?? ''}
            placeholder="0–100"
            className="tabular-nums"
            onBlur={(e) => applyMin(e.target.value)}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') applyMin(e.currentTarget.value);
            }}
          />
        </div>
      </div>

      <TabLinks
        label={t('tabsLabel')}
        active={tab}
        items={HR_LIST_TABS.map((k) => ({
          key: k,
          label: t(`tabs.${k}`),
          href: href({ tab: k }),
        }))}
      />
      {tab === 'excluded' ? <p className="text-sm text-muted">{t('excludedLead')}</p> : null}

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
        <EmptyState icon={UsersRound} title={t(`empty.${tab}`)} description={t('emptyBody')} />
      ) : (
        <>
          <p className="text-sm text-muted">{t('total', { count: list.data.total })}</p>
          <dl className="grid gap-3 sm:grid-cols-2">
            <StatCard label={t(('tabs.' + tab) as 'tabs.ranked')} value={list.data.total} />
            <StatCard label={design('loadedResults')} value={list.data.items.length} />
          </dl>
          <div
            tabIndex={0}
            role="region"
            aria-label={design('rank')}
            className={cn('sp-card overflow-x-auto', list.isPlaceholderData && 'opacity-60')}
          >
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="bg-surface-2 text-xs text-muted">
                <tr>
                  <th scope="col" className="p-4">
                    #
                  </th>
                  <th scope="col" className="p-4">
                    {t('title')}
                  </th>
                  <th scope="col" className="p-4">
                    {t('scores.stage1')}
                  </th>
                  <th scope="col" className="p-4">
                    {t('scores.stage2')}
                  </th>
                  <th scope="col" className="p-4">
                    {t('scores.overall')}
                  </th>
                  <th scope="col" className="p-4">
                    {t('scores.recommendationLabel')}
                  </th>
                  <th scope="col" className="p-4">
                    {t('scores.open')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((a, index) => {
                  const rank = (page - 1) * list.data!.page_size + index + 1;
                  const recommendation = recommendationKey(a.recommendation);
                  const level = suspicionLevel(a.suspicion_label);
                  return (
                    <Fragment key={a.id}>
                      <tr className="border-t border-border">
                        <td className="p-4">
                          <span
                            className={cn(
                              'grid size-9 place-items-center rounded-lg font-mono font-semibold',
                              tab === 'ranked' && rank === 1
                                ? 'bg-signal text-signal-ink'
                                : 'bg-surface-2',
                            )}
                          >
                            {rank}
                          </span>
                        </td>
                        <th scope="row" className="p-4 font-normal">
                          <div className="flex items-center gap-3">
                            <Avatar name={a.candidate.full_name} />
                            <div className="min-w-0">
                              <p className="font-semibold">{a.candidate.full_name}</p>
                              <p className="mt-1 text-xs text-muted">{a.vacancy.title}</p>
                              <div className="mt-2">
                                <ApplicationStatusBadge status={a.status} />
                              </div>
                            </div>
                          </div>
                        </th>
                        <td className="p-4 font-mono">{percentText(a.stage1_score)}</td>
                        <td className="p-4 font-mono">{percentText(a.stage2_score)}</td>
                        <td className="p-4 font-mono text-xl font-semibold">
                          {percentText(a.final_score)}
                        </td>
                        <td className="p-4">
                          {level ? (
                            <SuspicionBadge level={level} label={t(`scores.level.${level}`)} />
                          ) : (
                            '—'
                          )}
                          {recommendation ? (
                            <p className="mt-2 text-xs">
                              {t(`scores.recommendation.${recommendation}`)}
                            </p>
                          ) : null}
                        </td>
                        <td className="p-4">
                          {interviewStarted(a) ? (
                            <Link
                              href={`/hr/candidates/${a.id}`}
                              className="inline-flex min-h-11 items-center font-semibold text-accent hover:underline"
                            >
                              {t('scores.open')}
                            </Link>
                          ) : (
                            <span className="text-muted">{t('scores.notStarted')}</span>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td colSpan={7} className="px-4 pb-3">
                          <details>
                            <summary className="min-h-11 cursor-pointer py-3 text-xs font-medium text-muted">
                              {t('expand')} · {a.candidate.full_name}
                            </summary>
                            <CandidateRow
                              application={a}
                              companyId={companyId}
                              showVacancy={!query.vacancyId}
                            />
                          </details>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            totalPages={pageCount(list.data.total, list.data.page_size)}
            pathname="/hr/candidates"
            query={new URLSearchParams(href({ page: 1 }).split('?')[1]).toString()}
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
  const started = interviewStarted(a);
  const hasSalary = c.desired_salary_min !== null || c.desired_salary_max !== null;

  return (
    <article
      aria-labelledby={`cand-${a.id}`}
      className="sp-card grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_15rem]"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id={`cand-${a.id}`} className="text-lg font-semibold">
            {started ? (
              <Link
                href={`/hr/candidates/${a.id}`}
                className="text-accent underline-offset-4 hover:underline"
              >
                {c.full_name}
              </Link>
            ) : (
              c.full_name
            )}
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

      <ScoreCell application={a} started={started} />
    </article>
  );
}

/** The interview began or left a result, so a report page exists to open. */
function interviewStarted(a: HrApplication): boolean {
  return (
    hasScores(a) ||
    a.suspicion_percent != null ||
    a.report_state != null ||
    a.status.startsWith('stage') ||
    a.status === 'evaluated'
  );
}

/**
 * Scores for HR, as the server computed them: overall, Stage 1, Stage 2 (a missing score is a dash,
 * never 0), suspicion badge, recommendation and the "needs review" mark. Decides nothing.
 */
function ScoreCell({ application: a, started }: { application: HrApplication; started: boolean }) {
  const t = useTranslations('hrCandidates.scores');
  const level = suspicionLevel(a.suspicion_label);
  const recommendation = recommendationKey(a.recommendation);
  return (
    <aside
      aria-label={t('label')}
      className="grid content-start gap-2 rounded-lg border border-border p-3 text-sm"
    >
      <dl className="grid grid-cols-3 gap-2">
        <div className="col-span-3">
          <dt className="text-muted">{t('overall')}</dt>
          <dd className="tabular-nums text-2xl font-semibold">{percentText(a.final_score)}</dd>
        </div>
        <div>
          <dt className="text-muted">{t('stage1')}</dt>
          <dd className="tabular-nums font-medium">{percentText(a.stage1_score)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted">{t('stage2')}</dt>
          <dd className="tabular-nums font-medium">{percentText(a.stage2_score)}</dd>
        </div>
      </dl>
      {a.suspicion_percent != null && level ? (
        <p className="flex flex-wrap items-center gap-2">
          <SuspicionBadge level={level} label={t(`level.${level}`)} />
          <span className="tabular-nums text-muted">{Math.round(a.suspicion_percent)}%</span>
        </p>
      ) : (
        <p className="text-muted">{started ? t('evaluating') : t('notStarted')}</p>
      )}
      {recommendation ? (
        <p>
          <span className="text-muted">{t('recommendationLabel')}: </span>
          <span className="font-medium">{t(`recommendation.${recommendation}`)}</span>
        </p>
      ) : null}
      {a.needs_review ? (
        <p className="flex items-center gap-1.5 font-medium">
          <TriangleAlert aria-hidden="true" className="size-4 text-warning" />
          {t('needsReview')}
        </p>
      ) : null}
      {started ? (
        <Link
          href={`/hr/candidates/${a.id}`}
          className="inline-flex min-h-11 items-center font-medium text-accent underline-offset-4 hover:underline"
        >
          {t('open')}
        </Link>
      ) : null}
    </aside>
  );
}
