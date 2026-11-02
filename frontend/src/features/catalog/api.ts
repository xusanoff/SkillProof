'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { unwrap } from '@/lib/api';
import { useApi } from '@/lib/api/use-api';
import { FALLBACK_REGIONS, regionLabel, type Region } from './model';

export const catalogKeys = {
  regions: (country: string) => ['catalog', 'regions', country] as const,
  areas: () => ['catalog', 'profession-areas'] as const,
  skills: (q: string) => ['catalog', 'skills', q] as const,
};

/** Reference data changes rarely: keep it for the session. */
const REFERENCE = { staleTime: 60 * 60_000, gcTime: 2 * 60 * 60_000 } as const;

/**
 * Regions from the API. Until it answers (and if it fails) the bundled list is used,
 * so server-rendered cards and the header select always have names (D-030).
 */
export function useRegions(country = 'UZ') {
  const api = useApi();
  const query = useQuery({
    queryKey: catalogKeys.regions(country),
    queryFn: () => unwrap(api.GET('/api/v1/regions', { params: { query: { country } } })),
    ...REFERENCE,
  });
  const regions: Region[] = query.data && query.data.length ? query.data : FALLBACK_REGIONS;
  return { ...query, regions };
}

export function useRegionLabel() {
  const locale = useLocale();
  const { regions } = useRegions();
  return (code: string | null | undefined) => regionLabel(regions, code, locale);
}

export function useProfessionAreas() {
  const api = useApi();
  return useQuery({
    queryKey: catalogKeys.areas(),
    queryFn: () => unwrap(api.GET('/api/v1/profession-areas')),
    ...REFERENCE,
  });
}

/** Skill autocomplete (filters, vacancy form). Empty query → no request. */
export function useSkillSearch(q: string, limit = 10) {
  const api = useApi();
  const query = q.trim();
  return useQuery({
    queryKey: catalogKeys.skills(query),
    queryFn: ({ signal }) =>
      unwrap(api.GET('/api/v1/skills', { params: { query: { q: query, limit } }, signal })),
    enabled: query.length >= 1,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
}

/** Display name of a skill slug from the URL (`?skill=fastapi`); the slug until known. */
export function useSkillName(slug: string): string {
  const api = useApi();
  const { data } = useQuery({
    queryKey: ['catalog', 'skill-by-slug', slug],
    queryFn: () => unwrap(api.GET('/api/v1/skills', { params: { query: { q: slug, limit: 10 } } })),
    staleTime: 60 * 60_000,
    select: (skills) => skills.find((s) => s.slug === slug)?.name,
  });
  return data ?? slug;
}
