import { expect, type APIRequestContext, type APIResponse } from '@playwright/test';

export const API = '/api/api/v1';

export async function ok(res: APIResponse, what: string) {
  expect(res.ok(), `${what}: ${res.status()} ${await res.text()}`).toBe(true);
  return res.status() === 204 ? null : res.json();
}

/** The login limit is 10 a minute and a live run gets near it: wait instead of failing on `429`. */
export async function login(
  req: APIRequestContext,
  data: { email: string; password: string },
  what = 'login',
) {
  let res = await req.post(`${API}/auth/login`, { data });
  for (let i = 0; i < 5 && res.status() === 429; i++) {
    await new Promise((r) => setTimeout(r, 15_000));
    res = await req.post(`${API}/auth/login`, { data });
  }
  return ok(res, what);
}

/** HR (API): vacancy + real python task + 8 AI questions + ready assessment, published. */
export async function makeInterviewVacancy(
  request: APIRequestContext,
  companyId: string,
  stamp: number,
  n: number,
  stage2?: { mode: 'voice' | 'text'; question_count?: number },
) {
  const C = `${API}/companies/${companyId}`;
  const v = await ok(
    await request.post(`${C}/vacancies`, {
      data: {
        title: `E2E interview ${n} ${stamp}`,
        profession_area: 'it',
        region_code: 'UZ-TK',
        remote_type: 'office',
        employment_type: 'full_time',
        experience_level: 'between_1_3',
        description: 'E2E interview vacancy',
        skills: [],
      },
    }),
    'vacancy',
  );
  const task = await ok(
    await request.post(`${C}/tasks`, {
      data: {
        task_type: 'coding',
        difficulty: 1,
        language: 'uz',
        title: 'Ikki son yig‘indisi',
        statement: 'Bir qatorda ikkita butun son beriladi. Ularning yig‘indisini chiqaring.',
        allowed_languages: ['python', 'javascript'],
        starter_code: {
          python: '# kodni shu yerga yozing\n',
          javascript: '// kodni shu yerga yozing\n',
        },
        visible_tests: [
          { name: '1', input: '2 3\n', output: '5' },
          { name: '2', input: '10 -4\n', output: '6' },
        ],
        hidden_tests: [
          { name: 'h1', input: '0 0\n', output: '0' },
          { name: 'h2', input: '100 200\n', output: '300' },
        ],
        time_limit_minutes: 30,
        cpu_time_limit_s: 2,
        memory_limit_mb: 256,
        rubric: {
          criteria: [
            { key: 'correctness', name: 'To‘g‘rilik', description: '', max_points: 5, levels: {} },
          ],
        },
        reference_solution: {
          language: 'python',
          code: 'a, b = map(int, input().split())\nprint(a + b)\n',
        },
      },
    }),
    'task',
  );
  await ok(
    await request.post(`${C}/tasks/${task.id}/approve`, { data: { approved: true } }),
    'approve task',
  );
  await ok(
    await request.put(`${C}/vacancies/${v.id}/assessment`, {
      data: {
        language: 'uz',
        stage1_config: { task_ids: [task.id] },
        ...(stage2 ? { stage2_config: { adaptive: true, ...stage2 } } : {}),
        auto_approve_ai_items: true,
        question_mode: 'ai_generated',
      },
    }),
    'assessment',
  );
  const job = await ok(
    await request.post(`${C}/vacancies/${v.id}/assessment/generate`, {
      data: { question_count: 8, task_count: 0 },
    }),
    'generate',
  );
  for (let i = 0; i < 60; i++) {
    const j = await ok(await request.get(`${C}/generation-jobs/${job.id}`), 'job');
    if (j.status === 'succeeded') break;
    expect(j.status).not.toBe('failed');
    await new Promise((r) => setTimeout(r, 2000));
  }
  const a = await ok(await request.get(`${C}/vacancies/${v.id}/assessment`), 'assessment get');
  expect(a.ready, JSON.stringify(a.issues)).toBe(true);
  await ok(
    await request.patch(`${C}/vacancies/${v.id}`, { data: { status: 'published' } }),
    'publish',
  );
  return v.id as string;
}

/**
 * Candidate (API): accept the rules, take Stage 1 with the correct solution, submit. The browser
 * flow of Stage 1 is covered by interview.spec.ts; Stage 2 specs only need a passed Stage 1.
 */
export async function submitStage1(request: APIRequestContext, applicationId: string) {
  const state = await ok(
    await request.get(`${API}/applications/${applicationId}/interview`),
    'state',
  );
  await ok(
    await request.post(`${API}/applications/${applicationId}/interview/rules`, {
      data: { rules_version: state.rules_version },
    }),
    'rules',
  );
  const session = await ok(
    await request.post(`${API}/applications/${applicationId}/interview/stage1`),
    'stage1 start',
  );
  const task = session.tasks[0];
  await ok(
    await request.post(`${API}/interview-sessions/${session.id}/tasks/${task.id}/submit`, {
      data: { language: 'python', code: 'a, b = map(int, input().split())\nprint(a + b)\n' },
    }),
    'stage1 submit',
  );
}

/** The worker scores Stage 1 on a sweep (about every 15 s): wait until Stage 2 can start. */
export async function waitForStage2(request: APIRequestContext, applicationId: string) {
  for (let i = 0; i < 40; i++) {
    const s = await ok(
      await request.get(`${API}/applications/${applicationId}/interview`),
      'state',
    );
    if (s.stage2_available) return;
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`Stage 2 never became available for ${applicationId}`);
}
