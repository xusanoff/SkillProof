import type { NextRequest } from 'next/server';

/**
 * Same-origin proxy: browser → `/api/<path>` → `${API_INTERNAL_URL}/<path>`.
 *
 * A route handler (instead of `rewrites()` in next.config) because rewrites are
 * serialised into the standalone build, so API_INTERNAL_URL could not change
 * at container runtime. This handler reads the env var on every request.
 * Cookies pass through both ways (httpOnly auth cookies, PROJECT_SPEC §3).
 */

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
]);

// fetch() already decoded the body, so these would be wrong downstream.
const STRIP_FROM_RESPONSE = new Set([...HOP_BY_HOP, 'content-encoding', 'content-length']);

function upstreamBase(): string {
  return (process.env.API_INTERNAL_URL || 'http://localhost:8000').replace(/\/$/, '');
}

async function forward(request: NextRequest, ctx: RouteContext<'/api/[...path]'>) {
  const { path } = await ctx.params;
  const target = new URL(`${upstreamBase()}/${path.map(encodeURIComponent).join('/')}`);
  target.search = request.nextUrl.search;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
  });
  headers.set('x-forwarded-host', request.headers.get('host') ?? '');
  headers.set('x-forwarded-proto', request.nextUrl.protocol.replace(':', ''));

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
      // Required by Node's fetch when streaming a request body.
      ...(hasBody ? { duplex: 'half' } : {}),
    } as RequestInit);
  } catch {
    return Response.json(
      {
        error: {
          code: 'upstream_unavailable',
          message: 'The API server could not be reached.',
          details: {},
          request_id: request.headers.get('x-request-id'),
        },
      },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!STRIP_FROM_RESPONSE.has(key.toLowerCase()) && key.toLowerCase() !== 'set-cookie') {
      responseHeaders.set(key, value);
    }
  });
  for (const cookie of upstream.headers.getSetCookie()) {
    responseHeaders.append('set-cookie', cookie);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const GET = forward;
export const HEAD = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
export const OPTIONS = forward;
