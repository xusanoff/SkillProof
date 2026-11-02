'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, unwrap } from '@/lib/api';
import { useApi } from '@/lib/api/use-api';
import {
  isJobDone,
  JOB_POLL_MS,
  type AssessmentIn,
  type BankFiltersShape,
  type GenerateIn,
  type QuestionIn,
  type TaskIn,
} from './model';

export type BankKind = 'questions' | 'tasks';

export type BankFilters = BankFiltersShape;

export const assessmentKeys = {
  bank: (companyId: string, kind: BankKind) => ['hr-bank', companyId, kind] as const,
  list: (companyId: string, kind: BankKind, f: BankFilters) =>
    [...assessmentKeys.bank(companyId, kind), 'list', f] as const,
  assessment: (companyId: string, vacancyId: string) =>
    ['hr-assessment', companyId, vacancyId] as const,
  job: (companyId: string, jobId: string) => ['hr-generation-job', companyId, jobId] as const,
  skills: () => ['hr-bank', 'skills'] as const,
};

const PAGE_SIZE = 20;

function listQuery(f: BankFilters, pageSize: number) {
  return {
    page: f.page,
    page_size: pageSize,
    include_global: f.include_global,
    ...(f.q.trim() ? { q: f.q.trim() } : {}),
    ...(f.skill_id ? { skill_id: f.skill_id } : {}),
    ...(f.approved !== 'all' ? { approved: f.approved === 'yes' } : {}),
    ...(f.source !== 'all' ? { source: f.source } : {}),
  };
}

export const BANK_PAGE_SIZE = PAGE_SIZE;

export function useQuestions(companyId: string, f: BankFilters, pageSize = PAGE_SIZE) {
  const api = useApi();
  return useQuery({
    queryKey: [...assessmentKeys.list(companyId, 'questions', f), pageSize],
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/companies/{company_id}/questions', {
          params: { path: { company_id: companyId }, query: listQuery(f, pageSize) },
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

export function useTasks(companyId: string, f: BankFilters, pageSize = PAGE_SIZE) {
  const api = useApi();
  return useQuery({
    queryKey: [...assessmentKeys.list(companyId, 'tasks', f), pageSize],
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/companies/{company_id}/tasks', {
          params: { path: { company_id: companyId }, query: listQuery(f, pageSize) },
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

/** First 100 skills as an id → name index (the API has no skill-by-id endpoint). */
export function useSkillIndex() {
  const api = useApi();
  return useQuery({
    queryKey: assessmentKeys.skills(),
    queryFn: () => unwrap(api.GET('/api/v1/skills', { params: { query: { limit: 100 } } })),
    staleTime: 60 * 60_000,
  });
}

function useInvalidateBank(companyId: string) {
  const qc = useQueryClient();
  return (kind: BankKind) =>
    Promise.all([
      qc.invalidateQueries({ queryKey: assessmentKeys.bank(companyId, kind) }),
      // Assessment readiness depends on approval / content of bank items.
      qc.invalidateQueries({ queryKey: ['hr-assessment', companyId] }),
    ]);
}

export function useSaveQuestion(companyId: string) {
  const api = useApi();
  const invalidate = useInvalidateBank(companyId);
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: QuestionIn }) =>
      id
        ? unwrap(
            api.PUT('/api/v1/companies/{company_id}/questions/{item_id}', {
              params: { path: { company_id: companyId, item_id: id } },
              body,
            }),
          )
        : unwrap(
            api.POST('/api/v1/companies/{company_id}/questions', {
              params: { path: { company_id: companyId } },
              body,
            }),
          ),
    onSuccess: () => invalidate('questions'),
  });
}

export function useSaveTask(companyId: string) {
  const api = useApi();
  const invalidate = useInvalidateBank(companyId);
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: TaskIn }) =>
      id
        ? unwrap(
            api.PUT('/api/v1/companies/{company_id}/tasks/{item_id}', {
              params: { path: { company_id: companyId, item_id: id } },
              body,
            }),
          )
        : unwrap(
            api.POST('/api/v1/companies/{company_id}/tasks', {
              params: { path: { company_id: companyId } },
              body,
            }),
          ),
    onSuccess: () => invalidate('tasks'),
  });
}

