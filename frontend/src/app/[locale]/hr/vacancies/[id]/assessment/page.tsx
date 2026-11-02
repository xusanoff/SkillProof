import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { AssessmentFromUrl } from './assessment-from-url';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('hrAssessment');
  return { title: t('title') };
}

export default function Page() {
  return (
    <Suspense>
      <AssessmentFromUrl />
    </Suspense>
  );
}
