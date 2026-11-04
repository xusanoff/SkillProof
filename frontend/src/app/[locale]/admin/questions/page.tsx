import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { TemplateQuestionBank } from '@/features/hr-assessments';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('hrBank.question');
  return { title: t('title') };
}

export default function Page() {
  return (
    <Suspense>
      <TemplateQuestionBank />
    </Suspense>
  );
}
