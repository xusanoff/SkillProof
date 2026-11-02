import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Page,
} from '@playwright/test';
import { makeInterviewVacancy, ok } from './interview-setup';
import { settle } from './utils';

/**
 * Phase report screenshots (frontend-quality §8), taken from the REAL running stack
 * (web + API). No mocked network here: data is created through the API.
 *   PHASE=1 BASE_URL=http://localhost:3100 pnpm screenshots
 *     → docs/reports/phase-<N>/img/<nn>-<screen>-<locale>-<viewport>.png
 * Optional: INVITE_TOKEN=<token from the API's email log> adds the invitation page shot.
 */
const PHASE = process.env.PHASE || '0';
const OUT_DIR = path.resolve(__dirname, `../../docs/reports/phase-${PHASE}/img`);
const FIXTURES = path.resolve(__dirname, 'fixtures');

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

async function shoot(page: Page, name: string) {
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: true });
}

test.describe.configure({ mode: 'parallel' });

// ---------------------------------------------------------------- Phase 0
test.describe('phase 0', () => {
  test.skip(PHASE !== '0', 'phase 0 set');

  for (const { n, locale } of [
    { n: '01', locale: 'uz' },
    { n: '02', locale: 'ru' },
    { n: '03', locale: 'en' },
  ] as const) {
    test(`home ${locale} desktop`, async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await page.emulateMedia({ colorScheme: 'light' });
      await page.goto(`/${locale}`);
      await settle(page);
      await shoot(page, `${n}-home-${locale}-desktop`);
    });
  }

  test('status uz desktop', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/uz/status');
    await settle(page);
    await expect(page.getByText(/^(Ishlayapti|Qisman ishlayapti|Mavjud emas)$/)).toBeVisible({
      timeout: 20_000,
    });
    await shoot(page, '06-status-uz-desktop');
  });
});

// ---------------------------------------------------------------- Phase 1
const API = '/api/api/v1';
const PASSWORD = 'Screenshot-pass-1';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

