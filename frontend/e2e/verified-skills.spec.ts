import { expect, test } from '@playwright/test';
import { envelope, expectNoSeriousA11y, me, mockApi, settle } from './utils';

/**
 * Phase 8 with the API mocked in the browser: the reuse choice, Stage 1 and Stage 2 fully covered,
 * the candidate's public switch, the public profile (and its 404), and HR talent search.
 */
const SKILL = 'a3f2b8c1-1111-4222-8333-444455556666';
const CID = 'c-1';
const HR_USER = me({
  role: 'hr',
  full_name: 'Hilola HR',
  companies: [{ id: CID, name: 'Najot Soft', slug: 'najot-soft', member_role: 'owner' }],
});

const offer = {
  skills: [
    {
      skill_id: SKILL,
      name: 'Python',
      score: 88,
      level: 'advanced',
      valid_until: '2027-05-01T10:00:00Z',
      tasks_skipped: 2,
      questions_skipped: 3,
    },
  ],
  tasks_total: 2,
  tasks_skipped: 2,
  questions_total: 3,
  questions_skipped: 3,
};

const interviewState = (over: Record<string, unknown> = {}) => ({
  application_id: 'a-1',
  application_status: 'interview_pending',
  vacancy_id: 'v-1',
  vacancy_title: 'Python backend dasturchi',
  language: 'uz',
  rules_version: '2026-11',
  rules_accepted: false,
  blocked_reason: null,
  warmup: null,
  session: null,
  stage2_available: false,
  reuse: offer,
  ...over,
});

const doneSession = {
  id: 's-1',
  status: 'completed',
  tasks: [],
  result: { state: 'done', score_percent: 88, pass_threshold: 70, passed: true, tasks: [] },
};

