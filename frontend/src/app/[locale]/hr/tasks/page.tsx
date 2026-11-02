import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { TaskBank } from '@/features/hr-assessments';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('hrBank.task');
  return { title: t('title') };
}

export default function Page() {
  return (
    <Suspense>
      <TaskBank />
    </Suspense>
  );
}
