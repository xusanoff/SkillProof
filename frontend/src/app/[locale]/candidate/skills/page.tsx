import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { VerifiedSkillsPage } from '@/features/verified-skills';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('verifiedSkills');
  return { title: t('title'), robots: { index: false } };
}

export default function Page() {
  return <VerifiedSkillsPage />;
}
