'use client';

import { useQuery } from '@tanstack/react-query';
import { unwrap } from '@/lib/api';
import { useApi } from '@/lib/api/use-api';

export const systemKeys = {
  all: ['system'] as const,
  health: () => [...systemKeys.all, 'health'] as const,
};

export function useHealth() {
  const api = useApi();
  return useQuery({
    queryKey: systemKeys.health(),
    queryFn: () => unwrap(api.GET('/health')),
    // A status page should show the current state, not a cached one.
    staleTime: 0,
  });
}
