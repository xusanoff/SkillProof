import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { HrCandidates } from '@/features/applications';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav.menu');
  return { title: t('candidates') };
}

export default function Page() {
  return (
    <Suspense>
      <HrCandidates />
    </Suspense>
  );
}
