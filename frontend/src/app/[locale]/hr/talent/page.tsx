import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { TalentSearch } from '@/features/verified-skills';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('talent');
  return { title: t('title'), robots: { index: false } };
}

export default function Page() {
  return (
    <Suspense>
      <TalentSearch />
    </Suspense>
  );
}
