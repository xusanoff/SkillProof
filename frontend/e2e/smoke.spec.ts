import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockAnonymous, settle } from './utils';

const LOCALES = [
  { code: 'uz', h1: /bilim bilan kiring/i, signIn: 'Kirish' },
  { code: 'ru', h1: /по навыкам/i, signIn: 'Войти' },
  { code: 'en', h1: /proven skill/i, signIn: 'Sign in' },
] as const;

test('root redirects to the default locale (uz)', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/uz\/?$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'uz');
});

for (const { code, h1, signIn } of LOCALES) {
  test(`home renders in ${code} without serious a11y violations`, async ({ page, isMobile }) => {
    await mockAnonymous(page);
    await page.goto(`/${code}`);
    await expect(page.locator('html')).toHaveAttribute('lang', code);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(h1);
    // Desktop: "Sign in" in the header. Phone: the bottom bar's Profile goes to login.
    if (!isMobile) await expect(page.getByRole('link', { name: signIn })).toBeVisible();
    await expect(page.getByRole('search').locator('input[name="q"]')).toBeVisible();

    await settle(page);
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
}

test('language switcher keeps the current path', async ({ page }) => {
  await page.goto('/uz/status');
  await page
    .getByRole('navigation', { name: 'Interfeys tili' })
    .getByRole('link', { name: /Русский/ })
    .click();
  await expect(page).toHaveURL(/\/ru\/status$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Состояние системы');
});

test('unknown path shows the localized not-found page', async ({ page }) => {
  const response = await page.goto('/en/definitely-missing');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/could not be found/i);
});

test('status page settles on a final state', async ({ page }) => {
  await page.goto('/en/status');
  await expect(page.getByText(/^(Operational|Partially operational|Unavailable)$/)).toBeVisible({
    timeout: 20_000,
  });
});
