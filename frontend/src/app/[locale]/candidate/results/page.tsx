import type { Locale } from 'next-intl';
import { redirect } from '@/i18n/navigation';

/** "Natijalar" in the menu: results live per application, so this opens the list of applications. */
export default async function Page({ params }: PageProps<'/[locale]/candidate/results'>) {
  const { locale } = await params;
  redirect({ href: '/candidate/applications', locale: locale as Locale });
}
