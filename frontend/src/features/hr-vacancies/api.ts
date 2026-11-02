'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { vacancyKeys } from '@/features/vacancies';
import { unwrap } from '@/lib/api';
import { useApi } from '@/lib/api/use-api';
import { type VacancyInput, type VacancyPatch, type VacancyStatus } from './model';

export const hrVacancyKeys = {
  all: (companyId: string) => ['hr-vacancies', companyId] as const,
  list: (companyId: string, status: VacancyStatus | null, page: number, pageSize: number) =>
    [...hrVacancyKeys.all(companyId), 'list', status, page, pageSize] as const,
  detail: (companyId: string, id: string) =>
    [...hrVacancyKeys.all(companyId), 'detail', id] as const,
};

export function useHrVacancies(
  companyId: string,
  status: VacancyStatus | null,
  page = 1,
  pageSize = 20,
) {
  const api = useApi();
  return useQuery({
    queryKey: hrVacancyKeys.list(companyId, status, page, pageSize),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/companies/{company_id}/vacancies', {
          params: {
            path: { company_id: companyId },
            query: { page, page_size: pageSize, ...(status ? { status } : {}) },
          },
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

export function useHrVacancy(companyId: string, id: string) {
  const api = useApi();
  return useQuery({
    queryKey: hrVacancyKeys.detail(companyId, id),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/companies/{company_id}/vacancies/{vacancy_id}', {
          params: { path: { company_id: companyId, vacancy_id: id } },
        }),
      ),
  });
}

function useInvalidate(companyId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: hrVacancyKeys.all(companyId) }),
      // The public board shows published ones.
      queryClient.invalidateQueries({ queryKey: vacancyKeys.all }),
    ]);
}

export function useCreateVacancy(companyId: string) {
  const api = useApi();
  const invalidate = useInvalidate(companyId);
  return useMutation({
    mutationFn: (body: VacancyInput) =>
      unwrap(
        api.POST('/api/v1/companies/{company_id}/vacancies', {
          params: { path: { company_id: companyId } },
          body,
        }),
      ),
    onSuccess: invalidate,
  });
}

/** Edits and status changes (publish / close / reopen / archive). Waits for the server. */
export function useUpdateVacancy(companyId: string) {
  const api = useApi();
  const invalidate = useInvalidate(companyId);
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: VacancyPatch }) =>
      unwrap(
        api.PATCH('/api/v1/companies/{company_id}/vacancies/{vacancy_id}', {
          params: { path: { company_id: companyId, vacancy_id: id } },
          body,
        }),
      ),
    onSuccess: invalidate,
  });
}

export function useDeleteVacancy(companyId: string) {
  const api = useApi();
  const invalidate = useInvalidate(companyId);
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api.DELETE('/api/v1/companies/{company_id}/vacancies/{vacancy_id}', {
          params: { path: { company_id: companyId, vacancy_id: id } },
        }),
      ),
    onSuccess: invalidate,
  });
}