export function useDeleteBankItem(companyId: string, kind: BankKind) {
  const api = useApi();
  const invalidate = useInvalidateBank(companyId);
  return useMutation({
    mutationFn: (id: string) => {
      const path = { company_id: companyId, item_id: id };
      return kind === 'questions'
        ? unwrap(
            api.DELETE('/api/v1/companies/{company_id}/questions/{item_id}', { params: { path } }),
          )
        : unwrap(
            api.DELETE('/api/v1/companies/{company_id}/tasks/{item_id}', { params: { path } }),
          );
    },
    onSuccess: () => invalidate(kind),
  });
}

export function useApproveBankItem(companyId: string, kind: BankKind) {
  const api = useApi();
  const invalidate = useInvalidateBank(companyId);
  return useMutation({
    mutationFn: async ({ id, approved }: { id: string; approved: boolean }) => {
      const path = { company_id: companyId, item_id: id };
      if (kind === 'questions') {
        await unwrap(
          api.POST('/api/v1/companies/{company_id}/questions/{item_id}/approve', {
            params: { path },
            body: { approved },
          }),
        );
      } else {
        await unwrap(
          api.POST('/api/v1/companies/{company_id}/tasks/{item_id}/approve', {
            params: { path },
            body: { approved },
          }),
        );
      }
    },
    onSuccess: () => invalidate(kind),
  });
}

/** `null` = nothing saved yet (the API answers 404 until the first PUT). */
export function useAssessment(companyId: string, vacancyId: string) {
  const api = useApi();
  return useQuery({
    queryKey: assessmentKeys.assessment(companyId, vacancyId),
    queryFn: async () => {
      try {
        return await unwrap(
          api.GET('/api/v1/companies/{company_id}/vacancies/{vacancy_id}/assessment', {
            params: { path: { company_id: companyId, vacancy_id: vacancyId } },
          }),
        );
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
  });
}

export function useSaveAssessment(companyId: string, vacancyId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AssessmentIn) =>
      unwrap(
        api.PUT('/api/v1/companies/{company_id}/vacancies/{vacancy_id}/assessment', {
          params: { path: { company_id: companyId, vacancy_id: vacancyId } },
          body,
        }),
      ),
    onSuccess: (data) => qc.setQueryData(assessmentKeys.assessment(companyId, vacancyId), data),
  });
}

export function useGenerateAssessment(companyId: string, vacancyId: string) {
  const api = useApi();
  return useMutation({
    mutationFn: (body: GenerateIn) =>
      unwrap(
        api.POST('/api/v1/companies/{company_id}/vacancies/{vacancy_id}/assessment/generate', {
          params: { path: { company_id: companyId, vacancy_id: vacancyId } },
          body,
        }),
      ),
  });
}

/** Polls every ~2 s until `succeeded` / `failed`. */
export function useGenerationJob(companyId: string, jobId: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: assessmentKeys.job(companyId, jobId ?? ''),
    enabled: jobId !== null,
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/companies/{company_id}/generation-jobs/{job_id}', {
          params: { path: { company_id: companyId, job_id: jobId! } },
        }),
      ),
    refetchInterval: (query) => (isJobDone(query.state.data) ? false : JOB_POLL_MS),
    staleTime: 0,
  });
}

export function useRefreshAfterGeneration(companyId: string, vacancyId: string) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: assessmentKeys.assessment(companyId, vacancyId) }),
      qc.invalidateQueries({ queryKey: assessmentKeys.bank(companyId, 'questions') }),
      qc.invalidateQueries({ queryKey: assessmentKeys.bank(companyId, 'tasks') }),
    ]);
}
