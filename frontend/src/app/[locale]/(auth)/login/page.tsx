import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { AuthShell, LoginForm } from '@/features/auth';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.login');
  return { title: t('title'), robots: { index: false } };
}

export default function Page() {
  const t = useTranslations('auth.login');
  return (
    <AuthShell title={t('title')} lead={t('lead')}>
      {/* The form reads search params (next, token): client-only, behind Suspense. */}
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
