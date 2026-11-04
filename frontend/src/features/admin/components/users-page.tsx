'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useMe } from '@/features/auth';
import { useAdminUsers, useSetUserActive } from '../api';
import { AdminList, RowCard, useListQuery } from './admin-list';
import { ConfirmAction } from './confirm-action';

export function UsersPage() {
  const t = useTranslations('admin.users');
  const tr = useTranslations('nav.roles');
  const format = useFormatter();
  const { query, setQuery } = useListQuery();
  const list = useAdminUsers(query);
  const update = useSetUserActive();
  const { data: me } = useMe();

  return (
    <AdminList
      title={t('title')}
      query={query}
      setQuery={setQuery}
      list={list}
      renderItem={(u) => (
        <RowCard>
          <div className="min-w-0">
            <p className="truncate font-medium">{u.full_name}</p>
            <p className="truncate text-sm text-muted">{u.email}</p>
            <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
              <span>{tr(u.role)}</span>
              <span>{u.is_email_verified ? t('verified') : t('notVerified')}</span>
              <span>{format.dateTime(new Date(u.created_at), { dateStyle: 'medium' })}</span>
              {u.is_active ? null : <span className="font-medium text-fg">{t('inactive')}</span>}
            </p>
          </div>
          {u.id === me?.id ? null : (
            <ConfirmAction
              label={u.is_active ? t('deactivate') : t('activate')}
              title={u.is_active ? t('deactivateTitle') : t('activateTitle')}
              body={u.is_active ? t('deactivateBody') : t('activateBody')}
              danger={u.is_active}
              pending={update.isPending}
              error={update.error}
              onConfirm={(_, done) =>
                update.mutate({ id: u.id, is_active: !u.is_active }, { onSuccess: done })
              }
            />
          )}
        </RowCard>
      )}
    />
  );
}
