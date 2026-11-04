import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { ResultsFromUrl } from './results-from-url';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('candidateResults');
  return { title: t('title'), robots: { index: false } };
}

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <Suspense>
        <ResultsFromUrl />
      </Suspense>
    </div>
  );
}
