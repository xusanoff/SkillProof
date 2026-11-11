import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { API, server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { nav, resetNav } from '@/test/navigation-mock';
import { VacancyWizard } from './vacancy-wizard';
vi.mock(
  '@/i18n/navigation',
  async () => (await import('@/test/navigation-mock')).i18nNavigationMock,
);
const base = `${API}/api/v1/companies/c1`;
const meta = {
  company_id: 'c1',
  is_global: false,
  is_approved: true,
  verification_status: 'passed',
  source: 'manual',
  skill_id: null,
  difficulty: 3,
  language: 'uz',
  created_at: '2026-11-09T00:00:00Z',
  updated_at: '2026-11-09T00:00:00Z',
  verification_report: {},
};
function setup() {
  const create = vi.fn(),
    publish = vi.fn(),
    saved = vi.fn();
  const questions = [
    {
      ...meta,
      id: 'q1',
      type: 'open',
      text: 'HTTP nima?',
      options: null,
      correct_answer: null,
      rubric: {},
      reference_answer: 'Protocol',
    },
  ];
  server.use(
    http.get(`${API}/api/v1/regions`, () => HttpResponse.json([])),
    http.get(`${API}/api/v1/profession-areas`, () =>
      HttpResponse.json([{ slug: 'it', names: { uz: 'IT' } }]),
    ),
    http.get(`${API}/api/v1/skills`, () => HttpResponse.json([])),
    http.post(`${base}/vacancies`, async ({ request }) => {
      create(await request.json());
      return HttpResponse.json({ id: 'v1' }, { status: 201 });
    }),
    http.patch(`${base}/vacancies/v1`, async ({ request }) => {
      publish(await request.json());
      return HttpResponse.json({ id: 'v1' });
    }),
    http.get(`${base}/vacancies/v1/assessment`, () =>
      HttpResponse.json({ error: { code: 'not_found', message: 'not found' } }, { status: 404 }),
    ),
    http.get(`${base}/tasks`, () =>
      HttpResponse.json({
        items: [{ ...meta, id: 't1', title: 'Coding task', task_type: 'coding' }],
        total: 1,
        page: 1,
        page_size: 100,
      }),
    ),
    http.get(`${base}/questions`, () =>
      HttpResponse.json({ items: questions, total: questions.length, page: 1, page_size: 20 }),
    ),
    http.put(`${base}/vacancies/v1/assessment`, async ({ request }) => {
      const body = (await request.json()) as {
        questions: { question_id: string }[];
        stage1_config: { task_ids: string[] };
      };
      saved(body);
      return HttpResponse.json({
        ...body,
        id: 'a1',
        vacancy_id: 'v1',
        tasks: body.stage1_config.task_ids.map((id) => ({ ...meta, id, title: 'Coding task' })),
        questions: body.questions.map((q) => questions.find((x) => x.id === q.question_id)),
        mandatory_question_ids: [],
        effective_thresholds: {},
        issues: [],
        ready: body.questions.length > 0 && body.stage1_config.task_ids.length > 0,
        updated_at: '2026-11-09T00:00:00Z',
      });
    }),
    http.post(`${base}/questions`, async ({ request }) => {
      const body = (await request.json()) as object;
      const q = { ...meta, ...body, id: 'q2' } as (typeof questions)[number];
      questions.push(q);
      return HttpResponse.json(q, { status: 201 });
    }),
  );
  renderWithProviders(<VacancyWizard companyId="c1" />);
  return { create, publish, saved };
}
async function firstTwo() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Lavozim nomi'), 'Backend developer');
  await user.type(screen.getByLabelText('Vakansiya tavsifi'), 'Build reliable APIs.');
  await user.click(screen.getByRole('button', { name: 'Keyingi bosqich' }));
  await screen.findByLabelText('Baholash tili');
  await user.type(screen.getByLabelText(/^Savollar soni/), '1');
  await user.click(screen.getByRole('button', { name: 'Keyingi bosqich' }));
  await screen.findByLabelText('Bankdan savol');
  return user;
}
beforeEach(() => resetNav());
describe('three-step vacancy creation', () => {
  it('keeps the vacancy a draft until configuration and selected bank content are saved', async () => {
    const { create, publish, saved } = setup();
    const user = await firstTwo();
    expect(create).toHaveBeenCalledTimes(1);
    expect(publish).not.toHaveBeenCalled();
    expect(saved).toHaveBeenCalledWith(
      expect.objectContaining({ stage2_config: expect.objectContaining({ question_count: 1 }) }),
    );
    await user.selectOptions(screen.getByLabelText('Bankdan topshiriq'), 't1');
    await user.click(
      within(screen.getByRole('region', { name: '1-bosqich — kod topshiriqlari' })).getByRole(
        'button',
        { name: "Qo'shish" },
      ),
    );
    await user.selectOptions(screen.getByLabelText('Bankdan savol'), 'q1');
    await user.click(
      within(screen.getByRole('region', { name: '2-bosqich — suhbat' })).getByRole('button', {
        name: "Qo'shish",
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Saqlash va nashr qilish' }));
    await waitFor(() => expect(publish).toHaveBeenCalledWith({ status: 'published' }));
    expect(nav.push).toHaveBeenCalledWith('/hr/vacancies?status=published');
  });
  it('creates a bank question inline and includes it when saving the draft', async () => {
    const { saved, publish } = setup();
    const user = await firstTwo();
    await user.click(screen.getByRole('button', { name: 'Yangi savol qo‘shish' }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Turi'), 'mcq');
    await user.type(within(dialog).getByLabelText('Savol matni'), 'Which HTTP verb reads data?');
    await user.type(within(dialog).getByLabelText('Variant 1'), 'GET');
    await user.type(within(dialog).getByLabelText('Variant 2'), 'DELETE');
    await user.click(within(dialog).getAllByRole('checkbox')[0]);
    await user.click(within(dialog).getByRole('button', { name: 'Saqlash' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Which HTTP verb reads data?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Qoralama sifatida qoldirish' }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/hr/vacancies?status=draft'));
    expect(saved).toHaveBeenLastCalledWith(
      expect.objectContaining({ questions: [{ question_id: 'q2', is_mandatory: false }] }),
    );
    expect(publish).not.toHaveBeenCalled();
  });
});
