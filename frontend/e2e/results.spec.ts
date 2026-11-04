import { expect, test, type Page } from '@playwright/test';
import { envelope, expectNoSeriousA11y, me, mockApi, type MockRoute } from './utils';

/**
 * Phase 7 with the API mocked in the browser: HR ranking → report → override → note, and the
 * candidate's results page. Axe on both pages and a phone-width check.
 */
const CID = 'c-1';
const HR_USER = me({
  role: 'hr',
  full_name: 'Hilola HR',
  companies: [{ id: CID, name: 'Najot Soft', slug: 'najot-soft', member_role: 'owner' }],
});

const application = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  status: 'evaluated',
  cover_note: null,
  created_at: '2026-10-29T09:00:00Z',
  updated_at: '2026-10-29T09:00:00Z',
  vacancy: { id: 'v-1', title: 'Python backend dasturchi' },
  candidate: {
    user_id: `u-${id}`,
    full_name: name,
    email: `${id}@example.com`,
    headline: null,
    country: 'UZ',
    city: 'Toshkent',
    experience_years: 3,
    desired_salary_min: null,
    desired_salary_max: null,
    currency: 'UZS',
    has_resume: false,
  },
  final_score: 72,
  stage1_score: 80,
  stage2_score: null,
  recommendation: 'maybe',
  needs_review: false,
  report_state: 'done',
  suspicion_percent: 42,
  suspicion_label: 'medium',
  ...over,
});

const report = (over: Record<string, unknown> = {}) => ({
  application_id: 'a-1',
  candidate_name: 'Aziza Karimova',
  vacancy_title: 'Python backend dasturchi',
  status: 'evaluated',
  state: 'done',
  needs_review: false,
  stage1_score: 80,
  stage2_score: 60,
  overall_score: 72,
  per_skill: [
    {
      skill_id: 's-1',
      name: 'Python',
      percent: 75,
      stage1_percent: 80,
      stage2_percent: null,
      reused: [],
    },
  ],
  reused_skills: [],
  summary: 'Kod toza, lekin xotira haqida tushuncha sust.',
  strengths: [
    {
      text: 'Aniq nomlar',
      ref: 'task_1',
      quote: '',
      lines: [1],
      excerpt: 'def total(a, b):\n    return a + b',
    },
  ],
  gaps: [
    {
      text: 'Generator nima ekanini tushuntirmadi',
      ref: 'turn_1',
      quote: 'Bilmayman',
      lines: [],
      excerpt: '',
    },
  ],
  recommendation: 'maybe',
  suspicion_percent: 42,
  suspicion_label: 'medium',
  disqualification_reason: null,
  reasons: [
    {
      stage: 'stage1',
      type: 'paste_external',
      severity: 'high',
      at_ms: 252000,
      evidence: { lines: 10, chars: 300 },
    },
  ],
  signals: [],
  stage2: {
    session_id: 'ss-1',
    status: 'completed',
    mode: 'text',
    evaluation_state: 'done',
    disqualification_reason: null,
    pass_threshold: 50,
    passed: true,
    turns: [
      {
        id: 'tt-1',
        order: 1,
        kind: 'concept',
        is_follow_up: false,
        question_text: 'Generator nima?',
        transcript: 'Bu xotirani tejaydi.',
        answer_source: 'text',
        has_answer_audio: true,
        response_latency_ms: 2000,
        silence_ms: 0,
        flags: {},
        percent: 55,
        needs_review: false,
        criteria: [{ key: 'accuracy', score: 55, rationale: 'Qisman', quote: 'tejaydi' }],
        rationale: '',
        confidence: 0.7,
        model: 'mock',
        prompt_version: 'v1',
      },
    ],
  },
  overrides: [],
  model: 'mock',
  prompt_version: 'report_writer.v1',
  ...over,
});

async function hrRoutes(page: Page, extra: MockRoute[] = []) {
  await mockApi(page, [
    { method: 'GET', path: '/auth/me', body: HR_USER },
    {
      method: 'GET',
      path: `/companies/${CID}/vacancies`,
      body: { items: [], total: 0, page: 1, page_size: 50 },
    },
    {
      method: 'GET',
      path: `/companies/${CID}/applications/a-1/stage1`,
      status: 404,
      body: envelope('not_found'),
    },
    { method: 'GET', path: `/companies/${CID}/applications/a-1/notes`, body: [] },
    ...extra,
  ]);
}

