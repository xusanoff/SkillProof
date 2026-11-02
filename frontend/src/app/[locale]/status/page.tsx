import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { StatusPanel } from '@/features/system';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('status');
  return { title: t('metaTitle') };
}

export default function StatusPage() {
  const t = useTranslations('status');

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        {t('title')}
      </h1>
      <p className="mt-3 text-muted">{t('lead')}</p>
      <div className="mt-10">
        <StatusPanel />
      </div>
    </div>
  );
}
