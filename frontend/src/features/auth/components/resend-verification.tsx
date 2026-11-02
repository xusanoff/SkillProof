'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useErrorText } from '@/lib/forms';
import { cn } from '@/lib/utils';
import { useResendVerification } from '../api';

export function ResendVerificationButton({
  variant = 'outline',
  className,
}: {
  variant?: 'outline' | 'default';
  className?: string;
}) {
  const t = useTranslations('auth.verify');
  const errorText = useErrorText();
  const resend = useResendVerification();

  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1', className)}>
      <Button
        type="button"
        variant={variant}
        size="lg"
        className="min-h-11 px-4"
        disabled={resend.isPending || resend.isSuccess}
        aria-busy={resend.isPending || undefined}
        onClick={() => resend.mutate()}
      >
        {resend.isPending ? t('resending') : t('resend')}
      </Button>
      <span aria-live="polite" className="text-sm">
        {resend.isSuccess ? <span className="text-success">{t('resent')}</span> : null}
        {resend.isError ? <span className="text-danger">{errorText(resend.error)}</span> : null}
      </span>
    </div>
  );
}
