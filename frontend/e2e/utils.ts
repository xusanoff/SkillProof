import { expect, type Page } from '@playwright/test';

/**
 * Wait until the page is visually stable: fonts loaded, every `whileInView`
 * reveal triggered (scroll like a reader) and finished (nothing in <main> faded).
 */
export async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.evaluate(async () => {
    const step = Math.max(200, Math.floor(window.innerHeight / 2));
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll<HTMLElement>('main [style*="opacity"]'))
      // Only Motion reveals (inline opacity) — not disabled controls (opacity-50) —
      // and not display:none content (desktop-only panels on phones never animate in).
      // Radix form controls render hidden native inputs with inline opacity: 0.
      .filter((el) => el.tagName !== 'INPUT' && el.checkVisibility())
      .every((el) => getComputedStyle(el).opacity === '1'),
  );
}

/** Browser → `/api/api/v1/...` (Next proxy prefix + API path). */
export const API_GLOB = '**/api/api/v1/**';

type Json = Record<string, unknown> | unknown[];
export interface MockRoute {
  method?: string;
  /** Path after `/api/api/v1`, e.g. `/auth/me` or a RegExp. */
  path: string | RegExp;
  status?: number;
  body?: Json;
  /** Called with the parsed JSON body (if any). */
  onRequest?: (body: unknown) => void;
}

export function envelope(code: string, details: Record<string, unknown> = {}) {
  return { error: { code, message: code, details, request_id: 'e2e' } };
}

/**
 * Mock the API in the browser (no backend needed). Later routes win; anything unmatched
 * answers 404 so a missing mock is loud. `/auth/me` and `/auth/refresh` default to 401.
 */
export async function mockApi(page: Page, routes: MockRoute[]) {
  const all: MockRoute[] = [
    { method: 'GET', path: '/auth/me', status: 401, body: envelope('unauthorized') },
    { method: 'POST', path: '/auth/refresh', status: 401, body: envelope('invalid_refresh_token') },
    ...routes,
  ];
  await page.route(API_GLOB, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api\/api\/v1/, '');
    const match = [...all]
      .reverse()
      .find(
        (r) =>
          (!r.method || r.method === req.method()) &&
          (typeof r.path === 'string' ? r.path === path : r.path.test(path)),
      );
    if (!match) {
      return route.fulfill({ status: 404, json: envelope('not_found') });
    }
    if (match.onRequest) {
      let parsed: unknown = null;
      try {
        parsed = req.postDataJSON();
      } catch {
        parsed = req.postData();
      }
      match.onRequest(parsed);
    }
    if ((match.status ?? 200) === 204) return route.fulfill({ status: 204 });
    return route.fulfill({ status: match.status ?? 200, json: match.body ?? {} });
  });
}

export const mockAnonymous = (page: Page) => mockApi(page, []);

export function me(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u-1',
    email: 'aziza@example.com',
    full_name: 'Aziza Karimova',
    role: 'candidate',
    locale: 'uz',
    timezone: 'Asia/Tashkent',
    is_email_verified: true,
    created_at: '2026-10-01T09:00:00Z',
    companies: [],
    ...overrides,
  };
}

export async function expectNoSeriousA11y(page: Page) {
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
}
