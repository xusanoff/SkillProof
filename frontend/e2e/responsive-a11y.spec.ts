/**
 * Every non-coding page on a phone and on a desktop, with the seeded stack (spec Phase 9).
 * Fails on sideways scrolling and on serious or critical axe findings.
 * Problems are collected per sweep, so one run shows all of them.
 */
import {
  expect,
  test,
  type Browser,
  type BrowserContextOptions,
  type Page,
} from '@playwright/test';
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { API, login } from './interview-setup';
import { settle } from './utils';

const PASSWORD = process.env.DEMO_PASSWORD ?? 'Demo-parol-2026';
const HR = process.env.DEMO_HR_EMAIL ?? 'demo.hr@example.com';
const ADMIN = process.env.DEMO_ADMIN_EMAIL ?? 'demo.admin@example.com';
const CANDIDATE = process.env.DEMO_CANDIDATE_EMAIL ?? 'demo.candidate@example.com';

const MODES: { name: string; locale: string; options: BrowserContextOptions }[] = [
  {
    name: 'phone-uz',
    locale: 'uz',
    options: { viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true },
  },
  {
    // Russian has the longest words: the hardest case for a narrow screen.
    name: 'phone-ru-dark',
    locale: 'ru',
    options: {
      viewport: { width: 360, height: 740 },
      hasTouch: true,
      isMobile: true,
      colorScheme: 'dark',
    },
  },
  { name: 'desktop-en', locale: 'en', options: { viewport: { width: 1440, height: 900 } } },
];

if (process.env.REDESIGN_REVIEW) {
  MODES.splice(
    0,
    MODES.length,
    ...['uz', 'ru', 'en'].flatMap((locale) =>
      ['light', 'dark'].flatMap((theme) =>
        [390, 1440].map((width) => ({
          name: `${locale}-${theme}-${width}`,
          locale,
          options: {
            viewport: { width, height: 900 },
            colorScheme: theme as 'light' | 'dark',
            reducedMotion: 'reduce' as const,
          },
        })),
      ),
    ),
  );
}

if (process.env.REDESIGN_TABLET) {
  MODES.splice(0, MODES.length, {
    name: 'tablet-ru-dark',
    locale: 'ru',
    options: {
      viewport: { width: 768, height: 1024 },
      colorScheme: 'dark',
      reducedMotion: 'reduce',
    },
  });
}

async function checkPage(page: Page, url: string, problems: string[], mode: string) {
  const res = await page.goto(url);
  // Reveal-on-scroll needs hydration first, or settle() scrolls past cards that never wake up.
  await page.waitForLoadState('networkidle');
  await settle(page);
  const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  if (!font.toLowerCase().includes('geist')) {
    problems.push(`${url} STYLES body font is ${font}`);
  }
  if (!res || res.status() >= 400) problems.push(`${url} HTTP ${res?.status()}`);

  const overflow = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const by = document.documentElement.scrollWidth - width;
    if (by <= 0) return null;
    const culprit = [...document.querySelectorAll('body *')].find((el) => {
      const r = el.getBoundingClientRect();
      if (r.right <= width + 1 || r.width === 0 || getComputedStyle(el).position === 'fixed') {
        return false;
      }
      // Whatever sits inside its own scroller cannot widen the page.
      for (let up = el.parentElement; up && up !== document.body; up = up.parentElement) {
        if (getComputedStyle(up).overflowX !== 'visible') return false;
      }
      return true;
    });
    return `${by}px <${culprit?.tagName.toLowerCase()} class="${String(culprit?.getAttribute('class') ?? '').slice(0, 70)}">`;
  });
  if (overflow) problems.push(`${url} OVERFLOW ${overflow}`);

  if (process.env.REDESIGN_REVIEW) {
    await page.screenshot({
      path: path.resolve(
        __dirname,
        '../../docs/reports/redesign/screens',
        mode,
        `${url.replace(/[^a-zA-Z0-9-]+/g, '_')}.png`,
      ),
      fullPage: true,
    });
  }

  const { default: AxeBuilder } = await import('@axe-core/playwright');
  const { violations } = await new AxeBuilder({ page }).analyze();
  for (const v of violations) {
    if (v.impact !== 'serious' && v.impact !== 'critical') continue;
    const target = String(v.nodes[0]?.target ?? '').slice(0, 90);
    problems.push(`${url} AXE ${v.id} x${v.nodes.length} ${target}`);
  }
}