test('HR: ranking → report → override → note', async ({ page }) => {
  let overridden = false;
  const notes: unknown[] = [];
  let override: unknown = null;
  let note: unknown = null;
  let tab = '';
  await hrRoutes(page, [
    {
      method: 'GET',
      path: `/companies/${CID}/applications`,
      get body() {
        return {
          items: [
            application('a-1', 'Aziza Karimova', { final_score: overridden ? 90 : 72 }),
            application('a-2', 'Bobur Aliyev', {
              final_score: null,
              stage1_score: null,
              recommendation: null,
              report_state: 'pending',
              suspicion_percent: null,
              suspicion_label: null,
            }),
          ],
          total: 2,
          page: 1,
          page_size: 20,
        };
      },
    },
    {
      method: 'GET',
      path: `/companies/${CID}/applications/a-1/report`,
      get body() {
        return overridden
          ? report({
              overall_score: 90,
              overrides: [
                {
                  id: 'o-1',
                  field: 'overall_score',
                  old_value: '72',
                  new_value: '90',
                  comment: 'Intervyu yaxshi o‘tdi',
                  actor_name: 'Hilola HR',
                  created_at: '2026-11-03T10:00:00Z',
                },
              ],
            })
          : report();
      },
    },
    {
      method: 'POST',
      path: `/companies/${CID}/applications/a-1/overrides`,
      get body() {
        return report({
          overall_score: 90,
          overrides: [
            {
              id: 'o-1',
              field: 'overall_score',
              old_value: '72',
              new_value: '90',
              comment: 'Intervyu yaxshi o‘tdi',
              actor_name: 'Hilola HR',
              created_at: '2026-11-03T10:00:00Z',
            },
          ],
        });
      },
      onRequest: (b) => {
        override = b;
        overridden = true;
      },
    },
    {
      method: 'GET',
      path: `/companies/${CID}/applications/a-1/notes`,
      get body() {
        return notes;
      },
    } as MockRoute,
    {
      method: 'POST',
      path: `/companies/${CID}/applications/a-1/notes`,
      status: 201,
      body: {
        id: 'n-1',
        text: 'Qayta suhbat kerak',
        author_name: 'Hilola HR',
        created_at: '2026-11-03T10:00:00Z',
      },
      onRequest: (b) => {
        note = b;
        notes.unshift({
          id: 'n-1',
          text: 'Qayta suhbat kerak',
          author_name: 'Hilola HR',
          created_at: '2026-11-03T10:00:00Z',
        });
      },
    },
  ]);
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.pathname.endsWith(`/companies/${CID}/applications`)) tab = u.search;
  });

  await page.goto('/uz/hr/candidates?tab=ranked&min=50');
  await expect(page.getByRole('heading', { level: 1, name: 'Nomzodlar' })).toBeVisible();
  const row = page.getByRole('article', { name: 'Aziza Karimova' });
  await expect(row).toContainText('72%');
  await expect(row).toContainText('80%');
  // The candidate without scores shows dashes, not 0.
  await expect(page.getByRole('article', { name: 'Bobur Aliyev' })).not.toContainText('0%');
  expect(tab).toContain('sort=score');
  expect(tab).toContain('min_score=50');
  await expectNoSeriousA11y(page);

  await row.getByRole('link', { name: 'Aziza Karimova' }).click();
  await expect(page).toHaveURL(/\/uz\/hr\/candidates\/a-1$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Aziza Karimova' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'AI yordami shubhasi' })).toContainText('42%');
  await expect(page.getByRole('region', { name: 'AI yordami shubhasi' })).toContainText('04:12');
  await expectNoSeriousA11y(page);

  // Phone width: no sideways scroll on the page.
  await page.setViewportSize({ width: 360, height: 800 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.getByRole('button', { name: "Natijani o'zgartirish" }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel("Nimani o'zgartirasiz").selectOption('overall_score');
  await dialog.getByLabel('Izoh').fill('ok');
  await dialog.getByRole('button', { name: "O'zgartirishni saqlash" }).click();
  await expect(dialog.getByText('Qiymat kiriting.')).toBeVisible();
  await expect(dialog.getByText('Kamida 3 ta belgi yozing.')).toBeVisible();
  await dialog.getByLabel('Yangi ball, %').fill('90');
  await dialog.getByLabel('Izoh').fill('Intervyu yaxshi o‘tdi');
  await dialog.getByRole('button', { name: "O'zgartirishni saqlash" }).click();
  await expect(dialog).toBeHidden();
  expect(override).toEqual({ field: 'overall_score', value: 90, comment: 'Intervyu yaxshi o‘tdi' });
  await expect(page.getByText('72% → 90%')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Ballar' })).toContainText('90%');

  await page.getByLabel('Yangi eslatma').fill('Qayta suhbat kerak');
  await page.getByRole('button', { name: "Eslatma qo'shish" }).click();
  await expect(page.getByText('Qayta suhbat kerak', { exact: true })).toBeVisible();
  expect(note).toEqual({ text: 'Qayta suhbat kerak' });
});

test('HR: a report still being written shows "evaluating"', async ({ page }) => {
  await hrRoutes(page, [
    {
      method: 'GET',
      path: `/companies/${CID}/applications/a-1/report`,
      body: report({ state: 'pending', overall_score: null, summary: '', recommendation: null }),
    },
  ]);
  await page.goto('/uz/hr/candidates/a-1');
  await expect(page.getByText('Baholanmoqda', { exact: true })).toBeVisible();
});

const results = (over: Record<string, unknown> = {}) => ({
  application_id: 'a-1',
  vacancy_title: 'Python backend dasturchi',
  status: 'evaluated',
  state: 'done',
  disqualification_reason: null,
  stage1_score: 80,
  stage2_score: 60,
  overall_score: 72,
  per_skill: [{ name: 'Python', percent: 75, reused: false }],
  tasks: [
    {
      title: 'Ikki son yig‘indisi',
      hidden_passed: 3,
      hidden_total: 5,
      code_review_percent: 70,
      strengths: ['Aniq nomlar'],
      weaknesses: ['Xatolar tekshirilmagan'],
    },
  ],
  answers: [{ order: 1, question_text: 'Generator nima?', percent: 55 }],
  mistakes: [{ text: 'Bo‘sh kiritish hisobga olinmagan.', about: 'Ikki son yig‘indisi' }],
  learn_next: [{ topic: 'Generatorlar', reason: 'Xotirani tejash uchun foydali.' }],
  ...over,
});

test('candidate: applications list → results page (no suspicion), phone width', async ({
  page,
}) => {
  await mockApi(page, [
    { method: 'GET', path: '/auth/me', body: me() },
    {
      method: 'GET',
      path: '/candidate/applications',
      body: {
        items: [
          {
            id: 'a-1',
            status: 'evaluated',
            cover_note: null,
            created_at: '2026-10-29T09:00:00Z',
            updated_at: '2026-10-29T09:00:00Z',
            vacancy: {
              id: 'v-1',
              title: 'Python backend dasturchi',
              company: { id: 'c-1', name: 'Najot Soft', slug: 'najot-soft', logo_url: null },
              salary_min: null,
              salary_max: null,
              currency: 'UZS',
            },
          },
        ],
        total: 1,
        page: 1,
        page_size: 20,
      },
    },
    { method: 'GET', path: '/applications/a-1/results', body: results() },
  ]);
  await page.goto('/uz/candidate/applications');
  await page.getByRole('link', { name: 'Natijalarim' }).click();
  await expect(page).toHaveURL(/\/uz\/candidate\/applications\/a-1\/results$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Mening natijalarim' })).toBeVisible();
  await expect(page.getByText('Generatorlar')).toBeVisible();
  await expect(page.getByText('Bo‘sh kiritish hisobga olinmagan.')).toBeVisible();
  await expect(page.locator('main')).not.toContainText(/shubha/i);
  await expectNoSeriousA11y(page);

  await page.setViewportSize({ width: 360, height: 800 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('candidate: a disqualified application shows only neutral wording', async ({ page }) => {
  await mockApi(page, [
    { method: 'GET', path: '/auth/me', body: me() },
    {
      method: 'GET',
      path: '/applications/a-1/results',
      body: results({
        status: 'stage1_disqualified',
        disqualification_reason: 'inactivity',
        overall_score: null,
        stage1_score: null,
        stage2_score: null,
        per_skill: [],
        tasks: [],
        answers: [],
        mistakes: [],
        learn_next: [],
      }),
    },
  ]);
  await page.goto('/uz/candidate/applications/a-1/results');
  await expect(page.getByText('Suhbat erta tugadi')).toBeVisible();
  await expect(page.getByText(/ruxsat etgan vaqtdan uzoq faollik bo'lmadi/)).toBeVisible();
  await expect(page.locator('main')).not.toContainText(/shubha/i);
});
