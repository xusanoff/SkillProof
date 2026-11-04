'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { interviewKeys } from '@/features/interview/api';
import { unwrap } from '@/lib/api';
import { useApi } from '@/lib/api/use-api';
import { answerForm, POLL_PREPARING_MS, type AnswerPayload, type Stage2State } from './model';

export const stage2Keys = {
  state: (sid: string) => ['interview-stage2', sid] as const,
};

const PATH = '/api/v1/interview-sessions/{session_id}/stage2' as const;

/** Server state of the oral interview; polls every 2 s while the next question is being prepared. */
export function useStage2(sid: string) {
  const api = useApi();
  return useQuery({
    queryKey: stage2Keys.state(sid),
    queryFn: () => unwrap(api.GET(PATH, { params: { path: { session_id: sid } } })),
    staleTime: 0,
    refetchInterval: (q) => (q.state.data?.preparing ? POLL_PREPARING_MS : false),
  });
}

export function useStartStage2(aid: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      unwrap(
        api.POST('/api/v1/applications/{application_id}/interview/stage2/start', {
          params: { path: { application_id: aid } },
        }),
      ),
    onSuccess: (s) => {
      qc.setQueryData(stage2Keys.state(s.id), s);
      void qc.invalidateQueries({ queryKey: interviewKeys.state(aid) });
    },
  });
}

export function useSubmitAnswer(sid: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: AnswerPayload) =>
      unwrap(
        api.POST('/api/v1/interview-sessions/{session_id}/stage2/turns/{turn_id}/answer', {
          params: { path: { session_id: sid, turn_id: a.turnId } },
          body: {} as never,
          bodySerializer: () => answerForm(a),
        }),
      ),
    onSuccess: (s: Stage2State) => qc.setQueryData(stage2Keys.state(sid), s),
  });
}

/** `sid` may be given later (right after `start`, when the id is not known yet). */
export function useFallbackText(sid?: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id?: string) =>
      unwrap(
        api.POST('/api/v1/interview-sessions/{session_id}/stage2/fallback-text', {
          params: { path: { session_id: (id ?? sid) as string } },
        }),
      ),
    onSuccess: (s: Stage2State) => qc.setQueryData(stage2Keys.state(s.id), s),
  });
}

/** Question audio as a blob URL; the caller revokes it. */
export function useQuestionAudioFetcher(sid: string) {
  const api = useApi();
  return async (turnId: string): Promise<string> => {
    const { data, error } = await api.GET(
      '/api/v1/interview-sessions/{session_id}/stage2/turns/{turn_id}/question-audio',
      { params: { path: { session_id: sid, turn_id: turnId } }, parseAs: 'blob' },
    );
    if (error || !data) throw new Error('question audio');
    return URL.createObjectURL(data as Blob);
  };
}
