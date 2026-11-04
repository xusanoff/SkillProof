'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorState } from '@/components/common/error-state';
import { Notice } from '@/components/common/notice';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { useErrorText } from '@/lib/forms';
import { useAiUsage, type UsageBucket } from '../api';

const RANGES = [7, 30, 90, 365];

function UsageTable({ title, rows }: { title: string; rows: UsageBucket[] }) {
  const t = useTranslations('admin.aiUsage');
  const format = useFormatter();
  const cost = (v: number) =>
    format.number(v, { style: 'currency', currency: 'USD', maximumFractionDigits: 4 });
  return (
    <section className="grid gap-2">
      <h2 className="font-semibold">{title}</h2>
      <div tabIndex={0} className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[36rem] text-sm">
          <thead className="text-left text-xs text-muted">
            <tr className="border-b border-border">
              <th scope="col" className="p-3 font-medium">
                {t('key')}
              </th>
              <th scope="col" className="p-3 text-right font-medium">
                {t('calls')}
              </th>
              <th scope="col" className="p-3 text-right font-medium">
                {t('tokens')}
              </th>
              <th scope="col" className="p-3 text-right font-medium">
                {t('seconds')}
              </th>
              <th scope="col" className="p-3 text-right font-medium">
                {t('failed')}
              </th>
              <th scope="col" className="p-3 text-right font-medium">
                {t('cost')}
              </th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-border last:border-0">
                <th scope="row" className="p-3 text-left font-mono font-normal break-all">
                  {r.key}
                </th>
                <td className="p-3 text-right">{format.number(r.calls)}</td>
                <td className="p-3 text-right">
                  {format.number(r.input_tokens + r.output_tokens)}
                </td>
                <td className="p-3 text-right">{format.number(r.seconds)}</td>
                <td className="p-3 text-right">{format.number(r.failed_calls)}</td>
                <td className="p-3 text-right">
                  {r.unpriced_calls === r.calls ? t('unknown') : cost(r.cost_usd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function AiUsagePage() {
  const t = useTranslations('admin.aiUsage');
  const errorText = useErrorText();
  const [days, setDays] = useState(30);
  const usage = useAiUsage(days);
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
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
      {usage.isError && !usage.data ? (
        <ErrorState
          title={t('loadFailed')}
          description={errorText(usage.error)}
          onRetry={() => void usage.refetch()}
        />
      ) : !usage.data ? (
        <Skeleton className="h-64 w-full" />
      ) : usage.data.total.calls === 0 ? (
        <Notice>{t('empty')}</Notice>
      ) : (
        <>
          {usage.data.total.unpriced_calls ? (
            <Notice tone="warning">
              {t('unpricedNote', { count: usage.data.total.unpriced_calls })}
            </Notice>
          ) : null}
          <UsageTable title={t('total')} rows={[usage.data.total]} />
          <UsageTable title={t('byKind')} rows={usage.data.by_kind} />
          <UsageTable title={t('byModel')} rows={usage.data.by_model} />
          <UsageTable title={t('byRole')} rows={usage.data.by_role} />
          <UsageTable title={t('byDay')} rows={usage.data.by_day} />
        </>
      )}
    </div>
  );
}
