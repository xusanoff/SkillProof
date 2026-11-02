import { expect, test } from '@playwright/test';
import { expectNoSeriousA11y, me, mockApi, type MockRoute } from './utils';

/**
 * Phase 2 job-board flows with the API mocked in the browser (page.route).
 * Run against a web server whose API_INTERNAL_URL is unreachable, so the server-side first
 * render falls back to client fetching (which page.route intercepts):
 *   API_INTERNAL_URL=http://127.0.0.1:9 PORT=3102 node .next/standalone/server.js
 *   BASE_URL=http://127.0.0.1:3102 pnpm test:e2e
 */

const company = {
  id: 'c-1',
  name: 'Najot Soft',
  slug: 'najot-soft',
  logo_url: null,
  is_verified: true,
};

function card(overrides: Record<string, unknown> = {}) {
  return {
    id: 'v-1',
    title: 'Python backend dasturchi',
    company,
    region_code: 'UZ-TK',
    city: null,
    remote_type: 'remote',
    employment_type: 'full_time',
    experience_level: 'between_1_3',
    salary_min: 15_000_000,
    salary_max: 22_000_000,
    currency: 'UZS',
    skills: [
      { name: 'Python', slug: 'python' },
      { name: 'FastAPI', slug: 'fastapi' },
    ],
    published_at: new Date().toISOString(),
    has_assessment: false,
    viewer: null,
    ...overrides,
  };
}

function detail(overrides: Record<string, unknown> = {}) {
  return {
    ...card(),
    description: "FastAPI bilan to'lov API'larini yozamiz.\n\nJamoada 6 muhandis.",
    requirements: 'Python 3.12\nPostgreSQL',
    profession_area: 'it',
    country: 'UZ',
    status: 'published',
    skills: [
      { id: 's-1', name: 'Python', slug: 'python', weight: 5, is_required: true },
      { id: 's-2', name: 'FastAPI', slug: 'fastapi', weight: 4, is_required: false },
    ],
    applications_count: null,
    ...overrides,
  };
}

const page = (items: unknown[]) => ({
  items,
  total: items.length,
  page: 1,
  page_size: 20,
  facets: {
    region: [{ value: 'UZ-TK', count: items.length }],
    remote_type: [{ value: 'remote', count: items.length }],
    employment_type: [{ value: 'full_time', count: items.length }],
    experience_level: [{ value: 'between_1_3', count: items.length }],
  },
});

const catalog: MockRoute[] = [
  {
    method: 'GET',
    path: '/regions',
    body: [
      {
        code: 'UZ-TK',
        country: 'UZ',
        names: { uz: 'Toshkent shahri', ru: 'Ташкент', en: 'Tashkent' },
      },
    ],
  },
  {
    method: 'GET',
    path: '/profession-areas',
    body: [{ slug: 'it', names: { uz: 'IT', ru: 'IT', en: 'IT' } }],
  },
  { method: 'GET', path: '/search/suggest', body: [] },
  { method: 'GET', path: '/companies/by-slug/najot-soft/vacancies', body: page([card()]) },
];

test('guest searches, filters, opens a vacancy; apply sends them to login', async ({ page: p }) => {
  const listQueries: string[] = [];
  await mockApi(p, [
    ...catalog,
    { method: 'GET', path: '/vacancies', body: page([card()]) },
    { method: 'GET', path: '/vacancies/v-1', body: detail() },
  ]);
  p.on('request', (r) => {
    const u = new URL(r.url());
    if (u.pathname === '/api/api/v1/vacancies') listQueries.push(u.search);
  });

  await p.goto('/uz/vacancies?q=python');
  await expect(
    p.getByRole('heading', { level: 1, name: "«python» bo'yicha 1 ta vakansiya" }),
  ).toBeVisible();
  await expectNoSeriousA11y(p);

  // A filter changes the URL (shareable) and refetches on the client.
  await p
    .getByRole('complementary', { name: 'Filtrlar' })
    .getByRole('checkbox', { name: /Masofaviy/ })
    .click();
  await expect(p).toHaveURL(/\/uz\/vacancies\?q=python&remote_type=remote$/);
  await expect(p.getByRole('button', { name: '«Masofaviy» filtrini olib tashlash' })).toBeVisible();
  expect(listQueries.some((q) => q.includes('remote_type=remote'))).toBe(true);

  await p.getByRole('link', { name: 'Python backend dasturchi', exact: true }).click();
  await expect(p).toHaveURL(/\/uz\/vacancies\/v-1$/);
  await expect(
    p.getByRole('heading', { level: 1, name: 'Python backend dasturchi' }),
  ).toBeVisible();
  await expect(p.getByText("15 000 000 – 22 000 000 so'm").first()).toBeVisible();
  await expectNoSeriousA11y(p);

  await p
    .getByRole('region', { name: 'Ariza berish' })
    .getByRole('link', { name: 'Ariza berish' })
    .click();
  await expect(p).toHaveURL(/\/uz\/login\?next=%2Fvacancies%2Fv-1%3Fapply%3D1$/);
});

