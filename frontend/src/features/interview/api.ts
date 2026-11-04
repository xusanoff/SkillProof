'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { unwrap } from '@/lib/api';
import { useApi } from '@/lib/api/use-api';
import {
  needsResultPolling,
  RESULT_POLL_MS,
  type CodeIn,
  type InterviewState,
  type StartBody,
  type Session,
} from './model';

export const interviewKeys = {
  state: (aid: string) => ['interview', aid] as const,
  session: (sid: string) => ['interview-session', sid] as const,
};

export function useInterviewState(aid: string) {
  const api = useApi();
  return useQuery({
    queryKey: interviewKeys.state(aid),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/applications/{application_id}/interview', {
          params: { path: { application_id: aid } },
        }),
      ),
    staleTime: 0,
  });
}

export function useAcceptRules(aid: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rules_version: string) =>
      unwrap(
        api.POST('/api/v1/applications/{application_id}/interview/rules', {
          params: { path: { application_id: aid } },
          body: { rules_version },
        }),
      ),
    onSuccess: (data) => qc.setQueryData(interviewKeys.state(aid), data),
  });
}

export function useWarmupRun(aid: string) {
  const api = useApi();
  return useMutation({
    mutationFn: (body: CodeIn) =>
      unwrap(
        api.POST('/api/v1/applications/{application_id}/interview/warmup/run', {
          params: { path: { application_id: aid } },
          body,
        }),
      ),
  });
}

export function useStartStage1(aid: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body?: StartBody) =>
      unwrap(
        api.POST('/api/v1/applications/{application_id}/interview/stage1', {
          params: { path: { application_id: aid } },
          ...(body ? { body } : {}),
        }),
      ),
    onSuccess: (session) => {
      qc.setQueryData(interviewKeys.session(session.id), session);
      qc.setQueryData<InterviewState>(interviewKeys.state(aid), (s) => (s ? { ...s, session } : s));
      // Fully covered by verified skills: Stage 2 becomes available, the server says so.
      if (session.status === 'completed') {
        void qc.invalidateQueries({ queryKey: interviewKeys.state(aid) });
      }
    },
  });
}

/** `session` from the interview state seeds the cache; every reconnect refetches it. */
export function useSession(sid: string, initial?: Session) {
  const api = useApi();
  return useQuery({
    queryKey: interviewKeys.session(sid),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/interview-sessions/{session_id}', {
          params: { path: { session_id: sid } },
        }),
      ),
    initialData: initial,
    staleTime: Infinity,
    // The result is scored after the stage ends: poll until it is no longer `pending`.
    refetchInterval: (query) => (needsResultPolling(query.state.data) ? RESULT_POLL_MS : false),
  });
}

export function useRunTask(sid: string, tid: string) {
  const api = useApi();
  return useMutation({
    mutationFn: (body: CodeIn) =>
      unwrap(
        api.POST('/api/v1/interview-sessions/{session_id}/tasks/{task_id}/run', {
          params: { path: { session_id: sid, task_id: tid } },
          body,
        }),
      ),
  });
}

export function useSubmitTask(sid: string, tid: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CodeIn) =>
      unwrap(
        api.POST('/api/v1/interview-sessions/{session_id}/tasks/{task_id}/submit', {
          params: { path: { session_id: sid, task_id: tid } },
          body,
        }),
      ),
    onSuccess: (session) => qc.setQueryData(interviewKeys.session(sid), session),
  });
}
