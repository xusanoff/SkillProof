/**
 * Server Component data access for the public job board (SEO: first page server-rendered).
 * Talks to the API directly (`API_INTERNAL_URL`, see `getApiBaseUrl`) WITHOUT the user's
 * cookies: public responses are the same for everyone, and `viewer` fields (saved / applied)
 * are loaded by the client for signed-in candidates.
 *
 * Import from Server Components only (`@/features/vacancies/server`).
 */
import { connection } from 'next/server';
import { cache } from 'react';
import { ApiError, createApi, unwrap } from '@/lib/api';
import { filtersToSearchParams, PAGE_SIZE, toApiQuery, type VacancyFilters } from './model';

export type Loaded<T> =
  | { ok: true; data: T }
  /** `status` 0 = API unreachable: the client retries in the browser. */
  | { ok: false; status: number; code: string };

async function load<T>(fn: () => Promise<T>): Promise<Loaded<T>> {
  // Request-time data: never prerendered at build (Cache Components).
  await connection();
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, status: error.status, code: error.code };
    return { ok: false, status: 0, code: 'network' };
  }
}

const TIMEOUT_MS = 5_000;

function serverApi(locale: string) {
  return createApi({
    locale,
    fetch: ((input: RequestInfo | URL, init?: RequestInit) =>
      globalThis.fetch(input, {
        ...init,
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })) as typeof globalThis.fetch,
  });
}

export function fetchVacancyPage(locale: string, filters: VacancyFilters, pageSize = PAGE_SIZE) {
  return load(async () => {
    const data = await unwrap(
      serverApi(locale).GET('/api/v1/vacancies', {
        params: { query: toApiQuery(filters, pageSize) },
      }),
    );
    return { params: filtersToSearchParams(filters).toString(), data };
  });
}

/** Deduplicated between `generateMetadata` and the page in one request. */
export const fetchVacancy = cache((locale: string, id: string) =>
  load(() =>
    unwrap(
      serverApi(locale).GET('/api/v1/vacancies/{vacancy_id}', {
        params: { path: { vacancy_id: id } },
      }),
    ),
  ),
);

export const fetchCompany = cache((locale: string, slug: string) =>
  load(() =>
    unwrap(
      serverApi(locale).GET('/api/v1/companies/by-slug/{slug}', { params: { path: { slug } } }),
    ),
  ),
);

export function fetchCompanyVacancies(locale: string, slug: string, page: number) {
  return load(() =>
    unwrap(
      serverApi(locale).GET('/api/v1/companies/by-slug/{slug}/vacancies', {
        params: { path: { slug }, query: { page } },
      }),
    ),
  );
}

/** A path id we are willing to forward to the API (UUID-ish, no slashes). */
export function isSafeId(value: string): boolean {
  return /^[A-Za-z0-9-]{1,64}$/.test(value);
}
