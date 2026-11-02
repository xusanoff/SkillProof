import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { CandidateApplications } from '@/features/applications';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav.menu');
  return { title: t('applications'), robots: { index: false } };
}

export default function Page() {
  return (
    <Suspense>
      <CandidateApplications />
    </Suspense>
  );
}
