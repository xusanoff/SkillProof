import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { API, server } from '@/test/msw';
import { createApi, unwrap } from './client';
import { ApiError, errorMessageKey } from './errors';

const api = createApi({ locale: 'ru' });

describe('unwrap', () => {
  it('returns data and sends Accept-Language', async () => {
    let lang: string | null = null;
    server.use(
      http.get(`${API}/health`, ({ request }) => {
        lang = request.headers.get('accept-language');
        return HttpResponse.json({
          status: 'ok',
          version: '0.1.0',
          environment: 'test',
          checks: {},
        });
      }),
    );
    await expect(unwrap(api.GET('/health'))).resolves.toMatchObject({ version: '0.1.0' });
    expect(lang).toBe('ru');
  });

  it('maps the error envelope to ApiError', async () => {
    server.use(
      http.get(`${API}/health`, () =>
        HttpResponse.json(
          { error: { code: 'not_found', message: 'Nope', details: { a: 1 }, request_id: 'req-1' } },
          { status: 404 },
        ),
      ),
    );
    const err = await unwrap(api.GET('/health')).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 404,
      code: 'not_found',
      requestId: 'req-1',
      details: { a: 1 },
    });
    expect((err as ApiError).isClientError).toBe(true);
  });

  it('maps a non-envelope 5xx to internal_error', async () => {
    server.use(http.get(`${API}/health`, () => new HttpResponse('boom', { status: 500 })));
    await expect(unwrap(api.GET('/health'))).rejects.toMatchObject({ code: 'internal_error' });
  });

  it('maps network failures to status 0', async () => {
    server.use(http.get(`${API}/health`, () => HttpResponse.error()));
    const err = await unwrap(api.GET('/health')).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 0, code: 'network' });
    expect(errorMessageKey(err, [])).toBe('network');
  });
});

describe('errorMessageKey', () => {
  it('falls back to unknown for unrecognised codes', () => {
    expect(errorMessageKey(new ApiError(400, 'weird', 'x'), ['not_found'])).toBe('unknown');
    expect(errorMessageKey(new ApiError(404, 'not_found', 'x'), ['not_found'])).toBe('not_found');
    expect(errorMessageKey(new Error('x'), [])).toBe('unknown');
  });
});

describe('session refresh on 401', () => {
  const profileUrl = `${API}/api/v1/candidate/profile`;
  const refreshUrl = `${API}/api/v1/auth/refresh`;
  const profile = { currency: 'UZS', open_to_work: true, resume: null };

  it('refreshes once and retries the original request', async () => {
    let profileCalls = 0;
    let refreshCalls = 0;
    server.use(
      http.get(profileUrl, () => {
        profileCalls += 1;
        return profileCalls === 1
          ? HttpResponse.json({ error: { code: 'unauthorized', message: 'x' } }, { status: 401 })
          : HttpResponse.json(profile);
      }),
      http.post(refreshUrl, () => {
        refreshCalls += 1;
        return HttpResponse.json({});
      }),
    );
    const onUnauthenticated = vi.fn();
    const client = createApi({ locale: 'uz', onUnauthenticated });
    await expect(unwrap(client.GET('/api/v1/candidate/profile'))).resolves.toMatchObject(profile);
    expect(profileCalls).toBe(2);
    expect(refreshCalls).toBe(1);
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });

  it('shares one refresh between concurrent 401s', async () => {
    let refreshCalls = 0;
    const seen = new Map<string, number>();
    server.use(
      http.get(`${API}/api/v1/companies/:id`, ({ params }) => {
        const n = (seen.get(String(params.id)) ?? 0) + 1;
        seen.set(String(params.id), n);
        return n === 1
          ? HttpResponse.json({ error: { code: 'unauthorized', message: 'x' } }, { status: 401 })
          : HttpResponse.json({ id: params.id });
      }),
      http.post(refreshUrl, async () => {
        refreshCalls += 1;
        await new Promise((r) => setTimeout(r, 20));
        return HttpResponse.json({});
      }),
    );
    const client = createApi({ locale: 'uz' });
    const get = (id: string) =>
      unwrap(
        client.GET('/api/v1/companies/{company_id}', { params: { path: { company_id: id } } }),
      );
    const results = await Promise.all([get('a'), get('b'), get('c')]);
    expect(results.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(refreshCalls).toBe(1);
  });

  it('re-sends the request body on retry', async () => {
    let attempt = 0;
    let body: unknown = null;
    server.use(
      http.put(profileUrl, async ({ request }) => {
        attempt += 1;
        if (attempt === 1) {
          return HttpResponse.json(
            { error: { code: 'unauthorized', message: 'x' } },
            { status: 401 },
          );
        }
        body = await request.json();
        return HttpResponse.json(profile);
      }),
      http.post(refreshUrl, () => HttpResponse.json({})),
    );
    const client = createApi({ locale: 'uz' });
    await unwrap(
      client.PUT('/api/v1/candidate/profile', { body: { currency: 'USD', open_to_work: false } }),
    );
    expect(body).toEqual({ currency: 'USD', open_to_work: false });
  });

  it('reports unauthenticated when the refresh fails, without retrying', async () => {
    let profileCalls = 0;
    server.use(
      http.get(profileUrl, () => {
        profileCalls += 1;
        return HttpResponse.json(
          { error: { code: 'unauthorized', message: 'x' } },
          { status: 401 },
        );
      }),
      http.post(refreshUrl, () =>
        HttpResponse.json(
          { error: { code: 'invalid_refresh_token', message: 'x' } },
          { status: 401 },
        ),
      ),
    );
    const onUnauthenticated = vi.fn();
    const client = createApi({ locale: 'uz', onUnauthenticated });
    await expect(unwrap(client.GET('/api/v1/candidate/profile'))).rejects.toMatchObject({
      status: 401,
      code: 'unauthorized',
    });
    expect(profileCalls).toBe(1);
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
  });

  it('does not refresh for a failed login (wrong credentials)', async () => {
    let refreshCalls = 0;
    server.use(
      http.post(`${API}/api/v1/auth/login`, () =>
        HttpResponse.json(
          { error: { code: 'invalid_credentials', message: 'x' } },
          { status: 401 },
        ),
      ),
      http.post(refreshUrl, () => {
        refreshCalls += 1;
        return HttpResponse.json({});
      }),
    );
    const client = createApi({ locale: 'uz' });
    await expect(
      unwrap(client.POST('/api/v1/auth/login', { body: { email: 'a@b.uz', password: 'x' } })),
    ).rejects.toMatchObject({ code: 'invalid_credentials' });
    expect(refreshCalls).toBe(0);
  });
});
