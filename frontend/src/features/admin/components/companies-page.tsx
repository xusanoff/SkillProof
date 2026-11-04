'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { useAdminCompanies, useUpdateCompany } from '../api';
import { AdminList, RowCard, useListQuery } from './admin-list';
import { ConfirmAction } from './confirm-action';

export function CompaniesPage() {
  const t = useTranslations('admin.companies');
  const { query, setQuery } = useListQuery();
  const list = useAdminCompanies(query);
  const update = useUpdateCompany();

  return (
    <AdminList
      title={t('title')}
      query={query}
      setQuery={setQuery}
      list={list}
      renderItem={(c) => (
        <RowCard>
          <div className="min-w-0">
            <p className="truncate font-medium">
              {c.blocked_at ? (
                c.name
              ) : (
                <Link href={`/companies/${c.slug}`} className="underline-offset-4 hover:underline">
                  {c.name}
                </Link>
              )}
            </p>
            <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
              <span>{t('members', { count: c.members })}</span>
              <span>{t('vacancies', { count: c.vacancies })}</span>
              {c.is_verified ? <span className="font-medium text-fg">{t('verified')}</span> : null}
              {c.blocked_at ? <span className="font-medium text-fg">{t('blocked')}</span> : null}
            </p>
            {c.block_reason ? (
              <p className="mt-1 text-sm break-words text-muted">{c.block_reason}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={update.isPending}
              onClick={() => update.mutate({ id: c.id, is_verified: !c.is_verified })}
            >
              {c.is_verified ? t('unverify') : t('verify')}
            </Button>
            <ConfirmAction
              label={c.blocked_at ? t('unblock') : t('block')}
              title={c.blocked_at ? t('unblockTitle') : t('blockTitle')}
              body={c.blocked_at ? t('unblockBody') : t('blockBody')}
              withReason={!c.blocked_at}
              danger={!c.blocked_at}
              pending={update.isPending}
              error={update.error}
              onConfirm={(reason, done) =>
                update.mutate(
                  { id: c.id, blocked: !c.blocked_at, ...(reason ? { reason } : {}) },
                  { onSuccess: done },
                )
              }
            />
          </div>
        </RowCard>
      )}
    />
  );
}
