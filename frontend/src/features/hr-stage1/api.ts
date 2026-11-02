'use client';

import { useQuery } from '@tanstack/react-query';
import { unwrap } from '@/lib/api';
import { useApi } from '@/lib/api/use-api';

export const stage1Keys = {
  report: (cid: string, aid: string) => ['hr-stage1', cid, aid] as const,
};

/** `404` = Stage 1 was not started (the page shows that, it is not an error). */
export function useStage1Report(companyId: string, applicationId: string) {
  const api = useApi();
  return useQuery({
    queryKey: stage1Keys.report(companyId, applicationId),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/companies/{company_id}/applications/{application_id}/stage1', {
          params: { path: { company_id: companyId, application_id: applicationId } },
        }),
      ),
    // A report whose evaluation is still running refreshes itself.
    refetchInterval: (q) => (q.state.data?.evaluation_state === 'pending' ? 5000 : false),
  });
}
