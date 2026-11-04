'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAdminVacancies, useUpdateVacancy } from '../api';
import { AdminList, RowCard, useListQuery } from './admin-list';
import { ConfirmAction } from './confirm-action';

export function VacanciesPage() {
  const t = useTranslations('admin.vacancies');
  const ts = useTranslations('hrVacancies.status');
  const { query, setQuery } = useListQuery();
  const list = useAdminVacancies(query);
  const update = useUpdateVacancy();

  return (
    <AdminList
      title={t('title')}
      query={query}
      setQuery={setQuery}
      list={list}
      renderItem={(v) => (
        <RowCard>
          <div className="min-w-0">
            <p className="truncate font-medium">
              {v.hidden_at ? (
                v.title
              ) : (
                <Link href={`/vacancies/${v.id}`} className="underline-offset-4 hover:underline">
                  {v.title}
                </Link>
              )}
            </p>
            <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
              <span>{v.company_name}</span>
              <span>{ts(v.status)}</span>
              {v.hidden_at ? <span className="font-medium text-fg">{t('hidden')}</span> : null}
            </p>
            {v.hidden_reason ? (
              <p className="mt-1 text-sm break-words text-muted">{v.hidden_reason}</p>
            ) : null}
          </div>
          <ConfirmAction
            label={v.hidden_at ? t('show') : t('hide')}
            title={v.hidden_at ? t('showTitle') : t('hideTitle')}
            body={v.hidden_at ? t('showBody') : t('hideBody')}
            withReason={!v.hidden_at}
            danger={!v.hidden_at}
            pending={update.isPending}
            error={update.error}
            onConfirm={(reason, done) =>
              update.mutate(
                { id: v.id, hidden: !v.hidden_at, ...(reason ? { reason } : {}) },
                { onSuccess: done },
              )
            }
          />
        </RowCard>
      )}
    />
  );
}
