'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { filtersToSearchParams, parseFilters, type VacancyFilters } from './model';

/**
 * Filter state lives in the URL (shareable, back button works). Changes use
 * `history.pushState`, which Next syncs into `useSearchParams` without a server round
 * trip — the list query refetches on the client (the server renders only the first load).
 */
export function useUrlFilters() {
  const search = useSearchParams();
  const key = search.toString();
  const filters = useMemo(() => parseFilters(new URLSearchParams(key)), [key]);

  const navigate = useCallback(
    (next: VacancyFilters, { scroll = false }: { scroll?: boolean } = {}) => {
      const qs = filtersToSearchParams(next).toString();
      window.history.pushState(null, '', qs ? `?${qs}` : window.location.pathname);
      if (scroll) window.scrollTo({ top: 0 });
    },
    [],
  );
  return { filters, navigate };
}