async function sweep(
  browser: Browser,
  mode: (typeof MODES)[number],
  pages: string[],
  who?: string,
) {
  const context = await browser.newContext({
    ...mode.options,
    baseURL: test.info().project.use.baseURL,
  });
  if (who) await login(context.request, { email: who, password: PASSWORD });
  const page = await context.newPage();
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`${page.url()} JS ${error.message}`));
  page.on('console', (message) => {
    if (/MISSING_MESSAGE|FORMATTING_ERROR|INVALID_MESSAGE/.test(message.text())) {
      problems.push(`${page.url()} I18N ${message.text()}`);
    }
  });
  for (const path of pages) await checkPage(page, `/${mode.locale}${path}`, problems, mode.name);
  await context.close();
  if (process.env.REDESIGN_REVIEW) {
    const out = path.resolve(__dirname, '../../docs/reports/redesign/checks');
    mkdirSync(out, { recursive: true });
    const role =
      who === HR ? 'hr' : who === ADMIN ? 'admin' : who === CANDIDATE ? 'candidate' : 'public';
    writeFileSync(
      path.join(out, `${mode.name}-${role}.json`),
      JSON.stringify({ mode: mode.name, role, pages, problems }, null, 2),
    );
  }
  expect(problems, `${mode.name}:\n${problems.join('\n')}`).toEqual([]);
}

async function json(browser: Browser, email: string, path: string) {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  await login(context.request, { email, password: PASSWORD });
  const res = await context.request.get(`${API}${path}`);
  const body = await res.json();
  await context.close();
  return body;
}

test.describe.configure({ timeout: 300_000 });

for (const mode of MODES) {
  test(`public pages, ${mode.name}`, async ({ browser, request }) => {
    const vacancies = await (await request.get(`${API}/vacancies?size=1`)).json();
    const vacancy = vacancies.items[0];
    await sweep(browser, mode, [
      '',
      '/vacancies',
      `/vacancies/${vacancy.id}`,
      ...(vacancy.company?.slug ? [`/companies/${vacancy.company.slug}`] : []),
      '/login',
      '/register',
      '/forgot-password',
      '/status',
    ]);
  });

  test(`candidate pages, ${mode.name}`, async ({ browser }) => {
    const apps = await json(browser, CANDIDATE, '/candidate/applications?status=evaluated&size=1');
    await sweep(
      browser,
      mode,
      [
        '/candidate/applications',
        ...(apps.items[0] ? [`/candidate/applications/${apps.items[0].id}/results`] : []),
        '/candidate/results',
        '/candidate/saved',
        '/candidate/skills',
        '/candidate/profile',
        '/settings',
      ],
      CANDIDATE,
    );
  });

  test(`admin pages, ${mode.name}`, async ({ browser }) => {
    await sweep(
      browser,
      mode,
      [
        '/admin',
        '/admin/users',
        '/admin/companies',
        '/admin/vacancies',
        '/admin/questions',
        '/admin/tasks',
        '/admin/thresholds',
        '/admin/ai-usage',
      ],
      ADMIN,
    );
  });

  test(`HR pages, ${mode.name}`, async ({ browser }) => {
    const me = await json(browser, HR, '/auth/me');
    const company = me.companies[0].id;
    const apps = await json(browser, HR, `/companies/${company}/applications?size=1`);
    const vacancies = await json(browser, HR, `/companies/${company}/vacancies?size=1`);
    const app = apps.items[0]?.id;
    const vacancy = vacancies.items[0]?.id;
    await sweep(
      browser,
      mode,
      [
        '/hr',
        '/hr/vacancies',
        '/hr/vacancies/new',
        ...(vacancy
          ? [`/hr/vacancies/${vacancy}/edit`, `/hr/vacancies/${vacancy}/assessment`]
          : []),
        '/hr/candidates',
        ...(app ? [`/hr/candidates/${app}`, `/hr/candidates/${app}/stage1`] : []),
        '/hr/questions',
        '/hr/tasks',
        '/hr/talent',
        '/hr/analytics',
        '/hr/team',
        '/hr/company',
        '/settings',
      ],
      HR,
    );
  });
}
