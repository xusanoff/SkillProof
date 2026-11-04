import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { OverviewPage } from '@/features/admin';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.overview');
  return { title: t('title') };
}

export default function Page() {
  return <OverviewPage />;
}
