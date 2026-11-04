'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { unwrap } from '@/lib/api';
import { useApi } from '@/lib/api/use-api';
import type { ResponseOf } from '@/lib/api/types';

export type AdminUser = ResponseOf<'/api/v1/admin/users', 'get'>['items'][number];
export type AdminCompany = ResponseOf<'/api/v1/admin/companies', 'get'>['items'][number];
export type AdminVacancy = ResponseOf<'/api/v1/admin/vacancies', 'get'>['items'][number];
export type ThresholdsOut = ResponseOf<'/api/v1/admin/thresholds', 'get'>;
export type AiUsageOut = ResponseOf<'/api/v1/admin/ai-usage', 'get'>;
export type UsageBucket = AiUsageOut['total'];

export const ADMIN_PAGE_SIZE = 20;

export interface ListQuery {
  q: string;
  page: number;
}

const keys = {
  all: ['admin'] as const,
  overview: () => [...keys.all, 'overview'] as const,
  users: (q: ListQuery) => [...keys.all, 'users', q] as const,
  companies: (q: ListQuery) => [...keys.all, 'companies', q] as const,
  vacancies: (q: ListQuery) => [...keys.all, 'vacancies', q] as const,
  thresholds: () => [...keys.all, 'thresholds'] as const,
  aiUsage: (days: number) => [...keys.all, 'ai-usage', days] as const,
};

function listParams({ q, page }: ListQuery) {
  return { page, size: ADMIN_PAGE_SIZE, ...(q.trim() ? { q: q.trim() } : {}) };
}

export function useAdminOverview() {
  const api = useApi();
  return useQuery({
    queryKey: keys.overview(),
    queryFn: () => unwrap(api.GET('/api/v1/admin/overview')),
  });
}

export function useAdminUsers(query: ListQuery) {
  const api = useApi();
  return useQuery({
    queryKey: keys.users(query),
    queryFn: () => unwrap(api.GET('/api/v1/admin/users', { params: { query: listParams(query) } })),
    placeholderData: keepPreviousData,
  });
}

export function useAdminCompanies(query: ListQuery) {
  const api = useApi();
  return useQuery({
    queryKey: keys.companies(query),
    queryFn: () =>
      unwrap(api.GET('/api/v1/admin/companies', { params: { query: listParams(query) } })),
    placeholderData: keepPreviousData,
  });
}

export function useAdminVacancies(query: ListQuery) {
  const api = useApi();
  return useQuery({
    queryKey: keys.vacancies(query),
    queryFn: () =>
      unwrap(api.GET('/api/v1/admin/vacancies', { params: { query: listParams(query) } })),
    placeholderData: keepPreviousData,
  });
}

function useRefreshAdmin() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: keys.all });
}

export function useSetUserActive() {
  const api = useApi();
  const refresh = useRefreshAdmin();
  return useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      unwrap(
        api.PATCH('/api/v1/admin/users/{user_id}', {
          params: { path: { user_id: id } },
          body: { is_active },
        }),
      ),
    onSuccess: refresh,
  });
}

export function useUpdateCompany() {
  const api = useApi();
  const refresh = useRefreshAdmin();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      is_verified?: boolean;
      blocked?: boolean;
      reason?: string;
    }) =>
      unwrap(
        api.PATCH('/api/v1/admin/companies/{company_id}', {
          params: { path: { company_id: id } },
          body,
        }),
      ),
    onSuccess: refresh,
  });
}

export function useUpdateVacancy() {
  const api = useApi();
  const refresh = useRefreshAdmin();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; hidden: boolean; reason?: string }) =>
      unwrap(
        api.PATCH('/api/v1/admin/vacancies/{vacancy_id}', {
          params: { path: { vacancy_id: id } },
          body,
        }),
      ),
    onSuccess: refresh,
  });
}

export function useThresholds() {
  const api = useApi();
  return useQuery({
    queryKey: keys.thresholds(),
    queryFn: () => unwrap(api.GET('/api/v1/admin/thresholds')),
  });
}

export function useSaveThresholds() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (overrides: Record<string, unknown>) =>
      unwrap(api.PUT('/api/v1/admin/thresholds', { body: { overrides } })),
    onSuccess: (saved) => qc.setQueryData(keys.thresholds(), saved),
  });
}

export function useAiUsage(days: number) {
  const api = useApi();
  return useQuery({
    queryKey: keys.aiUsage(days),
    queryFn: () => unwrap(api.GET('/api/v1/admin/ai-usage', { params: { query: { days } } })),
    placeholderData: keepPreviousData,
  });
}
