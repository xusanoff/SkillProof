import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CompanyEdit } from '@/features/companies';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('hr.company');
  return { title: t('title') };
}

export default function Page() {
  return <CompanyEdit />;
}
