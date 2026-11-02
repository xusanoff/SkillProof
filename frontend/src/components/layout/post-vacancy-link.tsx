'use client';

import { useTranslations } from 'next-intl';
import { useMe } from '@/features/auth';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/** "Vakansiya joylash": HR → their dashboard; guests → HR sign-up; candidates don't see it. */
export function PostVacancyLink({ className }: { className?: string }) {
  const t = useTranslations('nav');
  const { data: me } = useMe();
  if (me && me.role !== 'hr') return null;
  const href = me ? '/hr' : `/register?role=hr&next=${encodeURIComponent('/hr')}`;
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex min-h-11 items-center rounded-lg border border-border-strong px-3.5 text-sm font-medium whitespace-nowrap text-fg hover:bg-surface-2',
        className,
      )}
    >
      {t('postVacancy')}
    </Link>
  );
}
