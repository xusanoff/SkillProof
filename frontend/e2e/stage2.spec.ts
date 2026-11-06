import { captureInterview } from './redesign-capture';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  API,
  makeInterviewVacancy,
  login,
  ok,
  submitStage1,
  waitForStage2,
} from './interview-setup';

/**
 * Phase 6, candidate Stage 2 (the oral AI interview) against the REAL stack (`make up`, mock LLM /
 * STT / TTS). Stage 1 is passed through the API (the browser flow is interview.spec.ts); then, in the
 * browser: intro (+ real microphone test in voice mode) → whole interview → end screen, with a reload
 * in the middle. Server state is checked through the API, never the database.
 */
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_DIRECT = process.env.API_DIRECT_URL || 'http://localhost:8000';
const HR = {
  email: process.env.DEMO_HR_EMAIL ?? 'demo.hr@example.com',
  password: process.env.DEMO_PASSWORD ?? 'Demo-parol-2026',
};
const CANDIDATE = {
  email: process.env.DEMO_CANDIDATE_EMAIL ?? 'demo.candidate@example.com',
  password: process.env.DEMO_PASSWORD ?? 'Demo-parol-2026',
};

// Fake microphone for the whole file (voice mode records from it; text mode ignores it).
test.use({
  permissions: ['microphone'],
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
});
test.describe.configure({ mode: 'serial', timeout: 300_000 });

let hr: APIRequestContext;
let companyId = '';
const vacancyIds: string[] = [];
const apps: Record<'text' | 'voice', string> = { text: '', voice: '' };

test.beforeAll(async ({ playwright }) => {
  test.setTimeout(420_000);
  hr = await playwright.request.newContext({ baseURL: BASE_URL });
  const me = await login(hr, HR, 'hr login');
  companyId = me.companies[0].id;
  const stamp = Date.now();
  const cand = await playwright.request.newContext({ baseURL: BASE_URL });
  await login(cand, CANDIDATE, 'candidate login');
  const modes = ['text', 'voice'] as const;
  for (const [n, mode] of modes.entries()) {
    const vid = await makeInterviewVacancy(hr, companyId, stamp, 20 + n, {
      mode,
      question_count: 3,
    });
    vacancyIds.push(vid);
    const app = await ok(
      await cand.post(`${API}/vacancies/${vid}/apply`, {
        data: { cover_note: 'E2E: 2-bosqich uchun ariza.' },
      }),
      'apply',
    );
    apps[mode] = app.id;
    await submitStage1(cand, app.id);
  }
  for (const mode of modes) await waitForStage2(cand, apps[mode]);
  await cand.dispose();
});

test.afterAll(async () => {
  const C = `${API}/companies/${companyId}`;
  for (const id of vacancyIds) {
    await hr.patch(`${C}/vacancies/${id}`, { data: { status: 'archived' } }).catch(() => {});
  }
  await hr.dispose();
});

const end = (page: Page) => page.getByRole('heading', { level: 1, name: 'Suhbat tugadi' });
const question = (page: Page) => page.locator('#q-h + p');

async function noSeriousA11y(page: Page) {
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual(
    [],
  );
}

async function stage2State(page: Page, aid: string) {
  const s = await ok(await page.request.get(`${API}/applications/${aid}/interview`), 'state');
  expect(s.stage2_session_id).toBeTruthy();
  return ok(
    await page.request.get(`${API}/interview-sessions/${s.stage2_session_id}/stage2`),
    's2',
  );
}

async function openIntro(page: Page, aid: string) {
  await login(page.request, CANDIDATE, 'login');
  await page.goto('/uz/candidate/applications');
  await expect(page.getByRole('link', { name: '2-bosqichni boshlash' }).first()).toBeVisible();
  await page.goto(`/uz/candidate/interview/${aid}`);
  await page.getByRole('button', { name: "2-bosqichga o'tish" }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: "2-bosqich: AI bilan og'zaki suhbat" }),
  ).toBeVisible();
}

