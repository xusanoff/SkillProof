import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CandidateProfilePage } from '@/features/candidate';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('candidate.profile');
  return { title: t('title') };
}

export default function Page() {
  return <CandidateProfilePage />;
}
