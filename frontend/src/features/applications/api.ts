'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { patchViewer } from '@/features/vacancies';
import { unwrap } from '@/lib/api';
import { useApi } from '@/lib/api/use-api';
import type { ApplicationStatus, HrStatus } from './model';

export const applicationKeys = {
  all: ['applications'] as const,
  mine: (status: ApplicationStatus | null, page: number) =>
    [...applicationKeys.all, 'mine', status, page] as const,
  company: (companyId: string) => [...applicationKeys.all, 'company', companyId] as const,
  companyList: (
    companyId: string,
    q: { vacancyId: string | null; status: ApplicationStatus; page: number },
  ) => [...applicationKeys.company(companyId), q] as const,
};

export function useMyApplications(status: ApplicationStatus | null, page: number) {
  const api = useApi();
  return useQuery({
    queryKey: applicationKeys.mine(status, page),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/candidate/applications', {
          params: { query: { page, ...(status ? { status } : {}) } },
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

/** Withdraw: confirmed in a dialog, waits for the server. */
export function useWithdraw() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (applicationId: string) =>
      unwrap(
        api.POST('/api/v1/candidate/applications/{application_id}/withdraw', {
          params: { path: { application_id: applicationId } },
        }),
      ),
    onSuccess: (app) => {
      patchViewer(queryClient, app.vacancy.id, (v) => ({ ...v, application_status: app.status }));
      return queryClient.invalidateQueries({ queryKey: applicationKeys.all });
    },
  });
}

/** Lists the company's applications. Note: the API marks returned items as seen by HR. */
export function useCompanyApplications(
  companyId: string,
  q: { vacancyId: string | null; status: ApplicationStatus; page: number },
) {
  const api = useApi();
  return useQuery({
    queryKey: applicationKeys.companyList(companyId, q),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/companies/{company_id}/applications', {
          params: {
            path: { company_id: companyId },
            query: {
              status: q.status,
              page: q.page,
              ...(q.vacancyId ? { vacancy_id: q.vacancyId } : {}),
            },
          },
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

/** Shortlist / reject / back to new. Not optimistic (react-architecture §6). */
export function useSetApplicationStatus(companyId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: HrStatus }) =>
      unwrap(
        api.PATCH('/api/v1/companies/{company_id}/applications/{application_id}', {
          params: { path: { company_id: companyId, application_id: id } },
          body: { status },
        }),
      ),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: applicationKeys.company(companyId) }),
        queryClient.invalidateQueries({ queryKey: ['hr-vacancies', companyId] }),
      ]),
  });
}

/** Browser URL of the resume download (same-origin proxy; the httpOnly cookie authorises it). */
export function resumeUrl(companyId: string, applicationId: string): string {
  const base = (process.env.NEXT_PUBLIC_API_URL || '/api').replace(/\/$/, '');
  return `${base}/api/v1/companies/${encodeURIComponent(companyId)}/applications/${encodeURIComponent(applicationId)}/resume`;
}
