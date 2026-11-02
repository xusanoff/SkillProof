import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { HrHome } from '@/features/companies';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('hr.home');
  return { title: t('metaTitle') };
}

export default function Page() {
  return <HrHome />;
}