test('candidate applies with a cover note and sees the status', async ({ page: p }) => {
  let applied: unknown = null;
  const candidate = me();
  await mockApi(p, [
    ...catalog,
    { method: 'GET', path: '/auth/me', body: candidate },
    { method: 'GET', path: '/vacancies', body: page([]) },
    {
      method: 'GET',
      path: '/vacancies/v-1',
      body: detail({ viewer: { is_saved: false, application_status: null } }),
    },
    {
      method: 'POST',
      path: '/vacancies/v-1/apply',
      status: 201,
      onRequest: (b) => (applied = b),
      body: {
        id: 'a-1',
        status: 'applied',
        cover_note: 'Salom',
        created_at: '2026-10-30T09:00:00Z',
        updated_at: '2026-10-30T09:00:00Z',
        vacancy: card(),
      },
    },
  ]);
  // Back from login: `?apply=1` opens the dialog once.
  await p.goto('/uz/vacancies/v-1?apply=1');
  const dialog = p.getByRole('dialog', { name: 'Vakansiyaga ariza' });
  await expect(dialog).toBeVisible();
  await expect(p).toHaveURL(/\/uz\/vacancies\/v-1$/);
  await dialog.getByLabel(/Qo'shimcha xat/).fill('Salom, FastAPI bilan 4 yil ishlaganman.');
  await dialog.getByRole('button', { name: 'Ariza yuborish' }).click();
  await expect(p.getByRole('dialog', { name: 'Ariza yuborildi' })).toBeVisible();
  expect(applied).toEqual({ cover_note: 'Salom, FastAPI bilan 4 yil ishlaganman.' });
  await p.keyboard.press('Escape');
  await expect(
    p.getByRole('region', { name: 'Ariza berish' }).getByRole('link', { name: 'Ariza yuborildi' }),
  ).toBeVisible();
});

test('HR publishes a draft and shortlists a candidate', async ({ page: p }) => {
  const hr = me({
    role: 'hr',
    full_name: 'Malika HR',
    companies: [{ id: 'c-1', name: 'Najot Soft', slug: 'najot-soft', member_role: 'owner' }],
  });
  let status = 'draft';
  let patchedVacancy: unknown = null;
  let patchedApplication: unknown = null;
  const hrVacancy = () => ({
    ...card({ viewer: null }),
    status,
    applications_count: 3,
    new_applications_count: 2,
    updated_at: '2026-10-30T09:00:00Z',
  });
  const application = (s: string) => ({
    id: 'a-1',
    status: s,
    cover_note: 'FastAPI bilan 4 yil.',
    created_at: '2026-10-29T09:00:00Z',
    updated_at: '2026-10-29T09:00:00Z',
    vacancy: { id: 'v-1', title: 'Python backend dasturchi' },
    candidate: {
      user_id: 'u-9',
      full_name: 'Aziza Karimova',
      email: 'aziza@example.com',
      headline: 'Python dasturchi',
      country: 'UZ',
      city: 'Toshkent',
      experience_years: 4,
      desired_salary_min: 15_000_000,
      desired_salary_max: 20_000_000,
      currency: 'UZS',
      has_resume: false,
    },
  });
  let appStatus = 'applied';
  await mockApi(p, [
    ...catalog,
    { method: 'GET', path: '/auth/me', body: hr },
    {
      method: 'GET',
      path: '/companies/c-1/vacancies',
      get body() {
        return {
          items: [hrVacancy()],
          total: 1,
          page: 1,
          page_size: 20,
          counts_by_status: {
            draft: status === 'draft' ? 1 : 0,
            published: status === 'published' ? 1 : 0,
            closed: 0,
            archived: 0,
          },
        };
      },
    } as MockRoute,
    {
      method: 'PATCH',
      path: '/companies/c-1/vacancies/v-1',
      onRequest: (b) => {
        patchedVacancy = b;
        status = 'published';
      },
      body: detail({ status: 'published' }),
    },
    {
      method: 'GET',
      path: '/companies/c-1/applications',
      get body() {
        return { items: [application(appStatus)], total: 1, page: 1, page_size: 20 };
      },
    } as MockRoute,
    {
      method: 'PATCH',
      path: '/companies/c-1/applications/a-1',
      onRequest: (b) => {
        patchedApplication = b;
        appStatus = 'shortlisted';
      },
      get body() {
        return application('shortlisted');
      },
    } as MockRoute,
  ]);

  await p.goto('/uz/hr/vacancies?status=draft');
  await expect(p.getByRole('heading', { level: 1, name: 'Vakansiyalarim' })).toBeVisible();
  const row = p.getByRole('article', { name: 'Python backend dasturchi' });
  await expect(row.getByText('+2 yangi')).toBeVisible();
  await expect(p.getByRole('link', { name: 'Qoralama 1' })).toHaveAttribute('aria-current', 'page');
  await row.getByRole('button', { name: 'Nashr qilish' }).click();
  await expect(p.getByRole('status')).toHaveText('«Python backend dasturchi» nashr qilindi.');
  expect(patchedVacancy).toEqual({ status: 'published' });
  await expect(p.getByRole('link', { name: 'Faol 1' })).toBeVisible();

  await row.getByRole('link', { name: '3 ta ariza' }).click();
  await expect(p).toHaveURL(/\/uz\/hr\/candidates\?vacancy=v-1$/);
  const cand = p.getByRole('article', { name: 'Aziza Karimova' });
  await cand.getByRole('button', { name: 'Taklif qilish' }).click();
  await expect(cand.getByText('Taklif', { exact: true })).toBeVisible();
  expect(patchedApplication).toEqual({ status: 'shortlisted' });
});
