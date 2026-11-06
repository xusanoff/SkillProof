import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const destination = new URL('../../docs/reports/redesign/home/', import.meta.url);
await mkdir(destination, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const locale of process.env.FLOWS_ONLY ? [] : ['uz', 'ru', 'en']) {
    for (const theme of ['light', 'dark']) {
      for (const width of [1440, 390]) {
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          reducedMotion: 'reduce',
        });
        await context.addInitScript((value) => localStorage.setItem('theme', value), theme);
        const page = await context.newPage();
        const errors = [];
        const expectedAuthResponses = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (message) => {
          if (message.type() !== 'error') return;
          if (
            message.text().includes('401') &&
            /\/auth\/(me|refresh)$/.test(message.location().url)
          )
            expectedAuthResponses.push(message.location().url);
          else errors.push(message.text());
        });
        await page.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/${locale}`);
        await page.locator('h1').waitFor();
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(1200);
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 450) {
            scrollTo(0, y);
            await new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            );
          }
          scrollTo(0, 0);
        });
        await page.waitForFunction(() =>
          [...document.querySelectorAll('main [style*="opacity"]')]
            .filter((el) => el.tagName !== 'INPUT' && el.checkVisibility())
            .every((el) => getComputedStyle(el).opacity === '1'),
        );
        const layout = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth,
          font: getComputedStyle(document.body).fontFamily,
          background: getComputedStyle(document.body).backgroundColor,
          theme: document.documentElement.className,
          searchVisible: [...document.querySelectorAll('input[name="q"]')].some(
            (el) => el.getBoundingClientRect().width > 0,
          ),
        }));
        const accessibility = await new AxeBuilder({ page }).analyze();
        const violations = accessibility.violations
          .filter((item) => ['serious', 'critical'].includes(item.impact))
          .map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }));
        const name = `${locale}-${theme}-${width}`;
        await page.screenshot({
          path: new URL(`${name}.png`, destination).pathname,
          fullPage: true,
        });
        if (locale === 'uz' && theme === 'light')
          await page.screenshot({ path: new URL(`${name}-viewport.png`, destination).pathname });
        const result = { name, ...layout, errors, expectedAuthResponses, violations };
        results.push(result);
        console.log(JSON.stringify(result));
        await context.close();
      }
    }
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${process.env.BASE_URL || 'http://localhost:3000'}/en`);
  await page.waitForLoadState('networkidle');
  await page.locator('#hero-search-q:visible').fill('Python');
  await page
    .locator('#hero-search-q:visible')
    .locator('xpath=ancestor::form')
    .getByRole('button', { name: 'Search', exact: true })
    .click();
  await page.waitForURL(
    (url) => url.pathname === '/en/vacancies' && url.searchParams.get('q') === 'Python',
  );
  const searchUrl = page.url();
  await page
    .getByRole('navigation', { name: 'Interface language' })
    .first()
    .getByRole('link', { name: /Русский/ })
    .click();
  await page.waitForURL(
    (url) => url.pathname === '/ru/vacancies' && url.searchParams.get('q') === 'Python',
  );
  await writeFile(
    new URL('flows.json', destination),
    JSON.stringify({ searchUrl, localeUrl: page.url() }, null, 2),
  );
  await context.close();
} finally {
  await browser.close();
  if (results.length)
    await writeFile(new URL('checks.json', destination), JSON.stringify(results, null, 2));
}
if (
  results.some(
    (item) => item.overflow || item.errors.length || item.violations.length || !item.searchVisible,
  )
)
  process.exitCode = 1;
