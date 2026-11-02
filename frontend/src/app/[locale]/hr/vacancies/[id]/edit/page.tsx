import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { EditFromUrl } from './edit-from-url';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('vacancyForm');
  return { title: t('titleEdit') };
}

export default function Page() {
  return (
    <Suspense>
      <EditFromUrl />
    </Suspense>
  );
}
