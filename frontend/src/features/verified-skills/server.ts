/** Server Component access for the public profile (no cookies: the page is the same for everyone). */
import { connection } from 'next/server';
import { cache } from 'react';
import { ApiError, createApi, unwrap } from '@/lib/api';
import { isUuid, type PublicProfile } from './model';

export type LoadedProfile = { ok: true; data: PublicProfile } | { ok: false; status: number };

export const fetchPublicProfile = cache(
  async (locale: string, candidateId: string): Promise<LoadedProfile> => {
    await connection();
    if (!isUuid(candidateId)) return { ok: false, status: 404 };
    try {
      const api = createApi({
        locale,
        fetch: ((input: RequestInfo | URL, init?: RequestInit) =>
          globalThis.fetch(input, {
            ...init,
            cache: 'no-store',
            signal: AbortSignal.timeout(5_000),
          })) as typeof globalThis.fetch,
      });
      const data = await unwrap(
        api.GET('/api/v1/profiles/{candidate_id}', {
          params: { path: { candidate_id: candidateId } },
        }),
      );
      return { ok: true, data };
    } catch (e) {
      return { ok: false, status: e instanceof ApiError ? e.status : 0 };
    }
  },
);
