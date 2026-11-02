'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { ErrorState } from '@/components/common/error-state';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

export default function LocaleError({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations();

  useEffect(() => {
    // Surface the error; never swallow it silently.
    console.error(error);
  }, [error]);

  return (
    <section className="mx-auto w-full max-w-6xl flex-1 px-4 py-16 sm:px-6">
      <ErrorState
        headingLevel={1}
        title={t('errorPage.title')}
        description={t('errorPage.body')}
        onRetry={retry}
        retryLabel={t('common.retry')}
      >
        <Button asChild variant="outline" size="lg" className="min-h-11 px-4">
          <Link href="/">{t('common.backHome')}</Link>
        </Button>
      </ErrorState>
    </section>
  );
}
