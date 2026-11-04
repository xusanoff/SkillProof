'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { notFound } from 'next/navigation';
import { ErrorState } from '@/components/common/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, unwrap } from '@/lib/api';
import { useApi } from '@/lib/api/use-api';
import { useErrorText } from '@/lib/forms';
import { PublicProfileView } from './public-profile';

/** Browser retry when the server could not reach the API (status 0); a 404 is still the not-found page. */
export function PublicProfileLive({ candidateId }: { candidateId: string }) {
  const api = useApi();
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const query = useQuery({
    queryKey: ['public-profile', candidateId],
    retry: false,
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/profiles/{candidate_id}', {
          params: { path: { candidate_id: candidateId } },
        }),
      ),
  });
  if (query.error instanceof ApiError && query.error.status === 404) notFound();
  if (query.isError) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <ErrorState
          headingLevel={1}
          title={errorText(query.error)}
          onRetry={() => query.refetch()}
          retryLabel={tc('retry')}
        />
      </div>
    );
  }
  if (!query.data) {
    return (
      <div className="mx-auto grid w-full max-w-3xl gap-4 px-4 py-8 sm:px-6" aria-hidden="true">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  return <PublicProfileView profile={query.data} />;
}
