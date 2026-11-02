import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';

/** No retry on 4xx; at most 2 retries on network / 5xx (react-architecture §6). */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.isClientError) return false;
  return failureCount < 2;
}

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: shouldRetry,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
}
