'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BarChart3 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { StatCard } from '@/components/common/design';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { NeedsCompany, useActiveCompany } from '@/features/companies';
import { unwrap } from '@/lib/api';
import type { ResponseOf } from '@/lib/api/types';
import { useApi } from '@/lib/api/use-api';
import { useErrorText } from '@/lib/forms';

type Analytics = ResponseOf<'/api/v1/companies/{company_id}/analytics', 'get'>;
type Funnel = Analytics['total'];

const RANGES = [30, 90, 180, 365];
const STEPS = [
  'applied',
  'stage1_started',
  'stage1_passed',
  'stage2_started',
  'stage2_passed',
  'shortlisted',
  'hired',
] as const;

export function AnalyticsPage() {
  const { active } = useActiveCompany();
  if (!active) return <NeedsCompany />;
  return <Content companyId={active.id} />;
}

function Content({ companyId }: { companyId: string }) {
  const t = useTranslations('hr.analytics');
  const errorText = useErrorText();
  const api = useApi();
  const [days, setDays] = useState(90);
  const query = useQuery({
    queryKey: ['hr-analytics', companyId, days],
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/companies/{company_id}/analytics', {
          params: { path: { company_id: companyId }, query: { days } },
        }),
      ),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="sp-page-title">{t('title')}</h1>
        <label className="grid gap-1 text-sm text-muted">
          {t('range')}
          <NativeSelect value={String(days)} onChange={(e) => setDays(Number(e.target.value))}>
            {RANGES.map((d) => (
              <option key={d} value={d}>
                {t('days', { count: d })}
              </option>
            ))}
          </NativeSelect>
        </label>
      </div>
      {query.isError && !query.data ? (
        <ErrorState
          title={t('loadFailed')}
          description={errorText(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : !query.data ? (
        <Skeleton className="h-96 w-full" />
      ) : query.data.total.applied === 0 ? (
        <EmptyState icon={BarChart3} title={t('empty')} />
      ) : (
        <Report data={query.data} />
      )}
    </div>
  );
}

function Report({ data }: { data: Analytics }) {
  const t = useTranslations('hr.analytics');
  const format = useFormatter();
  const percent = (v: number | null) =>
    v === null ? '—' : format.number(v / 100, { style: 'percent', maximumFractionDigits: 1 });
  const score = (v: number | null) => (v === null ? '—' : format.number(v));
  const { total } = data;

  return (
    <>
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Tile label={t('stage1PassRate')} value={percent(total.stage1_pass_rate)} />
        <Tile label={t('stage2PassRate')} value={percent(total.stage2_pass_rate)} />
        <Tile
          label={t('timeToShortlist')}
          value={
            data.median_hours_to_shortlist === null
              ? '—'
              : t('hours', { hours: format.number(data.median_hours_to_shortlist) })
          }
        />
        <Tile label={t('avgStage1')} value={score(total.avg_stage1_score)} />
        <Tile label={t('avgStage2')} value={score(total.avg_stage2_score)} />
        <Tile label={t('avgOverall')} value={score(total.avg_overall_score)} />
      </dl>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
        <FunnelBars funnel={total} />
        <div className="grid gap-5">
          <DropInsight funnel={total} />
          <AverageScores funnel={total} />
        </div>
      </div>
      <section className="grid gap-2">
        <h2 className="font-semibold">{t('byVacancy')}</h2>
        <div tabIndex={0} className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-border">
                <th scope="col" className="p-3 font-medium">
                  {t('vacancy')}
                </th>
                <th scope="col" className="p-3 text-right font-medium">
                  {t('steps.applied')}
                </th>
                <th scope="col" className="p-3 text-right font-medium">
                  {t('stage1PassRate')}
                </th>
                <th scope="col" className="p-3 text-right font-medium">
                  {t('stage2PassRate')}
                </th>
                <th scope="col" className="p-3 text-right font-medium">
                  {t('avgOverall')}
                </th>
                <th scope="col" className="p-3 text-right font-medium">
                  {t('steps.hired')}
                </th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {data.vacancies.map((v) => (
                <tr key={v.vacancy_id} className="border-b border-border last:border-0">
                  <th scope="row" className="p-3 text-left font-normal">
                    {v.title}
                  </th>
                  <td className="p-3 text-right">{format.number(v.funnel.applied)}</td>
                  <td className="p-3 text-right">{percent(v.funnel.stage1_pass_rate)}</td>
                  <td className="p-3 text-right">{percent(v.funnel.stage2_pass_rate)}</td>
                  <td className="p-3 text-right">{score(v.funnel.avg_overall_score)}</td>
                  <td className="p-3 text-right">{format.number(v.funnel.hired)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

const Tile = StatCard;

function DropInsight({ funnel }: { funnel: Funnel }) {
  const t = useTranslations('hr.analytics');
  const design = useTranslations('design');
  const format = useFormatter();
  const drops = STEPS.slice(1)
    .map((step, index) => {
      const previous = STEPS[index];
      const before = funnel[previous];
      const after = funnel[step];
      return { step, previous, before, after, drop: before > 0 ? (before - after) / before : 0 };
    })
    .filter((row) => row.drop > 0)
    .sort((a, b) => b.drop - a.drop);
  const drop = drops[0];
  if (!drop) return null;
  return (
    <section className="sp-dark grid gap-4 rounded-xl p-6">
      <h2 className="text-xs font-semibold tracking-wider text-signal uppercase">
        {design('largestDrop')}
      </h2>
      <p className="text-lg leading-relaxed font-semibold">
        {design('dropDetail', {
          from: t(`steps.${drop.previous}`),
          to: t(`steps.${drop.step}`),
          before: format.number(drop.before),
          after: format.number(drop.after),
          percent: format.number(drop.drop, { style: 'percent', maximumFractionDigits: 1 }),
        })}
      </p>
    </section>
  );
}

function AverageScores({ funnel }: { funnel: Funnel }) {
  const t = useTranslations('hr.analytics');
  const design = useTranslations('design');
  const format = useFormatter();
  const series = [
    { label: t('avgStage1'), value: funnel.avg_stage1_score },
    { label: t('avgStage2'), value: funnel.avg_stage2_score },
    { label: t('avgOverall'), value: funnel.avg_overall_score },
  ];
  return (
    <section className="sp-card p-6">
      <h2 className="font-semibold">{design('averages')}</h2>
      <div className="mt-5 grid grid-cols-3 gap-4">
        {series.map((item, index) => (
          <div key={item.label} className="min-w-0 text-center">
            <div className="flex h-44 flex-col items-center justify-end gap-2">
              <span className="font-mono text-sm font-semibold">
                {item.value == null ? '—' : format.number(item.value, { maximumFractionDigits: 1 })}
              </span>
              <div
                aria-hidden="true"
                className={
                  index === 2
                    ? 'w-full rounded-t-lg bg-fg'
                    : index === 1
                      ? 'w-full rounded-t-lg bg-primary/65'
                      : 'w-full rounded-t-lg bg-primary'
                }
                style={{
                  height: `${Math.min(100, Math.max(0, item.value ?? 0))}%`,
                }}
              />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted">{item.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** One series, so one colour and no legend; every row states its number. */
function FunnelBars({ funnel }: { funnel: Funnel }) {
  const t = useTranslations('hr.analytics');
  const format = useFormatter();
  const top = Math.max(funnel.applied, 1);
  return (
    <section className="sp-card grid gap-5 p-6" aria-labelledby="funnel-title">
      <h2 id="funnel-title" className="font-semibold">
        {t('funnel')}
      </h2>
      <ol className="grid gap-3">
        {STEPS.map((step) => {
          const value = funnel[step];
          const share = value / top;
          return (
            <li key={step} className="grid gap-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span>{t(`steps.${step}`)}</span>
                <span className="tabular-nums">
                  <span className="font-semibold">{format.number(value)}</span>
                  <span className="text-muted">
                    {' · '}
                    {format.number(share, { style: 'percent', maximumFractionDigits: 0 })}
                  </span>
                </span>
              </div>
              <div aria-hidden="true" className="h-7 overflow-hidden rounded-lg bg-surface-2">
                {value > 0 ? (
                  <div
                    className="h-full rounded-lg bg-accent"
                    style={{ width: `${Math.max(share * 100, 1)}%` }}
                  />
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
