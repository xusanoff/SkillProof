import { REGIONS } from '@/data/regions';
import type { ResponseOf } from '@/lib/api';

export type Region = ResponseOf<'/api/v1/regions', 'get'>[number];
export type ProfessionArea = ResponseOf<'/api/v1/profession-areas', 'get'>[number];
export type Skill = ResponseOf<'/api/v1/skills', 'get'>[number];

/** Used only when `GET /api/v1/regions` fails (D-021 → D-030). Same shape as the API. */
export const FALLBACK_REGIONS: Region[] = REGIONS.map((r) => ({
  code: r.code,
  country: r.code.slice(0, 2),
  names: { ...r.names },
}));

/** Name in the UI locale → uz (default) → any → the code itself. */
export function localizedName(
  names: Record<string, string> | null | undefined,
  locale: string,
  fallback = '',
): string {
  if (!names) return fallback;
  return names[locale] || names.uz || Object.values(names)[0] || fallback;
}

export function regionLabel(
  regions: readonly Region[] | undefined,
  code: string | null | undefined,
  locale: string,
): string | null {
  if (!code) return null;
  const region = (regions ?? FALLBACK_REGIONS).find((r) => r.code === code);
  return region ? localizedName(region.names, locale, code) : code;
}
