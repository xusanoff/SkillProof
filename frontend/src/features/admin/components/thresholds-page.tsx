'use client';

import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { ErrorState } from '@/components/common/error-state';
import { Notice } from '@/components/common/notice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { ApiError } from '@/lib/api';
import { useErrorText } from '@/lib/forms';
import { useSaveThresholds, useThresholds, type ThresholdsOut } from '../api';
import { buildOverrides, flattenThresholds, readPath, type ThresholdValue } from '../model';

export function ThresholdsPage() {
  const t = useTranslations('admin.thresholds');
  const errorText = useErrorText();
  const thresholds = useThresholds();
  if (thresholds.isError) {
    return (
      <ErrorState
        title={t('loadFailed')}
        description={errorText(thresholds.error)}
        onRetry={() => void thresholds.refetch()}
      />
    );
  }
  if (!thresholds.data) return <Skeleton className="h-96 w-full" />;
  return <Editor key={thresholds.data.updated_at ?? 'none'} data={thresholds.data} />;
}

function Editor({ data }: { data: ThresholdsOut }) {
  const t = useTranslations('admin.thresholds');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const save = useSaveThresholds();
  const groups = useMemo(() => flattenThresholds(data.defaults), [data.defaults]);
  // Numbers stay text while typed, so a field can be emptied on the way to a new value.
  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(
      groups.flatMap((g) =>
        g.fields.map((f) => {
          const value = readPath(data.effective, f.path) as ThresholdValue;
          return [f.path, typeof value === 'number' ? String(value) : value];
        }),
      ),
    ),
  );
  const parsed = (raw: string | boolean, fallback: ThresholdValue): ThresholdValue => {
    if (typeof raw === 'boolean') return raw;
    const number = Number(raw);
    return raw.trim() === '' || Number.isNaN(number) ? fallback : number;
  };
  const badFields =
    save.error instanceof ApiError
      ? (save.error.details?.fields as string[] | undefined)
      : undefined;

  return (
    <form
      noValidate
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        const fields = groups.flatMap((g) => g.fields);
        save.mutate(
          buildOverrides(
            Object.fromEntries(
              fields.map((f) => [f.path, parsed(values[f.path] ?? f.value, f.value)]),
            ),
            data.defaults,
          ),
        );
      }}
    >
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('lead')}</p>
      </div>
      {save.error ? (
        <Notice tone="danger" role="alert">
          {errorText(save.error)}
          {badFields?.length ? (
            <span className="block font-mono text-xs">{badFields.join(', ')}</span>
          ) : null}
        </Notice>
      ) : null}
      {groups.map((group) => (
        <fieldset key={group.group} className="grid gap-3 rounded-xl border border-border p-4">
          <legend className="px-1 font-mono text-sm font-semibold">{group.group}</legend>
          {group.fields.map((f) => {
            const value = values[f.path] ?? f.value;
            const changed = parsed(value, f.value) !== f.value;
            return (
              <div
                key={f.path}
                className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-center sm:gap-4"
              >
                <label htmlFor={f.path} className="min-w-0 font-mono text-sm break-words">
                  {f.key}
                  <span className="block font-sans text-xs text-muted">
                    {t('default', { value: String(f.value) })}
                    {changed ? ` · ${t('changed')}` : ''}
                  </span>
                </label>
                {typeof f.value === 'boolean' ? (
                  <Switch
                    id={f.path}
                    checked={value === true}
                    onCheckedChange={(next) => setValues((v) => ({ ...v, [f.path]: next }))}
                  />
                ) : (
                  <Input
                    id={f.path}
                    type="number"
                    step="any"
                    className="tabular-nums"
                    value={String(value)}
                    onChange={(e) => setValues((v) => ({ ...v, [f.path]: e.target.value }))}
                  />
                )}
              </div>
            );
          })}
        </fieldset>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" className="h-12 px-6" disabled={save.isPending}>
          {save.isPending ? tc('saving') : tc('save')}
        </Button>
        <span aria-live="polite" className="text-sm text-success">
          {save.isSuccess ? t('saved') : null}
        </span>
      </div>
    </form>
  );
}
