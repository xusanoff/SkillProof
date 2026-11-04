'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { ErrorState } from '@/components/common/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useErrorText } from '@/lib/forms';
import { useAdminOverview } from '../api';

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
      {note ? <dd className="mt-1 text-xs text-muted">{note}</dd> : null}
    </div>
  );
}

export function OverviewPage() {
  const t = useTranslations('admin.overview');
  const format = useFormatter();
  const errorText = useErrorText();
  const overview = useAdminOverview();
  if (overview.isError) {
    return (
      <ErrorState
        title={t('loadFailed')}
        description={errorText(overview.error)}
        onRetry={() => void overview.refetch()}
      />
    );
  }
  const d = overview.data;
  if (!d) return <Skeleton className="h-64 w-full" />;
  const n = (value: number) => format.number(value);
  return (
    <div className="grid gap-5">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Tile label={t('candidates')} value={n(d.candidates)} />
        <Tile label={t('hrUsers')} value={n(d.hr_users)} />
        <Tile
          label={t('companies')}
          value={n(d.companies)}
          note={t('blocked', { count: d.blocked_companies })}
        />
        <Tile
          label={t('vacancies')}
          value={n(d.published_vacancies)}
          note={t('hidden', { count: d.hidden_vacancies })}
        />
        <Tile label={t('applications')} value={n(d.applications)} />
        <Tile
          label={t('aiCost')}
          value={format.number(d.ai_cost_usd_30d, { style: 'currency', currency: 'USD' })}
          note={
            d.ai_calls_unpriced_30d
              ? t('aiUnpriced', { calls: d.ai_calls_30d, unpriced: d.ai_calls_unpriced_30d })
              : t('aiCalls', { calls: d.ai_calls_30d })
          }
        />
      </dl>
    </div>
  );
}
