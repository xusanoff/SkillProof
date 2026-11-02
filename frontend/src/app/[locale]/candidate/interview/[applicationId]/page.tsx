import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { InterviewFromUrl } from './interview-from-url';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('interview');
  return { title: t('title'), robots: { index: false } };
}

export default function Page() {
  return (
    <Suspense>
      <InterviewFromUrl />
    </Suspense>
  );
}
