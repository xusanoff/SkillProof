'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { useEffect } from 'react';
import { useHydrated } from '@/lib/use-hydrated';
import { appConfig } from '@/config/app';
import { ApiError, unwrap } from '@/lib/api';
import { SESSION_EXPIRED_EVENT, useApi } from '@/lib/api/use-api';
import type { Locale } from '@/i18n/routing';
import {
  browserTimeZone,
  type ForgotValues,
  type LoginValues,
  type Me,
  type RegisterValues,
} from './model';

export const authKeys = {
  all: ['auth'] as const,
  me: () => [...authKeys.all, 'me'] as const,
};

/**
 * Current user, or `null` when anonymous. 401 (after the client's single refresh attempt)
 * means "signed out", not an error. Cookies are httpOnly; JS never sees tokens.
 */
export function useMe() {
  const api = useApi();
  return useQuery({
    queryKey: authKeys.me(),
    queryFn: async (): Promise<Me | null> => {
      try {
        return await unwrap(api.GET('/api/v1/auth/me'));
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 60_000,
  });
}

/**
 * `useMe()` for markup that is server-rendered: reports "pending" until hydration is done,
 * so the first client render always matches the (anonymous) server HTML.
 */
export function useViewer() {
  const me = useMe();
  const hydrated = useHydrated();
  return {
    data: hydrated ? me.data : undefined,
    isPending: !hydrated || me.isPending,
  };
}

/** Mount once: when the API client reports an unrecoverable 401, the user is signed out. */
export function useSessionExpiry() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const onExpired = () => queryClient.setQueryData(authKeys.me(), null);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [queryClient]);
}

function useSetMe() {
  const queryClient = useQueryClient();
  return (me: Me | null) => queryClient.setQueryData(authKeys.me(), me);
}

export function useLogin() {
  const api = useApi();
  const setMe = useSetMe();
  return useMutation({
    mutationFn: (body: LoginValues) => unwrap(api.POST('/api/v1/auth/login', { body })),
    onSuccess: setMe,
  });
}

export function useRegister() {
  const api = useApi();
  const setMe = useSetMe();
  const locale = useLocale() as Locale;
  return useMutation({
    mutationFn: (values: RegisterValues) =>
      unwrap(
        api.POST('/api/v1/auth/register', {
          body: {
            ...values,
            locale,
            timezone: browserTimeZone() ?? appConfig.defaultTimeZone,
          },
        }),
      ),
    onSuccess: setMe,
  });
}

export function useLogout() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.POST('/api/v1/auth/logout')),
    // Even if the call fails (offline), forget everything locally.
    onSettled: () => {
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== authKeys.all[0] });
      queryClient.setQueryData(authKeys.me(), null);
    },
  });
}

export function useVerifyEmail() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      unwrap(api.POST('/api/v1/auth/verify-email', { body: { token } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: authKeys.me() }),
  });
}

export function useResendVerification() {
  const api = useApi();
  return useMutation({
    mutationFn: () => unwrap(api.POST('/api/v1/auth/resend-verification')),
  });
}

export function useForgotPassword() {
  const api = useApi();
  return useMutation({
    mutationFn: (body: ForgotValues) => unwrap(api.POST('/api/v1/auth/password/forgot', { body })),
  });
}

export function useResetPassword() {
  const api = useApi();
  const setMe = useSetMe();
  return useMutation({
    mutationFn: (body: { token: string; password: string }) =>
      unwrap(api.POST('/api/v1/auth/password/reset', { body })),
    // The API revokes every session after a reset.
    onSuccess: () => setMe(null),
  });
}

export function useUpdateMe() {
  const api = useApi();
  const setMe = useSetMe();
  return useMutation({
    mutationFn: (body: { full_name?: string; locale?: Locale; timezone?: string }) =>
      unwrap(api.PATCH('/api/v1/auth/me', { body })),
    onSuccess: setMe,
  });
}
