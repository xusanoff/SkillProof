import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { ReportFromUrl } from './report-from-url';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('hrReport');
  return { title: t('title'), robots: { index: false } };
}

export default function Page() {
  return (
    <Suspense>
      <ReportFromUrl />
    </Suspense>
  );
}
