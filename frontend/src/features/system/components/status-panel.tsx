'use client';

import { CircleCheck, CircleDashed, CircleX, TriangleAlert } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { ErrorState } from '@/components/common/error-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, errorMessageKey } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useHealth } from '../api';
import { apiState, type ApiState } from '../model';

const KNOWN_ERRORS = ['upstream_unavailable', 'not_found', 'internal_error'] as const;
const KNOWN_CHECKS = ['database', 'redis', 'worker'] as const;

const stateStyle: Record<ApiState, { icon: typeof CircleCheck; className: string }> = {
  ok: { icon: CircleCheck, className: 'bg-success-soft text-success' },
  degraded: { icon: TriangleAlert, className: 'bg-warning-soft text-warning' },
  unavailable: { icon: CircleX, className: 'bg-danger-soft text-danger' },
};

export function StatusPanel() {
  const t = useTranslations();
  const format = useFormatter();
  const { data, error, isPending, isError, isFetching, refetch, dataUpdatedAt, errorUpdatedAt } =
    useHealth();

  const state: ApiState | null = isPending ? null : isError ? 'unavailable' : apiState(data);
  const checkedAt = isError ? errorUpdatedAt : dataUpdatedAt;

  return (
    <div className="grid gap-6">
      <section
        aria-labelledby="api-status-title"
        aria-busy={isFetching || undefined}
        className="sp-card"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-5 sm:p-6">
          <h2 id="api-status-title" className="text-lg font-semibold">
            {t('status.api')}
          </h2>
          <div aria-live="polite">
            {state === null ? (
              <span className="inline-flex items-center gap-2 text-muted">
                <CircleDashed aria-hidden="true" className="size-5 animate-spin" />
                {t('status.checking')}
              </span>
            ) : (
              <StateBadge state={state} label={t(`status.${state}`)} />
            )}
          </div>
        </div>

        {isPending ? (
          <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6" data-testid="status-skeleton">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-16 sm:col-span-2" />
          </div>
        ) : data ? (
          <dl className="grid gap-x-8 gap-y-5 p-5 sm:grid-cols-2 sm:p-6">
            <Field term={t('status.version')} value={data.version} />
            <Field term={t('status.environment')} value={data.environment} />
            <div className="sm:col-span-2">
              <dt className="text-sm text-muted">{t('status.dependencies')}</dt>
              <dd className="mt-2">
                <ul className="flex flex-wrap gap-2">
                  {Object.entries(data.checks).map(([name, value]) => {
                    const ok = value === 'ok';
                    const label = (KNOWN_CHECKS as readonly string[]).includes(name)
                      ? t(`status.checkNames.${name as (typeof KNOWN_CHECKS)[number]}`)
                      : name;
                    return (
                      <li
                        key={name}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm',
                          ok ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger',
                        )}
                      >
                        {ok ? (
                          <CircleCheck aria-hidden="true" className="size-4" />
                        ) : (
                          <CircleX aria-hidden="true" className="size-4" />
                        )}
                        <span className="font-medium text-fg">{label}</span>
                        <span>{ok ? t('status.checkOk') : t('status.checkFailed')}</span>
                      </li>
                    );
                  })}
                </ul>
              </dd>
            </div>
          </dl>
        ) : null}

        {!isPending ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-5 sm:px-6 sm:py-4">
            <p className="tabular-nums text-sm text-muted">
              {checkedAt
                ? t('status.lastChecked', {
                    time: format.dateTime(new Date(checkedAt), {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    }),
                  })
                : null}
            </p>
            {/* In the error state the ErrorState below owns the retry action. */}
            {!isError ? (
              <Button
                variant="outline"
                size="lg"
                className="min-h-11 px-4"
                onClick={() => refetch()}
                disabled={isFetching}
                aria-busy={isFetching || undefined}
              >
                {t('status.refresh')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </section>

      {isError ? (
        <ErrorState
          title={t('status.unavailableTitle')}
          description={t(`errors.${errorMessageKey(error, KNOWN_ERRORS)}` as 'errors.unknown')}
          meta={
            error instanceof ApiError && error.requestId
              ? t('status.requestId', { id: error.requestId })
              : undefined
          }
          onRetry={() => refetch()}
          retrying={isFetching}
          retryLabel={t('common.retry')}
        />
      ) : null}
    </div>
  );
}

function StateBadge({ state, label }: { state: ApiState; label: string }) {
  const { icon: Icon, className } = stateStyle[state];
  return (
    <span
      className={cn('inline-flex items-center gap-2 rounded-md px-3 py-1.5 font-medium', className)}
    >
      <Icon aria-hidden="true" className="size-5" />
      {label}
    </span>
  );
}

function Field({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted">{term}</dt>
      <dd className="mt-1 tabular-nums text-lg font-semibold">{value}</dd>
    </div>
  );
}
