'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fileUpload, unwrap } from '@/lib/api';
import { useApi } from '@/lib/api/use-api';
import type { CandidateProfile, ProfileBody } from './model';

export const candidateKeys = {
  all: ['candidate'] as const,
  profile: () => [...candidateKeys.all, 'profile'] as const,
};

export function useProfile() {
  const api = useApi();
  return useQuery({
    queryKey: candidateKeys.profile(),
    queryFn: () => unwrap(api.GET('/api/v1/candidate/profile')),
  });
}

function useSetProfile() {
  const queryClient = useQueryClient();
  return (profile: CandidateProfile) => queryClient.setQueryData(candidateKeys.profile(), profile);
}

export function useSaveProfile() {
  const api = useApi();
  const setProfile = useSetProfile();
  return useMutation({
    mutationFn: (body: ProfileBody) => unwrap(api.PUT('/api/v1/candidate/profile', { body })),
    onSuccess: setProfile,
  });
}

export function useUploadResume() {
  const api = useApi();
  const setProfile = useSetProfile();
  return useMutation({
    mutationFn: (file: File) =>
      unwrap(api.POST('/api/v1/candidate/profile/resume', fileUpload(file))),
    onSuccess: setProfile,
  });
}

export function useDeleteResume() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.DELETE('/api/v1/candidate/profile/resume')),
    onSuccess: () =>
      queryClient.setQueryData<CandidateProfile>(candidateKeys.profile(), (p) =>
        p ? { ...p, resume: null } : p,
      ),
  });
}

/**
 * Download through the API client (so an expired access token is refreshed first),
 * then hand the blob to the browser with the original filename.
 */
export function useDownloadResume() {
  const api = useApi();
  return useMutation({
    mutationFn: async (filename: string) => {
      const blob = (await unwrap(
        api.GET('/api/v1/candidate/profile/resume', { parseAs: 'blob' }),
      )) as unknown as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
  });
}
