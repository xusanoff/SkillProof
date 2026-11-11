/** Regression checks from the hands-on UI review, against the local seeded stack. */
import { expect, test } from '@playwright/test';
import uz from '../messages/uz.json';
import { login } from './interview-setup';

test('keyboard skip link moves focus; language switching preserves search filters', async ({
  page,
}) => {
  await page.goto('/uz');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: uz.common.skipToContent })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toMatch(/geist/i);
  await page.goto('/uz/vacancies?q=Python&remote_type=remote');
  await page.getByRole('navigation', { name: uz.locale.label }).locator('a[lang="ru"]').click();
  await expect(page).toHaveURL(/\/ru\/vacancies\?/);
  const url = new URL(page.url());
  expect(url.searchParams.get('q')).toBe('Python');
  expect(url.searchParams.get('remote_type')).toBe('remote');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
});

test('mobile candidate profile saves and survives a reload; invalid login fields are marked', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/uz/login');
  await page.getByRole('button', { name: uz.auth.login.submit, exact: true }).click();
  await expect(page.locator('[aria-invalid=true]').first()).toBeVisible();
  await login(page.request, {
    email: process.env.DEMO_CANDIDATE_EMAIL ?? 'demo.candidate@example.com',
    password: process.env.DEMO_PASSWORD ?? 'Demo-parol-2026',
  });
  await page.goto('/uz/candidate/profile');
  const field = page.getByLabel(uz.candidate.profile.headline, { exact: false });
  const original = await field.inputValue();
  try {
    await field.fill('UI review — Python developer');
    await page.getByRole('button', { name: uz.common.save, exact: true }).click();
    await expect(page.getByText(uz.candidate.profile.saved, { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel(uz.candidate.profile.headline, { exact: false })).toHaveValue(
      'UI review — Python developer',
    );
  } finally {
    await page.getByLabel(uz.candidate.profile.headline, { exact: false }).fill(original);
    await page.getByRole('button', { name: uz.common.save, exact: true }).click();
    await expect(page.getByText(uz.candidate.profile.saved, { exact: true })).toBeVisible();
  }
});
