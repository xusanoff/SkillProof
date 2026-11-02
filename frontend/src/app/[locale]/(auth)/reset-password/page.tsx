import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { AuthShell, ResetPasswordForm } from '@/features/auth';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.reset');
  return { title: t('title'), robots: { index: false } };
}

export default function Page() {
  const t = useTranslations('auth.reset');
  return (
    <AuthShell title={t('title')} lead={t('lead')}>
      {/* The form reads search params (next, token): client-only, behind Suspense. */}
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
