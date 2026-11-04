'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { unwrap } from '@/lib/api';
import { useApi } from '@/lib/api/use-api';
import { replaceSkill, TALENT_PAGE_SIZE, type TalentQuery, type VerifiedSkill } from './model';

export const verifiedKeys = {
  mine: ['verified-skills'] as const,
  talent: (companyId: string, ids: string[], min: number | null, page: number) =>
    ['talent', companyId, ids, min, page] as const,
};

export function useVerifiedSkills() {
  const api = useApi();
  return useQuery({
    queryKey: verifiedKeys.mine,
    queryFn: () => unwrap(api.GET('/api/v1/candidate/verified-skills')),
  });
}

/** Waits for the server (a public page shows a real name): not optimistic. */
export function useSetSkillPublic() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; is_public: boolean }) =>
      unwrap(
        api.PATCH('/api/v1/candidate/verified-skills/{verified_id}', {
          params: { path: { verified_id: v.id } },
          body: { is_public: v.is_public },
        }),
      ),
    onSuccess: (row) =>
      qc.setQueryData<VerifiedSkill[]>(verifiedKeys.mine, (list) =>
        list ? replaceSkill(list, row) : list,
      ),
  });
}

export function useTalent(companyId: string, q: TalentQuery, enabled: boolean) {
  const api = useApi();
  const ids = q.skills.map((s) => s.id);
  return useQuery({
    queryKey: verifiedKeys.talent(companyId, ids, q.minScore, q.page),
    enabled,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/v1/companies/{company_id}/talent', {
          params: {
            path: { company_id: companyId },
            query: {
              skill_id: ids,
              min_score: q.minScore ?? undefined,
              page: q.page,
              page_size: TALENT_PAGE_SIZE,
            },
          },
          signal,
        }),
      ),
  });
}
