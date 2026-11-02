import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { ComingSoon } from '@/components/common/coming-soon';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav.menu');
  return { title: t('results') };
}

export default function Page() {
  const t = useTranslations('nav.menu');
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <ComingSoon title={t('results')} />
    </div>
  );
}
