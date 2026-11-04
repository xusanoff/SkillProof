import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ErrorState } from '@/components/common/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { PublicProfileLive, PublicProfileView } from '@/features/verified-skills';
import { fetchPublicProfile } from '@/features/verified-skills/server';

type Props = PageProps<'/[locale]/profiles/[candidateId]'>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { candidateId } = await params;
  const t = await getTranslations('verifiedSkills.publicPage');
  const res = await fetchPublicProfile(await getLocale(), candidateId);
  return {
    title: res.ok ? t('metaTitle', { name: res.data.full_name }) : t('metaFallback'),
    robots: { index: false, follow: false },
  };
}

export default function Page({ params }: Props) {
  return (
    <Suspense fallback={<Loading />}>
      <Profile params={params} />
    </Suspense>
  );
}

async function Profile({ params }: Pick<Props, 'params'>) {
  const { candidateId } = await params;
  const res = await fetchPublicProfile(await getLocale(), candidateId);
  if (!res.ok) {
    if (res.status === 404) notFound();
    // API unreachable from the server: the browser asks it itself.
    if (res.status === 0) return <PublicProfileLive candidateId={candidateId} />;
    const t = await getTranslations('errors');
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <ErrorState headingLevel={1} title={t('internal_error')} />
      </div>
    );
  }
  return <PublicProfileView profile={res.data} />;
}

function Loading() {
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4 px-4 py-8 sm:px-6" aria-hidden="true">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
