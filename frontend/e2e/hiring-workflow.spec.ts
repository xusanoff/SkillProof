import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { login, ok, API } from './interview-setup';
import { mkdir } from 'node:fs/promises';
const password = process.env.DEMO_PASSWORD ?? 'Demo-parol-2026';
const archive = async (
  request: import('@playwright/test').APIRequestContext,
  cid: string,
  vid: string,
) => request.patch(`${API}/companies/${cid}/vacancies/${vid}`, { data: { status: 'archived' } });
const input = {
  title: 'Workflow',
  description: 'Hiring workflow test',
  profession_area: 'it',
  remote_type: 'remote',
  employment_type: 'full_time',
  experience_level: 'between_1_3',
  skills: [],
};
test('three-step creation selects bank items, creates a new question and publishes only at the end', async ({
  page,
}) => {
  test.setTimeout(120000);
  const me = await login(page.request, {
    email: process.env.DEMO_HR_EMAIL ?? 'demo.hr@example.com',
    password,
  });
  const cid = me.companies[0].id;
  const tasks = await ok(
    await page.request.get(`${API}/companies/${cid}/tasks?include_global=true&page_size=100`),
    'tasks',
  );
  const questions = await ok(
    await page.request.get(`${API}/companies/${cid}/questions?include_global=true&page_size=100`),
    'questions',
  );
  const task = tasks.items.find(
    (x: { is_approved: boolean; verification_status: string; language: string }) =>
      x.is_approved && x.verification_status === 'passed' && x.language === 'uz',
  );
  const question = questions.items.find(
    (x: { is_approved: boolean; language: string }) => x.is_approved && x.language === 'uz',
  );
  expect(task).toBeTruthy();
  expect(question).toBeTruthy();
  let vid: string | undefined;
  try {
    await page.goto('/uz/hr/vacancies/new');
    await page.getByLabel('Lavozim nomi', { exact: true }).fill(`Workflow ${Date.now()}`);
    await page.getByLabel('Vakansiya tavsifi', { exact: true }).fill('Create reliable APIs.');
    const creating = page.waitForResponse(
      (r) => r.url().endsWith(`/companies/${cid}/vacancies`) && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Keyingi bosqich' }).click();
    vid = (await (await creating).json()).id;
    await expect(page.getByLabel('Baholash tili', { exact: true })).toBeVisible();
    expect(
      (await ok(await page.request.get(`${API}/companies/${cid}/vacancies/${vid}`), 'draft'))
        .status,
    ).toBe('draft');
    await page.getByLabel('Savollar soni', { exact: false }).fill('1');
    await page.getByRole('button', { name: 'Keyingi bosqich' }).click();
    const taskRegion = page.getByRole('region', { name: '1-bosqich — kod topshiriqlari' });
    await taskRegion.getByLabel('Bankdan topshiriq').selectOption(task.id);
    await taskRegion.getByRole('button', { name: "Qo'shish" }).click();
    const qRegion = page.getByRole('region', { name: '2-bosqich — suhbat' });
    await qRegion.getByLabel('Bankdan savol', { exact: true }).selectOption(question.id);
    await qRegion.getByRole('button', { name: "Qo'shish" }).click();
    await page.getByRole('button', { name: 'Yangi savol qo‘shish' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Turi', { exact: true }).selectOption('mcq');
    await dialog.getByLabel('Savol matni', { exact: true }).fill('Which status means success?');
    await dialog.getByLabel('Variant 1', { exact: true }).fill('200');
    await dialog.getByLabel('Variant 2', { exact: true }).fill('500');
    await dialog.getByRole('checkbox').first().check();
    await dialog.getByRole('button', { name: 'Saqlash', exact: true }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: 'Tasdiqlash', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Tasdiqlash', exact: true })).toBeHidden();
    await mkdir('../docs/reports/hiring-workflow', { recursive: true });
    await page.screenshot({ path: '../docs/reports/hiring-workflow/wizard-desktop.png' });
    const a11y = await new AxeBuilder({ page }).analyze();
    expect(
      a11y.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([]);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Saqlash va nashr qilish' }).click();
    await expect(page).toHaveURL(/\/hr\/vacancies\?status=published/);
    const assessment = await ok(
      await page.request.get(`${API}/companies/${cid}/vacancies/${vid}/assessment`),
      'assessment',
    );
    expect(assessment.ready).toBe(true);
    expect(
      assessment.questions.some((q: { text: string }) => q.text === 'Which status means success?'),
    ).toBe(true);
  } finally {
    if (vid) await archive(page.request, cid, vid);
  }
});
test('candidate and company chat exchange messages and rejection appears in the same thread', async ({
  browser,
}) => {
  test.setTimeout(90000);
  const hc = await browser.newContext(),
    cc = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const hp = await hc.newPage(),
    cp = await cc.newPage();
  const hr = await login(hc.request, {
    email: process.env.DEMO_HR_EMAIL ?? 'demo.hr@example.com',
    password,
  });
  await login(cc.request, {
    email: process.env.DEMO_CANDIDATE_EMAIL ?? 'demo.candidate@example.com',
    password,
  });
  const cid = hr.companies[0].id;
  const v = await ok(
    await hc.request.post(`${API}/companies/${cid}/vacancies`, {
      data: { ...input, title: `Chat flow ${Date.now()}` },
    }),
    'create',
  );
  const vid = v.id;
  try {
    await ok(
      await hc.request.patch(`${API}/companies/${cid}/vacancies/${vid}`, {
        data: { status: 'published' },
      }),
      'publish',
    );
    const a = await ok(
      await cc.request.post(`${API}/vacancies/${vid}/apply`, {
        data: { cover_note: 'Hello company' },
      }),
      'apply',
    );
    await Promise.all([
      hp.goto(`/uz/hr/messages/${a.id}`),
      cp.goto(`/uz/candidate/messages/${a.id}`),
    ]);
    const question = 'I have a question about this role <b>plain text</b>';
    await cp.getByLabel('Xabaringizni yozing').fill(question);
    await cp.getByRole('button', { name: 'Yuborish', exact: true }).click();
    await expect(hp.getByText(question, { exact: true })).toBeVisible({ timeout: 15000 });
    await hp.getByLabel('Xabaringizni yozing').fill('Please ask your question.');
    await hp.getByRole('button', { name: 'Yuborish', exact: true }).click();
    await expect(cp.getByText('Please ask your question.', { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await ok(
      await hc.request.patch(`${API}/companies/${cid}/applications/${a.id}`, {
        data: { status: 'rejected' },
      }),
      'reject',
    );
    await expect(cp.getByText(/Ariza holati:.*Rad/).first()).toBeVisible({ timeout: 15000 });
    await cp.getByLabel('Xabaringizni yozing').fill('Thank you. Can you share feedback?');
    await cp.getByRole('button', { name: 'Yuborish', exact: true }).click();
    await expect(hp.getByText('Thank you. Can you share feedback?', { exact: true })).toBeVisible({
      timeout: 15000,
    });
    expect(await cp.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await mkdir('../docs/reports/hiring-workflow', { recursive: true });
    await cp.screenshot({ path: '../docs/reports/hiring-workflow/chat-mobile.png' });
    const a11y = await new AxeBuilder({ page: cp }).analyze();
    expect(
      a11y.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([]);
  } finally {
    await archive(hc.request, cid, vid);
    await hc.close();
    await cc.close();
  }
});
