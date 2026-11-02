import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { SavedVacancies } from '@/features/vacancies';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav.menu');
  return { title: t('saved'), robots: { index: false } };
}

export default function Page() {
  return (
    <Suspense>
      <SavedVacancies />
    </Suspense>
  );
}
