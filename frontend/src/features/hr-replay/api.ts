'use client';

import { useQuery } from '@tanstack/react-query';
import { unwrap } from '@/lib/api';
import { useApi } from '@/lib/api/use-api';

export function useReplay(companyId: string, applicationId: string, taskId: string) {
  const api = useApi();
  return useQuery({
    queryKey: ['hr-replay', companyId, applicationId, taskId],
    queryFn: () =>
      unwrap(
        api.GET(
          '/api/v1/companies/{company_id}/applications/{application_id}/stage1/replay/{task_id}',
          {
            params: {
              path: { company_id: companyId, application_id: applicationId, task_id: taskId },
            },
          },
        ),
      ),
    staleTime: 5 * 60_000,
  });
}
