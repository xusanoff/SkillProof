'use client';

import { MailWarning } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import { usePathname } from '@/i18n/navigation';
import { useMe } from '../api';
import { ResendVerificationButton } from './resend-verification';

/** Site-wide prompt while the email is not verified (hidden on the verify page itself). */
export function VerifyEmailBanner() {
  return (
    <Suspense>
      <Banner />
    </Suspense>
  );
}

function Banner() {
  const t = useTranslations('auth.verify');
  const { data: me } = useMe();
  const pathname = usePathname();
  if (!me || me.is_email_verified || pathname === '/verify-email') return null;

  return (
    <section aria-label={t('bannerLabel')} className="border-b border-warning/30 bg-warning-soft">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
        <p className="flex flex-1 items-start gap-2 text-sm">
          <MailWarning aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>{t('banner', { email: me.email })}</span>
        </p>
        <ResendVerificationButton />
      </div>
    </section>
  );
}
