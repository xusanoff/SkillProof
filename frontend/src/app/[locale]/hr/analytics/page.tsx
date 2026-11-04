import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AnalyticsPage } from '@/features/hr-analytics';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('hr.analytics');
  return { title: t('title') };
}

export default function Page() {
  return <AnalyticsPage />;
}
