'use client';

import { CircleDashed } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { Notice } from '@/components/common/notice';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { useErrorText } from '@/lib/forms';
import { useMe, useVerifyEmail } from '../api';
import { homeFor } from '../model';
import { ResendVerificationButton } from './resend-verification';

/** Submits the token from the email link once, on arrival, and shows the result. */
export function VerifyEmail() {
  const t = useTranslations('auth.verify');
  const errorText = useErrorText();
  const token = useSearchParams().get('token');
  const verify = useVerifyEmail();
  const { data: me } = useMe();
  const sent = useRef(false);
  const { mutate } = verify;

  useEffect(() => {
    // Ref guard: StrictMode runs effects twice in dev; a token is single-use.
    if (!token || sent.current) return;
    sent.current = true;
    mutate(token);
  }, [token, mutate]);

  const continueHref = me ? homeFor(me.role) : '/login';
  const continueLabel = me ? t('continue') : t('toLogin');

  if (!token || verify.isError) {
    return (
      <div className="grid gap-4">
        <Notice tone="danger" role="alert" title={t('failedTitle')}>
          {token ? errorText(verify.error) : t('missingToken')}
        </Notice>
        {me && !me.is_email_verified ? <ResendVerificationButton /> : null}
        {!me ? (
          <Button asChild variant="outline" size="lg" className="min-h-11 justify-self-start px-4">
            <Link href="/login">{t('toLogin')}</Link>
          </Button>
        ) : null}
      </div>
    );
  }

  if (verify.isSuccess) {
    return (
      <div className="grid gap-4">
        <Notice tone="success" role="status" title={t('successTitle')}>
          {t('successBody')}
        </Notice>
        <Button asChild size="lg" className="min-h-11 justify-self-start px-5">
          <Link href={continueHref}>{continueLabel}</Link>
        </Button>
      </div>
    );
  }

  return (
    <p role="status" className="inline-flex items-center gap-2 text-muted">
      <CircleDashed aria-hidden="true" className="size-5 animate-spin" />
      {t('checking')}
    </p>
  );
}
