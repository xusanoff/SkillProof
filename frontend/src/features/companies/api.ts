'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authKeys } from '@/features/auth';
import { fileUpload, unwrap } from '@/lib/api';
import { useApi } from '@/lib/api/use-api';
import type { Company, CompanyCreateBody } from './model';

export const companyKeys = {
  all: ['companies'] as const,
  detail: (id: string) => [...companyKeys.all, id] as const,
  members: (id: string) => [...companyKeys.all, id, 'members'] as const,
  invitations: (id: string) => [...companyKeys.all, id, 'invitations'] as const,
  invitation: (token: string) => ['invitation', token] as const,
};

export function useCompany(id: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: companyKeys.detail(id ?? ''),
    queryFn: () =>
      unwrap(api.GET('/api/v1/companies/{company_id}', { params: { path: { company_id: id! } } })),
    enabled: !!id,
  });
}

export function useCreateCompany() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CompanyCreateBody) => unwrap(api.POST('/api/v1/companies', { body })),
    onSuccess: async (company) => {
      queryClient.setQueryData(companyKeys.detail(company.id), company);
      // `me.companies` drives the HR area.
      await queryClient.invalidateQueries({ queryKey: authKeys.me() });
    },
  });
}

function useSetCompany() {
  const queryClient = useQueryClient();
  return (company: Company) => {
    queryClient.setQueryData(companyKeys.detail(company.id), company);
    void queryClient.invalidateQueries({ queryKey: authKeys.me() }); // name may have changed
  };
}

export function useUpdateCompany(id: string) {
  const api = useApi();
  const setCompany = useSetCompany();
  return useMutation({
    mutationFn: (body: CompanyCreateBody) =>
      unwrap(
        api.PATCH('/api/v1/companies/{company_id}', { params: { path: { company_id: id } }, body }),
      ),
    onSuccess: setCompany,
  });
}

export function useUploadLogo(id: string) {
  const api = useApi();
  const setCompany = useSetCompany();
  return useMutation({
    mutationFn: (file: File) =>
      unwrap(
        api.POST('/api/v1/companies/{company_id}/logo', {
          params: { path: { company_id: id } },
          ...fileUpload(file),
        }),
      ),
    onSuccess: setCompany,
  });
}

export function useMembers(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: companyKeys.members(id),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/companies/{company_id}/members', { params: { path: { company_id: id } } }),
      ),
  });
}

export function useRemoveMember(id: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      unwrap(
        api.DELETE('/api/v1/companies/{company_id}/members/{user_id}', {
          params: { path: { company_id: id, user_id: userId } },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: companyKeys.members(id) }),
  });
}

/** Owner only — callers pass `enabled: isOwner` (a plain HR member would get 403). */
export function useInvitations(id: string, enabled: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: companyKeys.invitations(id),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/companies/{company_id}/invitations', {
          params: { path: { company_id: id } },
        }),
      ),
    enabled,
  });
}

export function useInvite(id: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (email: string) =>
      unwrap(
        api.POST('/api/v1/companies/{company_id}/invitations', {
          params: { path: { company_id: id } },
          body: { email },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: companyKeys.invitations(id) }),
  });
}

export function useRevokeInvitation(id: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) =>
      unwrap(
        api.DELETE('/api/v1/companies/{company_id}/invitations/{invitation_id}', {
          params: { path: { company_id: id, invitation_id: invitationId } },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: companyKeys.invitations(id) }),
  });
}

export function usePublicInvitation(token: string) {
  const api = useApi();
  return useQuery({
    queryKey: companyKeys.invitation(token),
    queryFn: () => unwrap(api.GET('/api/v1/invitations/{token}', { params: { path: { token } } })),
  });
}

export function useAcceptInvitation(token: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      unwrap(api.POST('/api/v1/invitations/{token}/accept', { params: { path: { token } } })),
    onSuccess: async (company) => {
      queryClient.setQueryData(companyKeys.detail(company.id), company);
      await queryClient.invalidateQueries({ queryKey: authKeys.me() });
      await queryClient.invalidateQueries({ queryKey: companyKeys.invitation(token) });
    },
  });
}
