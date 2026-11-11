import { captureInterview } from './redesign-capture';
import AxeBuilder from '@axe-core/playwright';
import { API, makeInterviewVacancy, login, ok } from './interview-setup';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Phase 4, candidate Stage 1 against the REAL stack (`make up && make seed`, mock LLM, Judge0).
 * HR (API): vacancy + a real python task (correct reference solution) + 8 questions + assessment.
 * Candidate (browser): rules → system check → warm-up → Monaco → Run (real Judge0) →
 *   internal paste works → Submit → completed.  A second application: a big external paste →
 *   disqualified. State is verified through the API, never the database.
 */
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const HR = {
  email: process.env.DEMO_HR_EMAIL ?? 'demo.hr@example.com',
  password: process.env.DEMO_PASSWORD ?? 'Demo-parol-2026',
};
const CANDIDATE = {
  email: process.env.DEMO_CANDIDATE_EMAIL ?? 'demo.candidate@example.com',
  password: process.env.DEMO_PASSWORD ?? 'Demo-parol-2026',
};

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });
test.describe.configure({ mode: 'serial', timeout: 180_000 });

let hr: APIRequestContext;
let companyId = '';
const vacancyIds: string[] = [];
const applications: { aid: string; vid: string }[] = [];

test.beforeAll(async ({ playwright }) => {
  hr = await playwright.request.newContext({ baseURL: BASE_URL });
  const me = await login(hr, HR, 'hr login');
  companyId = me.companies[0].id;
  const stamp = Date.now();
  const cand = await playwright.request.newContext({ baseURL: BASE_URL });
  await login(cand, CANDIDATE, 'candidate login');
  for (const n of [1, 2]) {
    const vid = await makeInterviewVacancy(hr, companyId, stamp, n);
    vacancyIds.push(vid);
    const app = await ok(
      await cand.post(`${API}/vacancies/${vid}/apply`, {
        data: { cover_note: 'E2E: intervyuni sinab ko‘rish uchun ariza.' },
      }),
      'apply',
    );
    applications.push({ aid: app.id, vid });
  }
  await cand.dispose();
});

test.afterAll(async () => {
  const C = `${API}/companies/${companyId}`;
  for (const id of vacancyIds) {
    await hr.patch(`${C}/vacancies/${id}`, { data: { status: 'archived' } }).catch(() => {});
  }
  await hr.dispose();
});

async function signInCandidate(page: Page) {
  await login(page.request, CANDIDATE, 'login');
}