test('fully covered: reuse choice is sent, Stage 1 and Stage 2 end without editor or microphone', async ({
  page,
}) => {
  let rules = false;
  let started = false;
  let stage1Body: unknown = 'not sent';
  let stage2Started = false;
  const state = () =>
    interviewState(
      started
        ? {
            rules_accepted: true,
            reuse: null,
            session: doneSession,
            application_status: 'stage2_pending',
            stage2_available: true,
            stage2_mode: 'voice',
            ...(stage2Started ? { stage2_session_id: 's2-1' } : {}),
          }
        : { rules_accepted: rules },
    );
  await mockApi(page, [{ method: 'GET', path: '/auth/me', body: me() }]);
  // Dynamic bodies: answer from the current state.
  await page.route('**/api/api/v1/applications/a-1/interview', (r) => r.fulfill({ json: state() }));
  await page.route('**/api/api/v1/applications/a-1/interview/rules', (r) => {
    rules = true;
    return r.fulfill({ json: state() });
  });
  await page.route('**/api/api/v1/applications/a-1/interview/stage1', (r) => {
    stage1Body = r.request().postDataJSON();
    started = true;
    return r.fulfill({ json: doneSession });
  });
  await page.route('**/api/api/v1/applications/a-1/interview/stage2/start', (r) => {
    stage2Started = true;
    return r.fulfill({
      json: {
        id: 's2-1',
        status: 'completed',
        mode: 'voice',
        current_turn: null,
        question_count: 3,
        answered_count: 0,
      },
    });
  });
  await page.route('**/api/api/v1/interview-sessions/s2-1/stage2', (r) =>
    r.fulfill({
      json: {
        id: 's2-1',
        status: 'completed',
        mode: 'voice',
        current_turn: null,
        question_count: 3,
        answered_count: 0,
      },
    }),
  );

  await page.goto('/uz/candidate/interview/a-1');
  await expect(
    page.getByRole('heading', { name: "Tasdiqlangan ko'nikmalardan foydalanish" }),
  ).toBeVisible();
  await expect(page.getByText('Python', { exact: true })).toBeVisible();
  await expect(page.getByText(/2 ta topshiriqdan 2 tasi, 3 ta savoldan 3 tasi/)).toBeVisible();
  await expect(page.getByRole('switch')).toBeChecked();
  await expect(page.getByText(/uni o'zgartirib bo'lmaydi/)).toBeVisible();
  await settle(page);
  await expectNoSeriousA11y(page);

  await page.getByRole('checkbox', { name: "Qoidalarni o'qidim va qabul qilaman" }).check();
  await page.getByRole('button', { name: 'Davom etish' }).click();

  // Covered: no system check, no warm-up, no editor.
  await expect(page.getByText(/1-bosqichdagi barcha topshiriqlarni qoplaydi/)).toBeVisible();
  await expect(page.getByText('Tizim tekshiruvi')).toBeHidden();
  await page.getByRole('button', { name: '1-bosqichni boshlash' }).click();
  expect(stage1Body).toEqual({ reuse: true });

  await expect(page.getByRole('heading', { name: '1-bosqich tugadi' })).toBeVisible();
  await expect(page.getByText(/tasdiqlangan ko'nikmalaringiz bilan qoplangan/)).toBeVisible();
  await page.getByRole('button', { name: "2-bosqichga o'tish" }).click();

  // Stage 2 covered: no microphone test.
  await expect(page.getByText('Mikrofonni tekshirish')).toBeHidden();
  await page.getByRole('button', { name: 'Suhbatni yakunlash' }).click();
  await expect(page.getByRole('heading', { name: 'Suhbat tugadi' })).toBeVisible();
  await expectNoSeriousA11y(page);
});

test('switching reuse off keeps the full path (system check comes next)', async ({ page }) => {
  await mockApi(page, [
    { method: 'GET', path: '/auth/me', body: me() },
    { method: 'GET', path: '/applications/a-1/interview', body: interviewState() },
    {
      method: 'POST',
      path: '/applications/a-1/interview/rules',
      body: interviewState({ rules_accepted: true }),
    },
  ]);
  await page.goto('/uz/candidate/interview/a-1');
  await page.getByRole('switch').click();
  await expect(page.getByText(/barcha topshiriq va savollarni topshirasiz/)).toBeVisible();
  await page.getByRole('checkbox', { name: "Qoidalarni o'qidim va qabul qilaman" }).check();
  await page.getByRole('button', { name: 'Davom etish' }).click();
  await expect(page.getByRole('heading', { name: 'Tizim tekshiruvi' })).toBeVisible();
});

const skillRow = (over: Record<string, unknown> = {}) => ({
  id: 'v-1',
  skill_id: SKILL,
  name: 'Python',
  score: 88,
  level: 'advanced',
  verified_at: '2026-05-01T10:00:00Z',
  valid_until: '2027-05-01T10:00:00Z',
  is_public: false,
  is_valid: true,
  ...over,
});

test('candidate: the public switch, the profile link, phone width', async ({ page }) => {
  let row = skillRow();
  let sent: unknown = null;
  await mockApi(page, [{ method: 'GET', path: '/auth/me', body: me() }]);
  await page.route('**/api/api/v1/candidate/verified-skills', (r) =>
    r.fulfill({ json: [row, skillRow({ id: 'v-2', name: 'SQL', is_valid: false })] }),
  );
  await page.route('**/api/api/v1/candidate/verified-skills/v-1', (r) => {
    sent = r.request().postDataJSON();
    row = skillRow({ is_public: true });
    return r.fulfill({ json: row });
  });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/uz/candidate/skills');
  await expect(
    page.getByRole('heading', { level: 1, name: "Tasdiqlangan ko'nikmalar" }),
  ).toBeVisible();
  await expect(page.getByText(/\d{2}\.\d{2}\.\d{4} da muddati tugagan/)).toBeVisible();
  await expect(page.getByRole('link', { name: /Ommaviy profilni ochish/ })).toBeHidden();
  await page.getByRole('switch').first().click();
  await expect(page.getByRole('link', { name: /Ommaviy profilni ochish/ })).toHaveAttribute(
    'href',
    '/uz/profiles/u-1',
  );
  expect(sent).toEqual({ is_public: true });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
  await expectNoSeriousA11y(page);
});

const PROFILE_ID = '3f2b8c1e-1111-4222-8333-444455556666';
const profile = {
  candidate_id: PROFILE_ID,
  full_name: 'Aziza Karimova',
  headline: 'Python dasturchi',
  country: 'UZ',
  city: 'Toshkent',
  experience_years: 4,
  skills: [
    {
      skill_id: SKILL,
      name: 'Python',
      score: 88,
      level: 'advanced',
      verified_at: '2026-05-01T10:00:00Z',
      valid_until: '2027-05-01T10:00:00Z',
    },
  ],
};

test('public profile: no login, noindex; 404 is the not-found page', async ({ page }) => {
  await mockApi(page, [
    { method: 'GET', path: `/profiles/${PROFILE_ID}`, body: profile },
    {
      method: 'GET',
      path: '/profiles/00000000-0000-4000-8000-000000000000',
      status: 404,
      body: envelope('not_found'),
    },
  ]);
  await page.goto(`/uz/profiles/${PROFILE_ID}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Aziza Karimova' })).toBeVisible();
  await expect(page.getByText('Python dasturchi')).toBeVisible();
  await expect(page.getByText('Toshkent, UZ')).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expectNoSeriousA11y(page);

  await page.goto('/uz/profiles/00000000-0000-4000-8000-000000000000');
  await expect(page.getByText('404', { exact: true })).toBeVisible();
});

for (const size of [
  { name: 'phone 360px', width: 360, height: 800 },
  { name: 'desktop', width: 1440, height: 900 },
]) {
  test(`HR talent search: filters in the URL, results, empty states (${size.name})`, async ({
    page,
  }) => {
    let query = '';
    await mockApi(page, [
      { method: 'GET', path: '/auth/me', body: HR_USER },
      {
        method: 'GET',
        path: '/skills',
        body: [{ id: SKILL, slug: 'python', name: 'Python', category: 'language' }],
      },
    ]);
    await page.route(`**/api/api/v1/companies/${CID}/talent**`, (r) => {
      query = new URL(r.request().url()).search;
      const none = query.includes('min_score=99');
      return r.fulfill({
        json: {
          items: none ? [] : [profile],
          total: none ? 0 : 1,
          page: 1,
          page_size: 12,
        },
      });
    });
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/uz/hr/talent');
    await expect(page.getByText("Boshlash uchun ko'nikmalarni tanlang")).toBeVisible();

    await page.getByPlaceholder("Ko'nikma qo'shish").fill('pyth');
    await page.getByRole('option', { name: /Python/ }).click();
    await expect(page).toHaveURL(new RegExp(`skill=${SKILL}`));
    await expect(page.getByRole('heading', { name: 'Aziza Karimova' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Profilni ochish/ })).toHaveAttribute(
      'href',
      `/uz/profiles/${PROFILE_ID}`,
    );
    expect(query).toContain(`skill_id=${SKILL}`);

    await page.getByLabel('Min. ball, %').fill('99');
    await page.getByLabel('Min. ball, %').blur();
    await expect(page).toHaveURL(/min=99/);
    await expect(page.getByText('Nomzod topilmadi')).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
    await expectNoSeriousA11y(page);
  });
}