function uniqueEmail(tag: string) {
  return `shot-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
}

/** The API rate-limits auth (e.g. 5 registrations/min/IP): wait out one window, retry once. */
async function call(send: () => Promise<APIResponse>, what: string) {
  let res = await send();
  if (res.status() === 429) {
    await new Promise((r) => setTimeout(r, 61_000));
    res = await send();
  }
  expect(res.ok(), `${what}: ${res.status()} ${await res.text()}`).toBe(true);
  return res.status() === 204 ? null : res.json();
}

type AccountKey = 'candidate' | 'hrNew' | 'owner';
const accounts: Record<AccountKey, { email: string; role: 'candidate' | 'hr'; name: string }> = {
  candidate: { email: uniqueEmail('aziza'), role: 'candidate', name: 'Aziza Karimova' },
  hrNew: { email: uniqueEmail('olim'), role: 'hr', name: 'Olim Rahimov' },
  owner: { email: uniqueEmail('owner'), role: 'hr', name: 'Malika Yusupova' },
};
let company = { id: '', name: '' };

async function seed(api: APIRequestContext) {
  for (const a of Object.values(accounts)) {
    await call(
      () =>
        api.post(`${API}/auth/register`, {
          data: {
            email: a.email,
            password: PASSWORD,
            full_name: a.name,
            role: a.role,
            locale: 'uz',
            timezone: 'Asia/Tashkent',
          },
        }),
      'register',
    );
    await api.post(`${API}/auth/logout`);
  }

  await call(
    () =>
      api.post(`${API}/auth/login`, {
        data: { email: accounts.candidate.email, password: PASSWORD },
      }),
    'login',
  );
  await call(
    () =>
      api.put(`${API}/candidate/profile`, {
        data: {
          headline: 'Python backend dasturchi',
          country: 'UZ',
          city: 'Toshkent',
          experience_years: 4,
          about:
            "FastAPI va PostgreSQL bilan 4 yillik tajriba. To'lov tizimi uchun API, navbatlar (Celery, Redis) va testlarni yozganman.",
          desired_salary_min: 15_000_000,
          desired_salary_max: 22_000_000,
          currency: 'UZS',
          open_to_work: true,
        },
      }),
    'profile',
  );
  await call(
    () =>
      api.post(`${API}/candidate/profile/resume`, {
        multipart: {
          file: {
            name: 'aziza-karimova-cv.pdf',
            mimeType: 'application/pdf',
            buffer: readFileSync(path.join(FIXTURES, 'resume.pdf')),
          },
        },
      }),
    'resume upload',
  );
  await api.post(`${API}/auth/logout`);

  await call(
    () =>
      api.post(`${API}/auth/login`, { data: { email: accounts.owner.email, password: PASSWORD } }),
    'login',
  );
  company = await call(
    () =>
      api.post(`${API}/companies`, {
        data: {
          name: `Lazurit Tech ${Date.now().toString().slice(-4)}`,
          industry: 'Fintech',
          website: 'https://lazurit.example.uz',
          country: 'UZ',
          city: 'Toshkent',
          description:
            "To'lov tizimlari va bank integratsiyalari ustida ishlaymiz. Jamoada 40 dan ortiq muhandis.",
        },
      }),
    'create company',
  );
  await call(
    () =>
      api.post(`${API}/companies/${company.id}/logo`, {
        multipart: {
          file: {
            name: 'logo.png',
            mimeType: 'image/png',
            buffer: readFileSync(path.join(FIXTURES, 'logo.png')),
          },
        },
      }),
    'logo upload',
  );
  for (const tag of ['dilnoza', 'jasur']) {
    await call(
      () =>
        api.post(`${API}/companies/${company.id}/invitations`, {
          data: { email: uniqueEmail(tag) },
        }),
      'invite',
    );
  }
  await api.post(`${API}/auth/logout`);
}

/** Sign the page's context in (page.request shares cookies with the browser). */
async function signIn(page: Page, key: AccountKey) {
  await call(
    () =>
      page.request.post(`${API}/auth/login`, {
        data: { email: accounts[key].email, password: PASSWORD },
      }),
    'login',
  );
}

async function desktop(page: Page) {
  await page.setViewportSize(DESKTOP);
  await page.emulateMedia({ colorScheme: 'light' });
}

const mobileContext = {
  viewport: MOBILE,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  reducedMotion: 'reduce',
} as const;

test.describe('phase 1', () => {
  test.skip(PHASE !== '1', 'phase 1 set');
  // One worker: the seed runs once and stays inside the API's auth rate limits.
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  test.beforeAll(async ({ playwright }) => {
    const api = await playwright.request.newContext({ baseURL: BASE_URL });
    await seed(api);
    await api.dispose();
  });

  test('login uz desktop', async ({ page }) => {
    await desktop(page);
    await page.goto('/uz/login');
    await settle(page);
    await shoot(page, '01-login-uz-desktop');
  });

  test('register role choice uz desktop', async ({ page }) => {
    await desktop(page);
    await page.goto('/uz/register');
    await settle(page);
    await page.getByText('Xodim izlayman').click();
    await shoot(page, '02-register-role-choice-uz-desktop');
  });

  test('candidate profile filled with resume uz desktop', async ({ page }) => {
    await desktop(page);
    await signIn(page, 'candidate');
    await page.goto('/uz/candidate/profile');
    await expect(page.getByText('aziza-karimova-cv.pdf')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Lavozim' })).toHaveValue(
      'Python backend dasturchi',
    );
    await settle(page);
    await shoot(page, '03-candidate-profile-uz-desktop');
  });

  test('hr create company uz desktop', async ({ page }) => {
    await desktop(page);
    await signIn(page, 'hrNew');
    await page.goto('/uz/hr');
    await expect(
      page.getByRole('heading', { level: 1, name: "Kompaniyangizni qo'shing" }),
    ).toBeVisible();
    await settle(page);
    await shoot(page, '04-hr-create-company-uz-desktop');
  });

  test('hr company profile + team with pending invitations uz desktop', async ({ page }) => {
    await desktop(page);
    await signIn(page, 'owner');
    await page.goto('/uz/hr/company');
    await expect(page.getByLabel('Kompaniya nomi')).toHaveValue(company.name);
    await expect(page.getByRole('img', { name: company.name })).toBeVisible();
    await settle(page);
    await shoot(page, '05-hr-company-uz-desktop');

    await page.goto('/uz/hr/team');
    await expect(page.getByText(/shot-dilnoza-/)).toBeVisible();
    await settle(page);
    await shoot(page, '06-hr-team-uz-desktop');
  });

  test('invitation page uz desktop', async ({ page }) => {
    const token = process.env.INVITE_TOKEN;
    test.skip(!token, 'set INVITE_TOKEN (from the API email log) to capture the invitation page');
    await desktop(page);
    await page.goto(`/uz/invitations/${token}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await settle(page);
    await shoot(page, '07-invitation-uz-desktop');
  });

  test('home with hh-style hero uz desktop', async ({ page }) => {
    await desktop(page);
    await page.goto('/uz');
    await settle(page);
    await shoot(page, '08-home-uz-desktop');
  });

  test('header search + candidate account menu uz desktop', async ({ page }) => {
    await desktop(page);
    await signIn(page, 'candidate');
    await page.goto('/uz/vacancies?q=python&region=UZ-TK');
    await settle(page);
    await page.getByRole('button', { name: /Hisob menyusi/ }).click();
    await expect(page.getByRole('menuitem', { name: 'Natijalarim' })).toBeVisible();
    await page.screenshot({ path: path.join(OUT_DIR, '09-account-menu-uz-desktop.png') });
  });

  for (const { n, url, name } of [
    { n: '10', url: '/uz/login', name: 'login' },
    { n: '11', url: '/uz', name: 'home' },
  ]) {
    test(`${name} uz mobile`, async ({ browser }) => {
      const context = await browser.newContext({ ...mobileContext, colorScheme: 'light' });
      const page = await context.newPage();
      await page.goto(url);
      await settle(page);
      await shoot(page, `${n}-${name}-uz-mobile`);
      await context.close();
    });
  }

  test('candidate profile uz dark mobile', async ({ browser }) => {
    const context = await browser.newContext({ ...mobileContext, colorScheme: 'dark' });
    const page = await context.newPage();
    await signIn(page, 'candidate');
    await page.goto('/uz/candidate/profile');
    await expect(page.getByText('aziza-karimova-cv.pdf')).toBeVisible();
    await settle(page);
    await shoot(page, '12-candidate-profile-uz-dark-mobile');
    await context.close();
  });
});

