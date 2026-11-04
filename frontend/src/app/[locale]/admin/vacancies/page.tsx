import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { VacanciesPage } from '@/features/admin';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.vacancies');
  return { title: t('title') };
}

export default function Page() {
  return <VacanciesPage />;
}
