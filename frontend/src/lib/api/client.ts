import createClient, { type Middleware } from 'openapi-fetch';
import { ApiError, toApiError } from './errors';
import type { paths } from './paths';

/**
 * Browser: same-origin `/api` (forwarded by src/app/api/[...path]/route.ts).
 * Server: talk to the API directly via API_INTERNAL_URL.
 */
export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') {
    return process.env.API_INTERNAL_URL || 'http://localhost:8000';
  }
  const publicUrl = process.env.NEXT_PUBLIC_API_URL || '/api';
  // Absolute URL: `new Request()` rejects relative URLs outside the browser (tests, workers).
  return new URL(publicUrl, window.location.origin).toString().replace(/\/$/, '');
}

export interface CreateApiOptions {
  locale: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  /** Called when a 401 could not be fixed by refreshing the session. */
  onUnauthenticated?: () => void;
}

export function createApi({
  locale,
  baseUrl,
  fetch: customFetch,
  onUnauthenticated,
}: CreateApiOptions) {
  const resolvedBase = baseUrl ?? getApiBaseUrl();
  // Resolve fetch lazily so instrumentation/mocks installed later (MSW, APM) are honoured.
  const rawFetch = customFetch ?? ((input: Request) => globalThis.fetch(input));
  const client = createClient<paths>({
    baseUrl: resolvedBase,
    // Auth uses httpOnly cookies (PROJECT_SPEC §3) — never tokens in JS.
    credentials: 'include',
    fetch: withSessionRefresh(rawFetch, resolvedBase, onUnauthenticated),
  });
  client.use(acceptLanguage(locale));
  return client;
}

export type ApiClient = ReturnType<typeof createApi>;

function acceptLanguage(locale: string): Middleware {
  return {
    onRequest({ request }) {
      request.headers.set('Accept-Language', locale);
      return request;
    },
  };
}

/** Auth endpoints whose 401 means "wrong credentials/token", not "session expired". */
const NO_REFRESH_PATHS = [
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/refresh',
  '/api/v1/auth/logout',
  '/api/v1/auth/password/',
  '/api/v1/auth/verify-email',
];

/** One in-flight refresh per base URL, shared by every concurrent 401. */
const refreshes = new Map<string, Promise<boolean>>();

export function refreshSession(baseUrl: string, doFetch: (r: Request) => Promise<Response>) {
  let pending = refreshes.get(baseUrl);
  if (!pending) {
    pending = doFetch(
      new Request(`${baseUrl}/api/v1/auth/refresh`, { method: 'POST', credentials: 'include' }),
    )
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => refreshes.delete(baseUrl));
    refreshes.set(baseUrl, pending);
  }
  return pending;
}

/**
 * 401 → a single shared `POST /auth/refresh` → retry the request once.
 * Still 401 (or refresh failed) → `onUnauthenticated()` and the 401 is returned.
 * Cookies are httpOnly; this never reads or stores a token.
 */
export function withSessionRefresh(
  doFetch: (r: Request) => Promise<Response>,
  baseUrl: string,
  onUnauthenticated?: () => void,
) {
  return async (request: Request): Promise<Response> => {
    const basePath = new URL(baseUrl).pathname.replace(/\/$/, '');
    const path = new URL(request.url).pathname.slice(basePath.length);
    if (NO_REFRESH_PATHS.some((p) => path.startsWith(p))) return doFetch(request);

    const retry = request.clone(); // the body of `request` is consumed by the first attempt
    const response = await doFetch(request);
    if (response.status !== 401) return response;

    if (!(await refreshSession(baseUrl, doFetch))) {
      onUnauthenticated?.();
      return response;
    }
    const second = await doFetch(retry);
    if (second.status === 401) onUnauthenticated?.();
    return second;
  };
}

interface FetchResultLike {
  data?: unknown;
  error?: unknown;
  response: Response;
}

/** Success data of an openapi-fetch result (the error branch's `data?: never` adds `undefined`). */
type DataOf<R extends FetchResultLike> = Exclude<R['data'], undefined>;

/**
 * Turns an openapi-fetch result into data or a thrown `ApiError`.
 * Network failures (fetch throws) become `ApiError(0, 'network')`.
 */
export async function unwrap<R extends FetchResultLike>(promise: Promise<R>): Promise<DataOf<R>> {
  let result: R;
  try {
    result = await promise;
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError(0, 'network', cause instanceof Error ? cause.message : 'Network error');
  }
  if (result.error !== undefined || !result.response.ok) {
    throw toApiError(result.response.status, result.error);
  }
  return result.data as DataOf<R>;
}
