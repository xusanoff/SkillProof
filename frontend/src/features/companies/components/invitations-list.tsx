'use client';

import { useTranslations } from 'next-intl';
import { ErrorState } from '@/components/common/error-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useFormat } from '@/lib/format';
import { useErrorText } from '@/lib/forms';
import { useInvitations, useRevokeInvitation } from '../api';

export function InvitationsList({ companyId }: { companyId: string }) {
  const t = useTranslations('hr.team');
  const tc = useTranslations('common');
  const format = useFormat();
  const errorText = useErrorText();
  const invitations = useInvitations(companyId, true);
  const revoke = useRevokeInvitation(companyId);

  return (
    <section aria-labelledby="pending-title" className="grid gap-3">
      <h2 id="pending-title" className="text-lg font-semibold">
        {t('pending')}
        {invitations.data ? (
          <span className="ml-2 tabular-nums font-normal text-muted">
            {invitations.data.length}
          </span>
        ) : null}
      </h2>
      {invitations.isPending ? (
        <Skeleton className="h-20" aria-hidden="true" />
      ) : invitations.isError ? (
        <ErrorState
          title={errorText(invitations.error)}
          onRetry={() => invitations.refetch()}
          retryLabel={tc('retry')}
        />
      ) : invitations.data.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border-strong p-4 text-sm text-muted">
          {t('pendingEmpty')}
        </p>
      ) : (
        <ul className="sp-card divide-y divide-border">
          {invitations.data.map((inv) => (
            <li
              key={inv.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5"
            >
              <div className="min-w-0 flex-1 basis-56">
                <p className="truncate font-medium">{inv.email}</p>
                <p className="text-sm text-muted">
                  {t('pendingMeta', {
                    by: inv.invited_by_name ?? '—',
                    expires: format.date(inv.expires_at),
                  })}
                </p>
              </div>
              <Button
                variant="ghost"
                size="lg"
                className="min-h-11 px-3"
                disabled={revoke.isPending && revoke.variables === inv.id}
                aria-label={t('revokeAria', { email: inv.email })}
                onClick={() => revoke.mutate(inv.id)}
              >
                {t('revoke')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {revoke.isError ? (
        <p role="alert" className="text-sm text-danger">
          {errorText(revoke.error)}
        </p>
      ) : null}
    </section>
  );
}
