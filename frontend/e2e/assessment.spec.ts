import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { settle } from './utils';
import { login } from './interview-setup';

/**
 * Phase 3, HR flow against the REAL stack (`make up && make seed`, mock LLM):
 * a new vacancy → assessment page → auto-approve + save → "AI bilan yaratish" → job done → ready.
 * Demo account: DEMO_HR_EMAIL / DEMO_PASSWORD (defaults: the local seed).
 */
const API = '/api/api/v1';
const EMAIL = process.env.DEMO_HR_EMAIL ?? 'demo.hr@example.com';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'Demo-parol-2026';

test('HR generates a two-stage assessment with AI and it becomes ready', async ({ page }) => {
  test.setTimeout(120_000);
  const me = await login(page.request, { email: EMAIL, password: PASSWORD });
  const created = await page.request.post(`${API}/companies/${me.companies[0].id}/vacancies`, {
    data: {
      title: `E2E assessment ${Date.now()}`,
      profession_area: 'it',
      region_code: 'UZ-TK',
      remote_type: 'office',
      employment_type: 'full_time',
      experience_level: 'between_1_3',
      description: 'E2E test vacancy',
      skills: [],
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const vacancy = await created.json();

  await page.goto(`/uz/hr/vacancies/${vacancy.id}/assessment`);
  await expect(page.getByRole('heading', { level: 1, name: 'Assessment' })).toBeVisible();
  // GET 404 = nothing saved yet.
  await expect(page.getByText('Assessment hali saqlanmagan')).toBeVisible();

  await page.getByRole('switch', { name: 'AI elementlarini avtomatik tasdiqlash' }).click();
  await page.getByRole('button', { name: 'Assessmentni saqlash' }).click();
  await expect(page.getByText('Assessment saqlandi.')).toBeVisible();
  await expect(page.getByText('Assessment hali tayyor emas')).toBeVisible();

  await page.getByRole('button', { name: 'AI bilan yaratish' }).click();
  await expect(page.getByText('Yaratish tugadi')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText('Assessment tayyor', { exact: true })).toBeVisible();
  await expect(page.getByText('Topshiriq tanlanmagan.')).toBeHidden();

  await settle(page);
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
});
