import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { NewVacancy } from '@/features/hr-vacancies';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('vacancyForm');
  return { title: t('titleNew') };
}

export default function Page() {
  return <NewVacancy />;
}
