'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useViewer } from '@/features/auth';
import { ApiError, unwrap } from '@/lib/api';
import { useApi } from '@/lib/api/use-api';
import {
  filtersToSearchParams,
  PAGE_SIZE,
  toApiQuery,
  type ApplicationStatus,
  type VacancyCard,
  type VacancyDetail,
  type VacancyFilters,
  type VacancyPage,
} from './model';

/** `anon` or the candidate's id: `viewer` fields differ per signed-in candidate. */
export type ViewerKey = string;

export const vacancyKeys = {
  all: ['vacancies'] as const,
  lists: () => [...vacancyKeys.all, 'list'] as const,
  list: (params: string, viewer: ViewerKey) => [...vacancyKeys.lists(), viewer, params] as const,
  details: () => [...vacancyKeys.all, 'detail'] as const,
  detail: (id: string, viewer: ViewerKey) => [...vacancyKeys.details(), id, viewer] as const,
  saved: (page: number) => [...vacancyKeys.all, 'saved', page] as const,
  company: (slug: string, page: number, viewer: ViewerKey) =>
    [...vacancyKeys.all, 'company', slug, page, viewer] as const,
};

/** Only candidates get `viewer` data (saved / applied); everyone else shares the public cache. */
export function useViewerKey(): { key: ViewerKey; isCandidate: boolean; isReady: boolean } {
  const { data: me, isPending } = useViewer();
  const isCandidate = me?.role === 'candidate';
  return { key: isCandidate ? me.id : 'anon', isCandidate, isReady: !isPending };
}

/** Server-rendered first page (SSR) → reused as initial data when the query matches. */
export interface InitialPage {
  params: string;
  data: VacancyPage;
}

export function useVacancyList(
  filters: VacancyFilters,
  { initial, pageSize = PAGE_SIZE }: { initial?: InitialPage | null; pageSize?: number } = {},
) {
  const api = useApi();
  const viewer = useViewerKey();
  const params = filtersToSearchParams(filters).toString();
  const useInitial = !!initial && initial.params === params && viewer.key === 'anon';
  return useQuery({
    queryKey: [...vacancyKeys.list(params, viewer.key), pageSize],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/v1/vacancies', { params: { query: toApiQuery(filters, pageSize) }, signal }),
      ),
    initialData: useInitial ? initial.data : undefined,
    // Keep the previous page on screen while the next one loads (no layout jump).
    placeholderData: keepPreviousData,
  });
}

export function useVacancy(id: string, initial?: VacancyDetail | null) {
  const api = useApi();
  const viewer = useViewerKey();
  return useQuery({
    queryKey: vacancyKeys.detail(id, viewer.key),
    queryFn: () =>
      unwrap(api.GET('/api/v1/vacancies/{vacancy_id}', { params: { path: { vacancy_id: id } } })),
    initialData: viewer.key === 'anon' && initial ? initial : undefined,
    placeholderData: initial ?? undefined,
  });
}

export function useCompanyVacancies(slug: string, page: number, initial?: VacancyPage | null) {
  const api = useApi();
  const viewer = useViewerKey();
  return useQuery({
    queryKey: vacancyKeys.company(slug, page, viewer.key),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/companies/by-slug/{slug}/vacancies', {
          params: { path: { slug }, query: { page } },
        }),
      ),
    initialData: viewer.key === 'anon' && initial ? initial : undefined,
    placeholderData: keepPreviousData,
  });
}

export function useSavedVacancies(page: number) {
  const api = useApi();
  return useQuery({
    queryKey: vacancyKeys.saved(page),
    queryFn: () =>
      unwrap(api.GET('/api/v1/candidate/saved-vacancies', { params: { query: { page } } })),
    placeholderData: keepPreviousData,
  });
}

type Viewer = NonNullable<VacancyCard['viewer']>;

/** Patch `viewer` of one vacancy everywhere it is cached (lists, saved, company, detail). */
export function patchViewer(
  queryClient: QueryClient,
  vacancyId: string,
  patch: (viewer: Viewer) => Viewer,
) {
  const patchCard = <T extends { id: string; viewer?: Viewer | null }>(v: T): T =>
    v.id === vacancyId ? { ...v, viewer: patch(v.viewer ?? EMPTY_VIEWER) } : v;

  queryClient.setQueriesData<VacancyPage>(
    { queryKey: vacancyKeys.all, predicate: (q) => q.queryKey[1] !== 'detail' },
    (page) =>
      page && Array.isArray(page.items) ? { ...page, items: page.items.map(patchCard) } : page,
  );
  queryClient.setQueriesData<VacancyDetail>({ queryKey: vacancyKeys.details() }, (v) =>
    v && v.id === vacancyId ? patchCard(v) : v,
  );
}

const EMPTY_VIEWER: Viewer = { is_saved: false, application_status: null };

/**
 * Save / unsave: optimistic (a safe, reversible action — react-architecture §6),
 * rolled back if the API refuses.
 */
export function useToggleSave() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, save }: { id: string; save: boolean }) =>
      unwrap(
        save
          ? api.PUT('/api/v1/candidate/saved-vacancies/{vacancy_id}', {
              params: { path: { vacancy_id: id } },
            })
          : api.DELETE('/api/v1/candidate/saved-vacancies/{vacancy_id}', {
              params: { path: { vacancy_id: id } },
            }),
      ),
    onMutate: async ({ id, save }) => {
      await queryClient.cancelQueries({ queryKey: vacancyKeys.all });
      const snapshot = queryClient.getQueriesData({ queryKey: vacancyKeys.all });
      patchViewer(queryClient, id, (v) => ({ ...v, is_saved: save }));
      return { snapshot };
    },
    onError: (_error, _vars, context) => {
      for (const [key, data] of context?.snapshot ?? []) queryClient.setQueryData(key, data);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [...vacancyKeys.all, 'saved'] }),
  });
}

/**
 * Apply: waits for the server (not optimistic — react-architecture §6).
 * `already_applied` means the server already has it: show it as applied.
 */
export function useApply(vacancyId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (coverNote: string) =>
      unwrap(
        api.POST('/api/v1/vacancies/{vacancy_id}/apply', {
          params: { path: { vacancy_id: vacancyId } },
          body: { cover_note: coverNote.trim() ? coverNote.trim() : null },
        }),
      ),
    onSuccess: (application) => {
      patchViewer(queryClient, vacancyId, (v) => ({
        ...v,
        application_status: application.status,
      }));
      void queryClient.invalidateQueries({ queryKey: ['applications'] });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'already_applied') {
        patchViewer(queryClient, vacancyId, (v) => ({
          ...v,
          application_status:
            v.application_status && v.application_status !== 'withdrawn'
              ? v.application_status
              : 'applied',
        }));
        void queryClient.invalidateQueries({ queryKey: vacancyKeys.details() });
      }
    },
  });
}

export function applicationStatusOf(
  vacancy: Pick<VacancyCard, 'viewer'>,
): ApplicationStatus | null {
  return vacancy.viewer?.application_status ?? null;
}
