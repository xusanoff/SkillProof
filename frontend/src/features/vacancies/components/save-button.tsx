'use client';

import { Heart } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { loginHref, useViewer } from '@/features/auth';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { useToggleSave } from '../api';
import type { VacancyCard } from '../model';

const base =
  'inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-transparent text-muted transition-colors hover:bg-surface-2 hover:text-fg';

/**
 * Heart toggle. Candidates: optimistic save/unsave (rolled back on error).
 * Guests: link to login that returns to the vacancy. HR/admin: nothing (they don't save vacancies).
 */
export function SaveButton({
  vacancy,
  className,
}: {
  vacancy: Pick<VacancyCard, 'id' | 'title' | 'viewer'>;
  className?: string;
}) {
  const t = useTranslations('vacancy');
  const { data: me, isPending } = useViewer();
  const toggle = useToggleSave();

  if (isPending || (me && me.role !== 'candidate')) return null;
  if (!me) {
    return (
      <Link
        href={loginHref(`/vacancies/${vacancy.id}`)}
        aria-label={t('saveAria', { title: vacancy.title })}
        className={cn(base, className)}
      >
        <Heart aria-hidden="true" className="size-5" />
      </Link>
    );
  }

  const saved = !!vacancy.viewer?.is_saved;
  return (
    <span className="inline-flex items-center gap-1">
      {toggle.isError ? (
        <span role="alert" className="text-xs text-danger">
          {t('saveFailed')}
        </span>
      ) : null}
      <button
        type="button"
        aria-pressed={saved}
        aria-label={t('saveAria', { title: vacancy.title })}
        onClick={() => toggle.mutate({ id: vacancy.id, save: !saved })}
        className={cn(base, saved && 'text-danger hover:text-danger', className)}
      >
        <Heart aria-hidden="true" className={cn('size-5', saved && 'fill-current')} />
      </button>
    </span>
  );
}
