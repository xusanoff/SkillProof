'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { applicationKeys } from '@/features/applications';
import { unwrap } from '@/lib/api';
import { useApi } from '@/lib/api/use-api';
import { reportPhase, type HrReport, type OverrideBody } from './model';

export const reportKeys = {
  all: (cid: string) => ['hr-report', cid] as const,
  report: (cid: string, aid: string) => [...reportKeys.all(cid), aid, 'report'] as const,
  notes: (cid: string, aid: string) => [...reportKeys.all(cid), aid, 'notes'] as const,
};

/** The report. Until it is written (`state` null / `pending`) it refreshes itself every 5 s. */
export function useHrReport(companyId: string, applicationId: string) {
  const api = useApi();
  return useQuery({
    queryKey: reportKeys.report(companyId, applicationId),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/companies/{company_id}/applications/{application_id}/report', {
          params: { path: { company_id: companyId, application_id: applicationId } },
        }),
      ),
    refetchInterval: (q) =>
      q.state.data && reportPhase(q.state.data) === 'evaluating' ? 5000 : false,
  });
}

/** Waits for the server; the returned report replaces the cached one and the HR list is refreshed. */
export function useOverride(companyId: string, applicationId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: OverrideBody) =>
      unwrap(
        api.POST('/api/v1/companies/{company_id}/applications/{application_id}/overrides', {
          params: { path: { company_id: companyId, application_id: applicationId } },
          body,
        }),
      ),
    onSuccess: (report: HrReport) => {
      queryClient.setQueryData(reportKeys.report(companyId, applicationId), report);
      return queryClient.invalidateQueries({ queryKey: applicationKeys.company(companyId) });
    },
  });
}

export function useNotes(companyId: string, applicationId: string) {
  const api = useApi();
  return useQuery({
    queryKey: reportKeys.notes(companyId, applicationId),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/companies/{company_id}/applications/{application_id}/notes', {
          params: { path: { company_id: companyId, application_id: applicationId } },
        }),
      ),
  });
}

export function useAddNote(companyId: string, applicationId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (text: string) =>
      unwrap(
        api.POST('/api/v1/companies/{company_id}/applications/{application_id}/notes', {
          params: { path: { company_id: companyId, application_id: applicationId } },
          body: { text },
        }),
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: reportKeys.notes(companyId, applicationId) }),
  });
}
