import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TeamPage } from '@/features/companies';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('hr.team');
  return { title: t('title') };
}

export default function Page() {
  return <TeamPage />;
}