/** Answers questions until the end screen; `reloadAfter` reloads once in the middle of a question. */
async function runInterview(
  page: Page,
  aid: string,
  mode: 'text' | 'voice',
  opts: { reloadAfter: number },
) {
  const box = page.getByRole('textbox', { name: 'Javobingiz' });
  const finish = page.getByRole('button', { name: 'Javobni tugatish' });
  let reloaded = false;
  let answered = 0;
  for (let i = 0; i < 20; i++) {
    const ready = mode === 'text' ? box : finish;
    await expect(end(page).or(ready)).toBeVisible({ timeout: 90_000 });
    if (await end(page).isVisible()) return answered;
    const q = (await question(page).textContent()) ?? '';
    expect(q.length).toBeGreaterThan(5);
    if (i === 0) {
      await noSeriousA11y(page);
      // The clocks start from the first question on, with no activity from the candidate.
      if (mode === 'text') {
        await expect
          .poll(async () => (await stage2State(page, aid)).current_turn.asked, { timeout: 8_000 })
          .toBe(true);
      }
    }

    if (answered === opts.reloadAfter && !reloaded) {
      reloaded = true;
      // The server knows the question was played (events are sent in batches every ~1.5 s).
      await expect
        .poll(async () => (await stage2State(page, aid)).current_turn.asked, { timeout: 20_000 })
        .toBe(true);
      if (mode === 'text') await box.fill('Yarim yozilgan javob');
      page.once('dialog', (d) => void d.accept());
      await page.reload();
      await expect(question(page)).toHaveText(q);
      const s2 = await stage2State(page, aid);
      expect(s2.current_turn.text).toBe(q);
      expect(s2.status).toBe('in_progress');
      if (mode === 'text') await expect(box).toHaveValue('Yarim yozilgan javob');
      else {
        // Reloaded voice question: nothing records by itself, replay is offered.
        await page.getByRole('button', { name: 'Javob berishni boshlash' }).click();
      }
    }

    if (mode === 'text') {
      await box.fill(
        `Javob ${answered + 1}: generator xotirani tejaydi, chunki qiymatlarni birma-bir beradi.`,
      );
      await page.getByRole('button', { name: 'Javobni yuborish' }).click();
    } else {
      await expect(finish).toBeEnabled({ timeout: 30_000 });
      await page
        .getByLabel('Sinov rejimi: nima deganingizni yozing')
        .fill(`Javob ${answered + 1}: generator xotirani tejaydi.`);
      await page.waitForTimeout(800);
      await finish.click();
    }
    answered += 1;
    await expect(end(page).or(question(page).filter({ hasNotText: q }))).toBeVisible({
      timeout: 90_000,
    });
  }
  throw new Error('the interview never ended');
}

