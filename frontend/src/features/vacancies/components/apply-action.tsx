'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApplicationStatusBadge } from '@/components/common/application-status-badge';
import { Button } from '@/components/ui/button';
import { loginHref, useViewer } from '@/features/auth';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { hasActiveApplication, type VacancyCard } from '../model';
import { ApplyDialog } from './apply-dialog';

interface ApplyActionProps {
  vacancy: Pick<VacancyCard, 'id' | 'title' | 'company' | 'viewer'>;
  /** Detail page: `false` when the vacancy is closed (the API would say vacancy_not_open). */
  open?: boolean;
  size?: 'md' | 'lg';
  className?: string;
  /** Controlled dialog (detail page auto-opens it after login with `?apply=1`). */
  dialogOpen?: boolean;
  onDialogOpenChange?: (open: boolean) => void;
  /** Two triggers sharing one dialog (detail page): only one of them renders it. */
  renderDialog?: boolean;
}

/**
 * The primary action of a vacancy, by viewer:
 * guest → login (comes back with `?apply=1`), candidate → apply dialog or the current
 * status (from the server), HR/admin → nothing.
 */
export function ApplyAction({
  vacancy,
  open = true,
  size = 'md',
  className,
  dialogOpen,
  onDialogOpenChange,
  renderDialog = true,
}: ApplyActionProps) {
  const t = useTranslations('vacancy');
  const { data: me } = useViewer();
  const [localOpen, setLocalOpen] = useState(false);
  const isOpen = dialogOpen ?? localOpen;
  const setOpen = onDialogOpenChange ?? setLocalOpen;
  const btn = cn('min-h-11 px-5', size === 'lg' && 'h-12 text-base', className);

  if (me && me.role !== 'candidate') return null;

  const status = vacancy.viewer?.application_status ?? null;
  // The dialog stays mounted when the status flips to "applied", so its success view shows.
  const dialog =
    me && renderDialog ? (
      <ApplyDialog vacancy={vacancy} open={isOpen} onOpenChange={setOpen} />
    ) : null;

  let trigger;
  if (me && hasActiveApplication(status)) {
    trigger = (
      <div className={cn('flex flex-wrap items-center gap-2', size === 'lg' && 'w-full')}>
        <Button asChild variant="secondary" size="lg" className={btn}>
          <Link href="/candidate/applications">
            <Check aria-hidden="true" />
            {t('applied')}
          </Link>
        </Button>
        {status !== 'applied' ? <ApplicationStatusBadge status={status!} /> : null}
      </div>
    );
  } else if (!open) {
    trigger = (
      <Button size="lg" variant="secondary" className={btn} disabled>
        {t('closedShort')}
      </Button>
    );
  } else if (!me) {
    trigger = (
      <Button asChild size="lg" className={btn}>
        <Link href={loginHref(`/vacancies/${vacancy.id}?apply=1`)}>{t('apply')}</Link>
      </Button>
    );
  } else {
    trigger = (
      <Button size="lg" className={btn} onClick={() => setOpen(true)}>
        {status === 'withdrawn' ? t('reapply') : t('apply')}
      </Button>
    );
  }

  return (
    <>
      {trigger}
      {dialog}
    </>
  );
}
