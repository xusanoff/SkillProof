import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { InvitationFromUrl } from './invitation-from-url';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('invitation');
  return { title: t('metaTitle'), robots: { index: false } };
}

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
      {/* The token is request data: stream it in behind a boundary. */}
      <Suspense>
        <InvitationFromUrl />
      </Suspense>
    </div>
  );
}