async function passRulesAndWarmup(page: Page, aid: string) {
  await page.goto(`/uz/candidate/interview/${aid}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Intervyu qoidalari' })).toBeVisible();
  await page.getByRole('checkbox', { name: "Qoidalarni o'qidim va qabul qilaman" }).check();
  await page.getByRole('button', { name: 'Davom etish' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Tizim tekshiruvi' })).toBeVisible();
  await page.getByRole('button', { name: 'Davom etish' }).click();
  await expect(page.getByRole('heading', { level: 1, name: "Qizish topshirig'i" })).toBeVisible();
  await page.getByRole('button', { name: "O'tkazib yuborish" }).click();
  await page.getByRole('button', { name: '1-bosqichni boshlash' }).click();
  await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 30_000 });
}

const editorText = (page: Page) =>
  page.evaluate(() => {
    const m = (
      window as unknown as { monaco: { editor: { getModels(): { getValue(): string }[] } } }
    ).monaco;
    return m.editor.getModels()[0]?.getValue() ?? '';
  });

async function interviewState(page: Page, aid: string) {
  return ok(await page.request.get(`${API}/applications/${aid}/interview`), 'state');
}

test('candidate completes Stage 1: Monaco, real Run, internal paste, Submit', async ({ page }) => {
  const { aid } = applications[0];
  await signInCandidate(page);
  await page.goto(`/uz/candidate/applications`);
  await expect(page.getByRole('link', { name: 'Intervyuni boshlash' }).first()).toBeVisible();
  const rules = await page.goto(`/uz/candidate/interview/${aid}`);
  expect(rules?.ok()).toBe(true);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual(
    [],
  );

  await passRulesAndWarmup(page, aid);
  await captureInterview(page, 'stage1', false);
  await page.locator('.monaco-editor textarea').first().focus();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('a, b = map(int, input().split())');
  await page.keyboard.press('Enter');
  await page.keyboard.type('print(a + b)');

  await page.getByRole('button', { name: 'Testlarni ishga tushirish' }).click();
  await expect(page.getByRole('heading', { name: "2 / 2 ta testdan o'tdi" })).toBeVisible({
    timeout: 60_000,
  });

  const solution = await editorText(page);
  // The compact room: no site chrome while Stage 1 runs.
  await expect(page.locator('[data-site-chrome]').first()).toBeHidden();
  page.on('dialog', (d) => void d.accept()); // beforeunload on reload

  // Language switch (with the server's label): the editor is recreated, then restored.
  const lang = page.getByLabel('Dasturlash tili');
  await expect(lang.locator('option')).toContainText([/Python/, /JavaScript/]);
  await lang.selectOption('javascript');
  await expect.poll(() => editorText(page)).toContain('// kodni shu yerga yozing');
  await page.locator('.monaco-editor textarea').first().focus();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('console.log(1)');
  await lang.selectOption('python');
  await expect.poll(() => editorText(page)).toBe(solution);

  // Two cursors on one line: Monaco reports both changes in one event; the replay must agree.
  await page.locator('.monaco-editor textarea').first().focus();
  await page.evaluate(() => {
    const m = (window as unknown as { monaco: any }).monaco; // eslint-disable-line @typescript-eslint/no-explicit-any
    const ed = m.editor.getEditors()[0];
    ed.setSelections([
      new m.Selection(1, 1, 1, 1),
      new m.Selection(1, 6, 1, 6),
      new m.Selection(2, 3, 2, 3),
    ]);
  });
  await page.keyboard.type('QQ');
  await expect.poll(() => editorText(page)).toContain('QQ');
  await page.keyboard.press('Control+Z');
  await expect.poll(() => editorText(page)).toBe(solution);

  // Internal paste: copy inside the editor, paste inside the editor → allowed, text inserted.
  await page.locator('.monaco-editor textarea').first().focus();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Control+C');
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+V');
  await expect.poll(() => editorText(page)).toContain(solution + '\n' + solution);
  // Undo / redo of the pasted block must be explained by the editor, never `unknown`.
  await page.keyboard.press('Control+Z');
  await expect.poll(() => editorText(page)).not.toContain(solution + '\n' + solution);
  await page.keyboard.press('Control+Shift+Z');
  await expect.poll(() => editorText(page)).toContain(solution + '\n' + solution);
  await page.keyboard.press('Control+Z');
  await page.keyboard.press('Control+Z');
  await expect.poll(() => editorText(page)).toBe(solution);
  await page.waitForTimeout(6500); // events batch (1.5 s) and draft (5 s) are on the server

  // Still in progress: an internal paste never disqualifies.
  expect((await interviewState(page, aid)).session.status).toBe('in_progress');

  // Reload with something typed that is neither acknowledged nor saved as a draft yet.
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\n# last words');
  await page.reload();
  await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 30_000 });
  const restored = await expect
    .poll(() => editorText(page))
    .toContain(solution)
    .then(() => editorText(page));
  test.info().annotations.push({
    type: 'reload',
    description: restored.includes('# last words')
      ? 'text typed just before reload was kept'
      : 'text typed in the last ~1.5-5 s before reload was lost (not yet acknowledged / saved)',
  });
  await page.locator('.monaco-editor textarea').first().focus();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\n# done');

  await page.getByRole('button', { name: 'Topshirish' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Topshirish' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '1-bosqich tugadi' })).toBeVisible({
    timeout: 30_000,
  });
  expect((await interviewState(page, aid)).session.status).toBe('completed');

  // The result is scored after the stage ends (sweep ~15 s + sandbox): the page polls itself.
  await expect(page.getByRole('heading', { name: '1-bosqich natijasi' })).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.getByText('Yashirin testlar:')).toBeVisible();
  const done = await interviewState(page, aid);
  expect(done.session.result.state).toBe('done');
  // No integrity data ever reaches the candidate.
  expect(JSON.stringify(done)).not.toMatch(/suspicion|signal/i);
});

test('HR replays the session to the end: Monaco text equals final_code exactly', async ({
  page,
  browser,
}) => {
  const { aid } = applications[0];
  const hrPage = await (await browser.newContext()).newPage();
  await login(hrPage.request, HR, 'hr login');
  const report = await ok(
    await hrPage.request.get(`${API}/companies/${companyId}/applications/${aid}/stage1`),
    'report',
  );
  expect(report.evaluation_state).toBe('done');
  expect(report.suspicion_percent).not.toBeNull();
  const finalCode: string = report.tasks[0].final_code;
  void page;

  await hrPage.goto(`/uz/hr/candidates/${aid}/stage1`);
  await expect(hrPage.getByRole('heading', { level: 1, name: '1-bosqich hisoboti' })).toBeVisible();
  await expect(hrPage.getByRole('heading', { name: 'AI yordami shubhasi' })).toBeVisible();
  await expect(hrPage.getByText(/qarorni avtomatik hal qilmaydi/).first()).toBeVisible();
  await expect(hrPage.getByTestId('replay-editor').locator('.monaco-editor')).toBeVisible({
    timeout: 30_000,
  });
  // Timeline marks: the run and the internal paste are there.
  await expect(hrPage.locator('[data-marker="run"]').first()).toBeVisible();
  await expect(hrPage.locator('[data-marker="paste"]').first()).toBeVisible();
  await captureInterview(hrPage, 'hr-replay', false);

  const text = () =>
    hrPage.evaluate(() => {
      const m = (
        window as unknown as { monaco: { editor: { getModels(): { getValue(): string }[] } } }
      ).monaco;
      return m.editor.getModels()[0]?.getValue() ?? '';
    });
  // Start: the initial code (not the final one).
  expect(await text()).not.toBe(finalCode);
  // Scrub to the end with the timeline, then check with the button too.
  const slider = hrPage.getByRole('slider', { name: 'Vaqt shkalasi' });
  await slider.fill((await slider.getAttribute('max')) as string);
  await expect.poll(text).toBe(finalCode);
  await hrPage.getByRole('button', { name: 'Boshiga' }).click();
  await expect.poll(text).not.toBe(finalCode);
  await hrPage.getByRole('button', { name: 'Oxiriga' }).click();
  await expect.poll(text).toBe(finalCode);
  // Keyboard: Space starts playback, and it can be paused again.
  await hrPage.getByRole('button', { name: 'Boshiga' }).click();
  await hrPage.getByRole('group', { name: "Kod yozuvini ko'rish" }).focus();
  await hrPage.keyboard.press('Space');
  await expect(hrPage.getByRole('button', { name: 'Pauza' })).toBeVisible();
  await hrPage.keyboard.press('Space');
  await expect(hrPage.getByRole('button', { name: 'Ijro' })).toBeVisible();

  const axe = await new AxeBuilder({ page: hrPage }).exclude('.monaco-editor').analyze();
  expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual(
    [],
  );
});

test('a large external paste disqualifies and is never inserted', async ({ page, browser }) => {
  const { aid } = applications[1];
  await signInCandidate(page);
  await passRulesAndWarmup(page, aid);
  await page.locator('.monaco-editor textarea').first().focus();
  await page.keyboard.type('x = 1');
  const typed = await editorText(page);

  // Outside text (never copied in the editor), 6 lines / 120+ chars → above the paste limit.
  const outside = Array.from(
    { length: 6 },
    (_, i) => `print("line ${i} from somewhere else!!")`,
  ).join('\n');
  await page.evaluate((text) => {
    const target = document.querySelector('.monaco-editor textarea') as HTMLTextAreaElement;
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    target.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
    );
  }, outside);

  await expect(
    page.getByRole('heading', { level: 1, name: "Intervyu tugadi: tashqaridan kod qo'yildi" }),
  ).toBeVisible({ timeout: 30_000 });
  expect(await editorText(page).catch(() => typed)).not.toContain('somewhere else');
  const state = await interviewState(page, aid);
  expect(state.session.status).toBe('disqualified');
  expect(state.session.disqualification_reason).toBe('external_paste');
  expect(state.application_status).toBe('stage1_disqualified');

  // HR report: suspicion 100 and the paste mark on the timeline.
  const hrPage = await (await browser.newContext()).newPage();
  await login(hrPage.request, HR, 'hr login');
  await expect
    .poll(
      async () =>
        (
          await (
            await hrPage.request.get(`${API}/companies/${companyId}/applications/${aid}/stage1`)
          ).json()
        ).suspicion_percent,
      { timeout: 90_000 },
    )
    .toBe(100);
  await hrPage.goto(`/uz/hr/candidates/${aid}/stage1`);
  await expect(hrPage.getByRole('heading', { name: 'AI yordami shubhasi' })).toBeVisible();
  await expect(hrPage.getByText('Nomzod chetlatilgan')).toBeVisible();
  await expect(hrPage.getByText(/Tashqaridan katta matn qo'yilgan/).first()).toBeVisible();
  await expect(hrPage.locator('[data-marker="paste"]').first()).toBeVisible({ timeout: 30_000 });
});
