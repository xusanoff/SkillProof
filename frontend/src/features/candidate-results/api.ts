'use client';

import { useQuery } from '@tanstack/react-query';
import { unwrap } from '@/lib/api';
import { useApi } from '@/lib/api/use-api';
import { resultsKeys } from './model';

/** The candidate's own results. `pending` refreshes every 5 s; other states stay as they are. */
export function useCandidateResults(applicationId: string) {
  const api = useApi();
  return useQuery({
    queryKey: resultsKeys.one(applicationId),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/applications/{application_id}/results', {
          params: { path: { application_id: applicationId } },
        }),
      ),
    refetchInterval: (q) => (q.state.data?.state === 'pending' ? 5000 : false),
  });
}