async function expectFinished(page: Page, aid: string, answered: number) {
  await expect(end(page)).toBeVisible();
  await expect(page.getByText(/Baholash tugagach, natijalar/)).toBeVisible();
  await expect(page.getByText(/%/)).toHaveCount(0); // no score for the candidate
  const s2 = await stage2State(page, aid);
  expect(s2.status).toBe('completed');
  expect(s2.answered_count).toBeGreaterThanOrEqual(3);
  expect(answered).toBeGreaterThanOrEqual(3);
  const st = await ok(await page.request.get(`${API}/applications/${aid}/interview`), 'state');
  expect(st.stage2_status).toBe('completed');
  await page.goto('/uz/candidate/applications');
  // Until the worker has evaluated it, the entry stays; after that, the results link replaces it.
  await expect(
    page.getByRole('link', { name: /Og'zaki suhbatni ochish|Natijalarim/ }).first(),
  ).toBeVisible();
}

test('text mode: intro, whole interview, reload mid-question, end screen', async ({ page }) => {
  const aid = apps.text;
  await openIntro(page, aid);
  await noSeriousA11y(page);
  await page.getByRole('button', { name: /matn bilan davom etish/ }).click();
  await expect(page.getByRole('textbox', { name: 'Javobingiz' })).toBeVisible({ timeout: 60_000 });
  await captureInterview(page, 'stage2-text');
  // Compact room: the site chrome is gone while the interview runs.
  await expect(page.locator('[data-site-chrome]').first()).toBeHidden();
  await expect(page.getByText(/nusxa qo.yish o.chirilgan/)).toBeVisible();

  // Paste is blocked.
  await page.getByRole('textbox', { name: 'Javobingiz' }).focus();
  await page.evaluate(() => {
    const ta = document.querySelector('textarea') as HTMLTextAreaElement;
    const data = new DataTransfer();
    data.setData('text/plain', 'tashqaridan');
    ta.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  });
  await expect(page.getByRole('textbox', { name: 'Javobingiz' })).toHaveValue('');

  const answered = await runInterview(page, aid, 'text', { reloadAfter: 1 });
  await expectFinished(page, aid, answered);

  // The worker evaluates the session and writes the report; the candidate then reads it (Phase 7).
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`/api/api/v1/applications/${aid}/results`)).json()).state,
      { timeout: 90_000, intervals: [3_000] },
    )
    .toBe('done');
  const results = await (await page.request.get(`/api/api/v1/applications/${aid}/results`)).json();
  expect(results.status).toBe('evaluated');
  expect(results.overall_score).not.toBeNull();
  await page.goto(`/candidate/applications/${aid}/results`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await noSeriousA11y(page);
  await expect(page.getByText(/shubha|suspicion/i)).toHaveCount(0);
});

test.describe('voice mode', () => {
  test('microphone test, whole interview with transcript hints, reload, proxy limits', async ({
    page,
  }) => {
    const aid = apps.voice;
    await openIntro(page, aid);
    await expect(page.getByText('Ovozingiz yoziladi va saqlanadi')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Suhbatni boshlash' })).toBeDisabled();
    await page.getByRole('button', { name: '4 soniya yozish' }).click();
    await expect(page.getByText(/Mikrofon ishlayapti|Yozuvda ovoz deyarli/)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByLabel('Test yozuvi')).toBeVisible();
    await noSeriousA11y(page);
    await page.getByRole('button', { name: 'Suhbatni boshlash' }).click();
    await expect(page.getByRole('button', { name: 'Javobni tugatish' })).toBeVisible({
      timeout: 60_000,
    });

    await captureInterview(page, 'stage2-voice');
    // The proxy: question audio comes back byte for byte, big uploads reach the API.
    const s2 = await stage2State(page, aid);
    const turn = s2.current_turn;
    const path = `/interview-sessions/${s2.id}/stage2/turns/${turn.id}`;
    if (turn.has_audio) {
      const viaProxy = await page.request.get(`${API}${path}/question-audio`);
      expect(viaProxy.ok()).toBe(true);
      const cookies = (await page.context().cookies())
        .map((c) => `${c.name}=${c.value}`)
        .join('; ');
      const direct = await page.request.get(`${API_DIRECT}/api/v1${path}/question-audio`, {
        headers: { cookie: cookies },
      });
      expect(direct.ok()).toBe(true);
      expect((await viaProxy.body()).equals(await direct.body())).toBe(true);
    }
    const upload = (bytes: number) =>
      page.request.post(`${API}${path}/answer`, {
        multipart: {
          audio: { name: 'a.webm', mimeType: 'audio/webm', buffer: Buffer.alloc(bytes, 7) },
        },
      });
    const big = await upload(14 * 1024 * 1024); // below audio_max_bytes: reaches the API, not a webm
    expect(big.status(), await big.text()).toBe(422);
    expect((await big.json()).error.code).toBe('invalid_audio');
    const huge = await upload(16 * 1024 * 1024); // above audio_max_bytes: the API says so
    expect(huge.status(), await huge.text()).toBe(413);
    expect((await huge.json()).error.code).toBe('audio_too_large');

    const answered = await runInterview(page, aid, 'voice', { reloadAfter: 1 });
    await expectFinished(page, aid, answered);
  });
});