// ---------------------------------------------------------------- Phase 2
/**
 * Seeded demo accounts (`make seed`), never registered here (register is rate-limited):
 *   DEMO_CANDIDATE_EMAIL, DEMO_HR_EMAIL, DEMO_PASSWORD
 * Idempotent: re-applying answers `already_applied`, saving is a PUT.
 */
const DEMO = {
  candidate: process.env.DEMO_CANDIDATE_EMAIL ?? '',
  hr: process.env.DEMO_HR_EMAIL ?? '',
  password: process.env.DEMO_PASSWORD ?? '',
};

type Card = {
  id: string;
  title: string;
  company: { slug: string };
  viewer: null | { application_status: string | null };
};

test.describe('phase 2', () => {
  test.skip(PHASE !== '2', 'phase 2 set');
  test.skip(!DEMO.candidate || !DEMO.hr || !DEMO.password, 'set DEMO_* env vars');
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  type State = Awaited<ReturnType<APIRequestContext['storageState']>>;
  let candidateState: State;
  let hrState: State;
  let detailId = '';
  let applyId = '';
  let hrVacancyId = '';
  let hrSlug = '';
  const LIST_FILTERS =
    '/vacancies?region=UZ-TK&remote_type=hybrid&remote_type=remote&only_with_salary=true';

  test.beforeAll(async ({ playwright }) => {
    // Candidate: a few applications (one to the HR's company) and saved vacancies.
    const cand = await playwright.request.newContext({ baseURL: BASE_URL });
    await call(
      () =>
        cand.post(`${API}/auth/login`, {
          data: { email: DEMO.candidate, password: DEMO.password },
        }),
      'candidate login',
    );
    const hrCtx = await playwright.request.newContext({ baseURL: BASE_URL });
    const hrMe = await call(
      () => hrCtx.post(`${API}/auth/login`, { data: { email: DEMO.hr, password: DEMO.password } }),
      'hr login',
    );
    hrSlug = hrMe.companies[0].slug;
    const companyId = hrMe.companies[0].id;

    const list: { items: Card[] } = await call(
      () => cand.get(`${API}/vacancies?sort=date&page_size=50`),
      'list',
    );
    const ours = list.items.filter((v) => v.company.slug === hrSlug);
    const others = list.items.filter((v) => v.company.slug !== hrSlug);
    detailId = others[0].id;
    for (const v of [ours[0], ours[1], others[1]].filter(Boolean)) {
      const res = await cand.post(`${API}/vacancies/${v.id}/apply`, {
        data: {
          cover_note:
            "FastAPI va PostgreSQL bilan 4 yillik tajribam bor. To'lov API'lari ustida ishlaganman.",
        },
      });
      expect([201, 409], await res.text()).toContain(res.status());
    }
    for (const v of [others[2], others[3], ours[2]].filter(Boolean)) {
      await call(() => cand.put(`${API}/candidate/saved-vacancies/${v.id}`), 'save');
    }
    // A vacancy without an application, for the apply dialog.
    const fresh: { items: Card[] } = await call(
      () => cand.get(`${API}/vacancies?sort=date&page_size=50`),
      'list again',
    );
    applyId = fresh.items.find((v) => !v.viewer?.application_status && v.id !== detailId)!.id;
    candidateState = await cand.storageState();

    const hrList: { items: { id: string }[] } = await call(
      () => hrCtx.get(`${API}/companies/${companyId}/vacancies?status=published`),
      'hr list',
    );
    hrVacancyId = hrList.items[0].id;
    hrState = await hrCtx.storageState();
    await cand.dispose();
    await hrCtx.dispose();
  });

  async function desktopAs(browser: import('@playwright/test').Browser, state?: State) {
    const context = await browser.newContext({
      viewport: DESKTOP,
      colorScheme: 'light',
      reducedMotion: 'reduce',
      storageState: state,
    });
    return { context, page: await context.newPage() };
  }
  async function mobileAs(browser: import('@playwright/test').Browser, state?: State) {
    const context = await browser.newContext({
      ...mobileContext,
      colorScheme: 'light',
      storageState: state,
    });
    return { context, page: await context.newPage() };
  }
  const h1 = (page: Page) => expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  test('vacancies list with filters uz desktop + mobile + filter sheet', async ({ browser }) => {
    const d = await desktopAs(browser);
    await d.page.goto(`/uz${LIST_FILTERS}`);
    await expect(
      d.page.getByRole('button', { name: /filtrini olib tashlash/ }).first(),
    ).toBeVisible();
    await settle(d.page);
    await shoot(d.page, '01-vacancies-filtered-uz-desktop');
    await d.context.close();

    const m = await mobileAs(browser);
    await m.page.goto(`/uz${LIST_FILTERS}`);
    await settle(m.page);
    await m.page.screenshot({ path: path.join(OUT_DIR, '02-vacancies-filtered-uz-mobile.png') });
    await m.page.getByRole('button', { name: /^Filtrlar \(\d+\)$/ }).click();
    await expect(m.page.getByRole('button', { name: /ta vakansiyani ko'rsatish/ })).toBeVisible();
    await m.page.screenshot({ path: path.join(OUT_DIR, '03-filter-sheet-uz-mobile.png') });
    await m.context.close();
  });

  test('vacancy detail uz desktop + mobile', async ({ browser }) => {
    const d = await desktopAs(browser);
    await d.page.goto(`/uz/vacancies/${detailId}`);
    await expect(d.page.getByRole('heading', { name: "O'xshash vakansiyalar" })).toBeVisible();
    await settle(d.page);
    await shoot(d.page, '04-vacancy-detail-uz-desktop');
    await d.context.close();

    const m = await mobileAs(browser);
    await m.page.goto(`/uz/vacancies/${detailId}`);
    await settle(m.page);
    await m.page.screenshot({ path: path.join(OUT_DIR, '05-vacancy-detail-uz-mobile.png') });
    await m.context.close();
  });

  test('apply dialog uz desktop', async ({ browser }) => {
    const d = await desktopAs(browser, candidateState);
    await d.page.goto(`/uz/vacancies/${applyId}?apply=1`);
    const dialog = d.page.getByRole('dialog', { name: 'Vakansiyaga ariza' });
    await expect(dialog).toBeVisible();
    await dialog
      .getByLabel(/Qo'shimcha xat/)
      .fill("Python va FastAPI bilan 4 yil ishlaganman, to'lov tizimlari bo'yicha tajribam bor.");
    await d.page.screenshot({ path: path.join(OUT_DIR, '06-apply-dialog-uz-desktop.png') });
    await d.context.close();
  });

  test('company page uz desktop', async ({ browser }) => {
    const d = await desktopAs(browser);
    await d.page.goto(`/uz/companies/${hrSlug}`);
    await expect(d.page.getByRole('heading', { name: /Ochiq vakansiyalar/ })).toBeVisible();
    await settle(d.page);
    await shoot(d.page, '07-company-uz-desktop');
    await d.context.close();
  });

  test('candidate applications + saved uz desktop', async ({ browser }) => {
    const d = await desktopAs(browser, candidateState);
    await d.page.goto('/uz/candidate/applications');
    await expect(d.page.getByRole('article').first()).toBeVisible();
    await settle(d.page);
    await shoot(d.page, '08-candidate-applications-uz-desktop');
    await d.page.goto('/uz/candidate/saved');
    await expect(d.page.getByRole('article').first()).toBeVisible();
    await settle(d.page);
    await shoot(d.page, '09-candidate-saved-uz-desktop');
    await d.context.close();
  });

  test('hr vacancies, form, candidates uz desktop', async ({ browser }) => {
    const d = await desktopAs(browser, hrState);
    await d.page.goto('/uz/hr/vacancies');
    await expect(d.page.getByRole('article').first()).toBeVisible();
    await settle(d.page);
    await shoot(d.page, '10-hr-vacancies-uz-desktop');

    await d.page.goto(`/uz/hr/vacancies/${hrVacancyId}/edit`);
    await expect(d.page.getByLabel('Lavozim nomi')).not.toHaveValue('');
    await settle(d.page);
    await shoot(d.page, '11-hr-vacancy-form-uz-desktop');

    await d.page.goto('/uz/hr/candidates');
    await expect(d.page.getByRole('article').first()).toBeVisible();
    await settle(d.page);
    await shoot(d.page, '12-hr-candidates-uz-desktop');
    await d.context.close();
  });

  test('home with new vacancies uz desktop', async ({ browser }) => {
    const d = await desktopAs(browser);
    await d.page.goto('/uz');
    await expect(d.page.getByRole('heading', { name: 'Yangi vakansiyalar' })).toBeVisible();
    await settle(d.page);
    await shoot(d.page, '13-home-latest-uz-desktop');
    await d.context.close();
  });

  test('vacancies list ru desktop', async ({ browser }) => {
    const d = await desktopAs(browser, candidateState);
    await d.page.goto('/ru/vacancies?q=python');
    await h1(d.page);
    await expect(d.page.getByRole('article').first()).toBeVisible();
    await settle(d.page);
    await shoot(d.page, '14-vacancies-search-ru-desktop');
    await d.context.close();
  });
});

// ---------------------------------------------------------------- Phase 3
test.describe('phase 3', () => {
  test.skip(PHASE !== '3', 'phase 3 set');
  test.skip(!DEMO.hr || !DEMO.password, 'set DEMO_HR_EMAIL / DEMO_PASSWORD');
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  type State = Awaited<ReturnType<APIRequestContext['storageState']>>;
  let hrState: State;
  let emptyVacancy = '';
  let issuesVacancy = '';
  let readyVacancy = '';

  const vacancyBody = (title: string) => ({
    title,
    profession_area: 'it',
    region_code: 'UZ-TK',
    remote_type: 'hybrid',
    employment_type: 'full_time',
    experience_level: 'between_1_3',
    description: 'Python va FastAPI bilan ishlaydigan backend dasturchi.',
    skills: [],
  });

  test.beforeAll(async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE_URL });
    const me = await call(
      () => ctx.post(`${API}/auth/login`, { data: { email: DEMO.hr, password: DEMO.password } }),
      'hr login',
    );
    const C = `${API}/companies/${me.companies[0].id}`;
    const stamp = Date.now();
    const make = async (title: string) =>
      (await call(() => ctx.post(`${C}/vacancies`, { data: vacancyBody(title) }), title)).id;
    emptyVacancy = await make(`Backend dasturchi (yangi) ${stamp}`);
    issuesVacancy = await make(`Backend dasturchi (tayyor emas) ${stamp}`);
    readyVacancy = await make(`Backend dasturchi (tayyor) ${stamp}`);

    // Two manual questions (one approved MCQ, one unapproved open) for the bank page.
    const mcq = await call(
      () =>
        ctx.post(`${C}/questions`, {
          data: {
            type: 'mcq',
            difficulty: 2,
            language: 'uz',
            text: "Python'da qaysi tur o'zgarmas (immutable)?",
            options: ['list', 'dict', 'tuple', 'set'],
            correct_answer: [2],
          },
        }),
      'mcq',
    );
    await call(
      () => ctx.post(`${C}/questions/${mcq.id}/approve`, { data: { approved: true } }),
      'approve',
    );
    await call(
      () =>
        ctx.post(`${C}/questions`, {
          data: {
            type: 'open',
            difficulty: 3,
            language: 'uz',
            text: 'GIL nima va u ko‘p oqimli dasturlarga qanday ta’sir qiladi?',
            reference_answer: 'Global Interpreter Lock: bir vaqtda bitta oqim bytecode bajaradi.',
            rubric: {
              criteria: [
                { key: 'accuracy', name: 'Aniqlik', description: '', max_points: 5, levels: {} },
              ],
            },
          },
        }),
      'open',
    );

    // "Not ready": saved, but no tasks and no questions → blocking issues.
    await call(() => ctx.put(`${C}/vacancies/${issuesVacancy}/assessment`, { data: {} }), 'put');
    // "Ready": AI generation with auto-approve (mock LLM).
    await call(
      () =>
        ctx.put(`${C}/vacancies/${readyVacancy}/assessment`, {
          data: { auto_approve_ai_items: true, question_mode: 'ai_generated' },
        }),
      'put ready',
    );
    const job = await call(
      () => ctx.post(`${C}/vacancies/${readyVacancy}/assessment/generate`, { data: {} }),
      'generate',
    );
    for (let i = 0; i < 60; i++) {
      const j = await call(() => ctx.get(`${C}/generation-jobs/${job.id}`), 'job');
      if (j.status === 'succeeded') break;
      expect(j.status).not.toBe('failed');
      await new Promise((r) => setTimeout(r, 2000));
    }
    hrState = await ctx.storageState();
    await ctx.dispose();
  });

  async function hr(browser: import('@playwright/test').Browser, viewport = DESKTOP) {
    const context = await browser.newContext({
      viewport,
      colorScheme: 'light',
      reducedMotion: 'reduce',
      storageState: hrState,
    });
    return { context, page: await context.newPage() };
  }
  const h1 = (page: Page, name: string | RegExp) =>
    expect(page.getByRole('heading', { level: 1, name })).toBeVisible();

  test('question bank uz desktop + new mcq form', async ({ browser }) => {
    const d = await hr(browser);
    await d.page.goto('/uz/hr/questions');
    await h1(d.page, 'Savollar banki');
    await expect(d.page.getByRole('article').first()).toBeVisible();
    await settle(d.page);
    await shoot(d.page, '01-questions-bank-uz-desktop');

    await d.page.getByRole('button', { name: "Savol qo'shish" }).click();
    await d.page.getByLabel('Turi').selectOption('mcq');
    await d.page.getByLabel('Savol matni').fill('HTTP 404 nimani anglatadi?');
    await d.page.getByLabel('Variant 1').fill('Resurs topilmadi');
    await d.page.getByLabel('Variant 2').fill('Ruxsat yo‘q');
    await d.page.getByRole('button', { name: 'Saqlash' }).click();
    await expect(d.page.getByText("Kamida bitta to'g'ri variantni belgilang.")).toBeVisible();
    await shoot(d.page, '02-question-form-mcq-validation-uz-desktop');
    await d.context.close();
  });

  test('task bank ru desktop', async ({ browser }) => {
    const d = await hr(browser);
    await d.page.goto('/ru/hr/tasks');
    await h1(d.page, 'Банк заданий');
    await expect(d.page.getByRole('article').first()).toBeVisible();
    await settle(d.page);
    await shoot(d.page, '03-tasks-bank-ru-desktop');
    await d.context.close();
  });

  test('assessment empty (404) uz desktop', async ({ browser }) => {
    const d = await hr(browser);
    await d.page.goto(`/uz/hr/vacancies/${emptyVacancy}/assessment`);
    await expect(d.page.getByText('Assessment hali saqlanmagan')).toBeVisible();
    await settle(d.page);
    await shoot(d.page, '04-assessment-empty-uz-desktop');
    await d.context.close();
  });

  test('assessment with blocking issues uz desktop', async ({ browser }) => {
    const d = await hr(browser);
    await d.page.goto(`/uz/hr/vacancies/${issuesVacancy}/assessment`);
    await expect(d.page.getByText('Assessment hali tayyor emas')).toBeVisible();
    await settle(d.page);
    await shoot(d.page, '05-assessment-issues-uz-desktop');
    await d.context.close();
  });

  test('assessment ready after AI generation en desktop + uz mobile', async ({ browser }) => {
    const d = await hr(browser);
    await d.page.goto(`/en/hr/vacancies/${readyVacancy}/assessment`);
    await expect(d.page.getByText('Assessment is ready')).toBeVisible();
    await settle(d.page);
    await shoot(d.page, '06-assessment-ready-en-desktop');
    await d.context.close();

    const m = await hr(browser, MOBILE);
    await m.page.goto(`/uz/hr/vacancies/${readyVacancy}/assessment`);
    await expect(m.page.getByText('Assessment tayyor', { exact: true })).toBeVisible();
    await settle(m.page);
    await m.page.screenshot({ path: path.join(OUT_DIR, '07-assessment-ready-uz-mobile.png') });
    await m.context.close();
  });
});

// ---------------------------------------------------------------- Phase 4
test.describe('phase 4', () => {
  test.skip(PHASE !== '4', 'phase 4 set');
  test.skip(!DEMO.hr || !DEMO.candidate || !DEMO.password, 'set DEMO_* env vars');
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  type State = Awaited<ReturnType<APIRequestContext['storageState']>>;
  let candState: State;
  let hrCtx: APIRequestContext;
  let companyId = '';
  const vacancyIds: string[] = [];
  const apps: string[] = [];

  test.beforeAll(async ({ playwright }) => {
    hrCtx = await playwright.request.newContext({ baseURL: BASE_URL });
    const me = await ok(
      await hrCtx.post(`${API}/auth/login`, { data: { email: DEMO.hr, password: DEMO.password } }),
      'hr login',
    );
    companyId = me.companies[0].id;
    const cand = await playwright.request.newContext({ baseURL: BASE_URL });
    await ok(
      await cand.post(`${API}/auth/login`, {
        data: { email: DEMO.candidate, password: DEMO.password },
      }),
      'candidate login',
    );
    const stamp = Date.now();
    for (const n of [1, 2, 3]) {
      const vid = await makeInterviewVacancy(hrCtx, companyId, stamp, n);
      vacancyIds.push(vid);
      const a = await ok(
        await cand.post(`${API}/vacancies/${vid}/apply`, { data: { cover_note: 'Screenshot' } }),
        'apply',
      );
      apps.push(a.id);
    }
    candState = await cand.storageState();
    await cand.dispose();
  });

  test.afterAll(async () => {
    for (const id of vacancyIds) {
      await hrCtx
        .patch(`${API}/companies/${companyId}/vacancies/${id}`, { data: { status: 'archived' } })
        .catch(() => {});
    }
    await hrCtx.dispose();
  });

  async function cand(browser: import('@playwright/test').Browser, viewport = DESKTOP) {
    const context = await browser.newContext({
      viewport,
      colorScheme: 'light',
      reducedMotion: 'reduce',
      storageState: candState,
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    return { context, page: await context.newPage() };
  }
  const editor = (page: Page) => page.locator('.monaco-editor textarea').first();

  test('entry link, rules (uz + ru), system check, warm-up', async ({ browser }) => {
    const d = await cand(browser);
    await d.page.goto('/uz/candidate/applications');
    await expect(d.page.getByRole('link', { name: 'Intervyuni boshlash' }).first()).toBeVisible();
    await settle(d.page);
    await shoot(d.page, '01-applications-interview-link-uz-desktop');

    await d.page.goto(`/uz/candidate/interview/${apps[0]}`);
    await expect(
      d.page.getByRole('heading', { level: 1, name: 'Intervyu qoidalari' }),
    ).toBeVisible();
    await settle(d.page);
    await shoot(d.page, '02-rules-uz-desktop');
    await d.page.goto(`/ru/candidate/interview/${apps[0]}`);
    // Interview language comes from the assessment (uz), not from the site locale.
    await expect(
      d.page.getByRole('heading', { level: 1, name: 'Intervyu qoidalari' }),
    ).toBeVisible();

    await d.page.getByRole('checkbox', { name: "Qoidalarni o'qidim va qabul qilaman" }).check();
    await d.page.getByRole('button', { name: 'Davom etish' }).click();
    await expect(d.page.getByRole('heading', { level: 1 })).toHaveText('Проверка системы');
    await settle(d.page);
    await shoot(d.page, '03-system-check-ru-desktop');
    await d.page.getByRole('button', { name: 'Продолжить' }).click();
    await expect(d.page.getByRole('heading', { level: 1 })).toHaveText('Разминочное задание');
    await expect(d.page.locator('.monaco-editor').first()).toBeVisible({ timeout: 30_000 });
    await settle(d.page);
    await shoot(d.page, '04-warmup-ru-desktop');
    await d.context.close();
  });

  test('stage 1 editor with results, then completed', async ({ browser }) => {
    const d = await cand(browser);
    await d.page.goto(`/uz/candidate/interview/${apps[1]}`);
    await d.page.getByRole('checkbox', { name: "Qoidalarni o'qidim va qabul qilaman" }).check();
    await d.page.getByRole('button', { name: 'Davom etish' }).click();
    await d.page.getByRole('button', { name: 'Davom etish' }).click();
    await d.page.getByRole('button', { name: "O'tkazib yuborish" }).click();
    await d.page.getByRole('button', { name: '1-bosqichni boshlash' }).click();
    await expect(d.page.locator('.monaco-editor').first()).toBeVisible({ timeout: 30_000 });
    await editor(d.page).focus();
    await d.page.keyboard.press('Control+A');
    await d.page.keyboard.type('a, b = map(int, input().split())');
    await d.page.keyboard.press('Enter');
    await d.page.keyboard.type('print(a + b)');
    await d.page.getByRole('button', { name: 'Testlarni ishga tushirish' }).click();
    await expect(d.page.getByRole('heading', { name: "2 / 2 ta testdan o'tdi" })).toBeVisible({
      timeout: 60_000,
    });
    await settle(d.page);
    await shoot(d.page, '05-stage1-editor-results-uz-desktop');

    await d.page.getByRole('button', { name: 'Topshirish' }).click();
    await d.page.getByRole('alertdialog').screenshot({
      path: path.join(OUT_DIR, '06-submit-confirm-uz-desktop.png'),
    });
    await d.page.getByRole('alertdialog').getByRole('button', { name: 'Topshirish' }).click();
    await expect(d.page.getByRole('heading', { level: 1, name: '1-bosqich tugadi' })).toBeVisible({
      timeout: 30_000,
    });
    await shoot(d.page, '07-completed-uz-desktop');
    await d.context.close();
  });

  test('disqualified (external paste) en + phone notice', async ({ browser }) => {
    const d = await cand(browser);
    await d.page.goto(`/en/candidate/interview/${apps[2]}`);
    await d.page.getByRole('checkbox', { name: "Qoidalarni o'qidim va qabul qilaman" }).check();
    await d.page.getByRole('button', { name: 'Davom etish' }).click();
    await expect(d.page.getByRole('heading', { level: 1, name: 'System check' })).toBeVisible();
    await d.page.getByRole('button', { name: 'Continue' }).click();
    await d.page.getByRole('button', { name: 'Skip' }).click();
    await d.page.getByRole('button', { name: 'Start Stage 1' }).click();
    await expect(d.page.locator('.monaco-editor').first()).toBeVisible({ timeout: 30_000 });
    await editor(d.page).focus();
    const outside = Array.from(
      { length: 6 },
      (_, i) => `print("line ${i} from elsewhere!!!")`,
    ).join('\n');
    await d.page.evaluate((text) => {
      const t = document.querySelector('.monaco-editor textarea') as HTMLTextAreaElement;
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      t.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
      );
    }, outside);
    await expect(
      d.page.getByRole('heading', { level: 1, name: 'Interview ended: code pasted from outside' }),
    ).toBeVisible({ timeout: 30_000 });
    await shoot(d.page, '08-disqualified-en-desktop');
    await d.context.close();

    const m = await browser.newContext({
      viewport: MOBILE,
      colorScheme: 'light',
      storageState: candState,
    });
    const p = await m.newPage();
    await p.goto(`/uz/candidate/interview/${apps[0]}`);
    await expect(p.getByText('Intervyuni kompyuterda oching')).toBeVisible();
    await p.screenshot({ path: path.join(OUT_DIR, '09-desktop-only-uz-mobile.png') });
    await m.close();
  });
});

// ---------------------------------------------------------------- Phase 5
test.describe('phase 5', () => {
  test.skip(PHASE !== '5', 'phase 5 set');
  test.skip(!DEMO.hr || !DEMO.candidate || !DEMO.password, 'set DEMO_* env vars');
  test.describe.configure({ mode: 'serial', timeout: 300_000 });

  type State = Awaited<ReturnType<APIRequestContext['storageState']>>;
  let candState: State;
  let hrState: State;
  let hrCtx: APIRequestContext;
  let companyId = '';
  const vacancyIds: string[] = [];
  const apps: string[] = []; // 0 = passes, 1 = fails the pass mark, 2 = external paste

  test.beforeAll(async ({ playwright }) => {
    hrCtx = await playwright.request.newContext({ baseURL: BASE_URL });
    const me = await ok(
      await hrCtx.post(`${API}/auth/login`, { data: { email: DEMO.hr, password: DEMO.password } }),
      'hr login',
    );
    companyId = me.companies[0].id;
    hrState = await hrCtx.storageState();
    const cand = await playwright.request.newContext({ baseURL: BASE_URL });
    await ok(
      await cand.post(`${API}/auth/login`, {
        data: { email: DEMO.candidate, password: DEMO.password },
      }),
      'candidate login',
    );
    const stamp = Date.now();
    for (const n of [1, 2, 3]) {
      const vid = await makeInterviewVacancy(hrCtx, companyId, stamp, n);
      vacancyIds.push(vid);
      const a = await ok(
        await cand.post(`${API}/vacancies/${vid}/apply`, { data: { cover_note: 'Screenshot' } }),
        'apply',
      );
      apps.push(a.id);
    }
    candState = await cand.storageState();
    await cand.dispose();
  });

  test.afterAll(async () => {
    for (const id of vacancyIds) {
      await hrCtx
        .patch(`${API}/companies/${companyId}/vacancies/${id}`, { data: { status: 'archived' } })
        .catch(() => {});
    }
    await hrCtx.dispose();
  });

  async function as(browser: import('@playwright/test').Browser, state: State, viewport = DESKTOP) {
    const context = await browser.newContext({
      viewport,
      colorScheme: 'light',
      reducedMotion: 'reduce',
      storageState: state,
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    return { context, page: await context.newPage() };
  }
  const editor = (page: Page) => page.locator('.monaco-editor textarea').first();

  async function toStage1(page: Page, aid: string) {
    await page.goto(`/uz/candidate/interview/${aid}`);
    await page.getByRole('checkbox', { name: "Qoidalarni o'qidim va qabul qilaman" }).check();
    await page.getByRole('button', { name: 'Davom etish' }).click();
    await page.getByRole('button', { name: 'Davom etish' }).click();
    await page.getByRole('button', { name: "O'tkazib yuborish" }).click();
    await page.getByRole('button', { name: '1-bosqichni boshlash' }).click();
    await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 30_000 });
    await editor(page).focus();
  }
  async function write(page: Page, code: string[]) {
    await page.keyboard.press('Control+A');
    for (const [i, line] of code.entries()) {
      if (i) await page.keyboard.press('Enter');
      await page.keyboard.type(line);
    }
  }
  async function submit(page: Page) {
    await page.getByRole('button', { name: 'Topshirish' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Topshirish' }).click();
    await expect(page.getByRole('heading', { level: 1, name: '1-bosqich tugadi' })).toBeVisible({
      timeout: 30_000,
    });
  }

  test('compact room, then the passed result', async ({ browser }) => {
    const d = await as(browser, candState);
    await toStage1(d.page, apps[0]);
    await write(d.page, ['a, b = map(int, input().split())', 'print(a + b)']);
    await d.page.getByRole('button', { name: 'Testlarni ishga tushirish' }).click();
    await expect(d.page.getByRole('heading', { name: "2 / 2 ta testdan o'tdi" })).toBeVisible({
      timeout: 60_000,
    });
    // Something to see on the replay timeline: an inside paste (copy then paste).
    await editor(d.page).focus();
    await d.page.keyboard.press('Control+A');
    await d.page.keyboard.press('Control+C');
    await d.page.keyboard.press('Control+End');
    await d.page.keyboard.press('Enter');
    await d.page.keyboard.press('Control+V');
    await d.page.keyboard.press('Control+Z');
    await d.page.keyboard.press('Control+Z');
    await d.page.waitForTimeout(2500);
    await shoot(d.page, '01-compact-room-uz-desktop');
    await submit(d.page);
    await expect(d.page.getByRole('heading', { name: '1-bosqich natijasi' })).toBeVisible({
      timeout: 120_000,
    });
    await d.page.waitForTimeout(500);
    await shoot(d.page, '02-result-passed-uz-desktop');
    await d.context.close();
  });

  test('result below the pass mark (en) + pending shape', async ({ browser }) => {
    const d = await as(browser, candState);
    await toStage1(d.page, apps[1]);
    await write(d.page, ['print(0)']);
    await submit(d.page);
    await d.page.goto(`/en/candidate/interview/${apps[1]}`);
    await expect(d.page.getByRole('heading', { name: 'Stage 1 result' })).toBeVisible({
      timeout: 120_000,
    });
    await d.page.waitForTimeout(500);
    await shoot(d.page, '03-result-not-passed-en-desktop');
    await d.context.close();
  });

  test('HR report with suspicion, replay with markers, and the compact list', async ({
    browser,
  }) => {
    const d = await as(browser, hrState);
    await d.page.goto(`/uz/hr/candidates/${apps[0]}/stage1`);
    await expect(
      d.page.getByRole('heading', { level: 1, name: '1-bosqich hisoboti' }),
    ).toBeVisible();
    await expect(d.page.getByTestId('replay-editor').locator('.monaco-editor')).toBeVisible({
      timeout: 30_000,
    });
    await expect(d.page.locator('[data-marker="paste"]').first()).toBeVisible();
    await d.page.locator('[data-marker="paste"]').first().click();
    await d.page.waitForTimeout(500);
    await shoot(d.page, '04-hr-stage1-report-uz-desktop');
    await d.page
      .getByRole('group', { name: 'Kod replay pleyeri' })
      .screenshot({ path: path.join(OUT_DIR, '05-hr-replay-markers-uz-desktop.png') });
    await d.context.close();

    // External paste: disqualified, suspicion 100.
    const c = await as(browser, candState);
    await toStage1(c.page, apps[2]);
    const outside = Array.from(
      { length: 6 },
      (_, i) => `print("line ${i} from elsewhere!!!")`,
    ).join('\n');
    await c.page.evaluate((text) => {
      const t = document.querySelector('.monaco-editor textarea') as HTMLTextAreaElement;
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      t.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
      );
    }, outside);
    await expect(c.page.getByRole('heading', { level: 1 })).toHaveText(/Intervyu tugadi/, {
      timeout: 30_000,
    });
    await c.context.close();
    const h = await as(browser, hrState);
    await expect
      .poll(
        async () =>
          (
            await (
              await h.page.request.get(
                `${API}/companies/${companyId}/applications/${apps[2]}/stage1`,
              )
            ).json()
          ).suspicion_percent,
        { timeout: 90_000 },
      )
      .toBe(100);
    await h.page.goto(`/uz/hr/candidates/${apps[2]}/stage1`);
    await expect(h.page.getByText('Nomzod chetlatilgan')).toBeVisible();
    await expect(h.page.locator('[data-marker="paste"]').first()).toBeVisible({ timeout: 30_000 });
    await shoot(h.page, '06-hr-stage1-report-disqualified-uz-desktop');
    await h.context.close();
  });
});
