import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { authKeys } from '@/features/auth';
import { ActiveCompanyProvider } from '@/features/companies';
import { envelope, makeMe } from '@/test/fixtures';
import { API, server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { AssessmentEditor } from './assessment-editor';

vi.mock(
  '@/i18n/navigation',
  async () => (await import('@/test/navigation-mock')).i18nNavigationMock,
);
vi.mock('next/navigation', async () => (await import('@/test/navigation-mock')).nextNavigationMock);

const CID = 'c-1';
const VID = 'v-1';
const BASE = `${API}/api/v1/companies/${CID}`;
const empty = { items: [], total: 0, page: 1, page_size: 100 };

const item = (id: string, over = {}) => ({
  id,
  company_id: CID,
  is_global: false,
  source: 'manual',
  is_approved: false,
  verification_status: 'not_checked',
  verification_report: {},
  model: null,
  prompt_version: null,
  created_at: '2026-11-01T10:00:00Z',
  updated_at: '2026-11-01T10:00:00Z',
  skill_id: null,
  difficulty: 3,
  language: 'uz',
  ...over,
});

function setup(assessment: Record<string, unknown> | 404) {
  server.use(
    http.get(`${API}/api/v1/skills`, () => HttpResponse.json([])),
    http.get(`${BASE}/vacancies/${VID}`, () =>
      HttpResponse.json({ id: VID, title: 'Python dasturchi' }),
    ),
    http.get(`${BASE}/tasks`, () => HttpResponse.json(empty)),
    http.get(`${BASE}/questions`, () => HttpResponse.json(empty)),
    http.get(`${BASE}/vacancies/${VID}/assessment`, () =>
      assessment === 404
        ? HttpResponse.json(envelope('not_found'), { status: 404 })
        : HttpResponse.json(assessment),
    ),
  );
  const me = makeMe({
    role: 'hr',
    companies: [
      {
        id: CID,
        name: 'Acme',
        slug: 'acme',
        member_role: 'owner',
        blocked: false,
        block_reason: null,
      },
    ],
  });
  server.use(http.get(`${API}/api/v1/auth/me`, () => HttpResponse.json(me)));
  const { queryClient } = renderWithProviders(
    <ActiveCompanyProvider>
      <AssessmentEditor vacancyId={VID} />
    </ActiveCompanyProvider>,
  );
  queryClient.setQueryData(authKeys.me(), me);
}

describe('AssessmentEditor', () => {
  it('404 means nothing saved yet: empty form and a "not saved" readiness note', async () => {
    setup(404);
    expect(await screen.findByText('Assessment hali saqlanmagan')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Assessmentni saqlash' })).toBeInTheDocument();
    expect(screen.getByText('Topshiriq tanlanmagan.')).toBeInTheDocument();
  });

  it('shows blocking issues and warnings with item names and effective thresholds as hints', async () => {
    setup({
      id: 'a-1',
      vacancy_id: VID,
      language: 'uz',
      stage1_config: { task_ids: ['t-1'] },
      stage2_config: { adaptive: true, mode: 'voice' },
      integrity_config: {},
      question_mode: 'manual',
      allow_skill_reuse: true,
      auto_approve_ai_items: false,
      tasks: [item('t-1', { title: 'Two Sum', task_type: 'coding' })],
      questions: [item('q-1', { text: 'GIL nima?', type: 'open', language: 'ru' })],
      mandatory_question_ids: [],
      effective_thresholds: {
        stage1: { pass_threshold: 60, task_time_limit_minutes: 45 },
        stage2: { pass_threshold: 60, session_minutes: 20, question_count: 8 },
        integrity: { paste_max_lines: 2, inactivity_limit_s: 90 },
      },
      ready: false,
      issues: [
        { code: 'task_not_approved', severity: 'blocking', details: { id: 't-1' } },
        {
          code: 'stage2_not_enough_questions',
          severity: 'blocking',
          details: { needed: 8, approved: 0 },
        },
        { code: 'question_language_mismatch', severity: 'warning', details: { id: 'q-1' } },
      ],
      updated_at: '2026-11-02T10:00:00Z',
    });
    const panel = (await screen.findByText('Assessment hali tayyor emas')).closest('section')!;
    expect(within(panel).getByText('Topshiriq tasdiqlanmagan: Two Sum')).toBeInTheDocument();
    expect(
      within(panel).getByText(
        'Stage 2 uchun tasdiqlangan savol yetarli emas: kerak 8, tasdiqlangan 0.',
      ),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText('Savol tili assessment tiliga mos emas: GIL nima?'),
    ).toBeInTheDocument();
    expect(within(panel).getByRole('heading', { name: /2 ta muammo/ })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Joylashtirish chegarasi/)).toHaveAttribute('placeholder', '2');
    expect(
      screen.getAllByLabelText(/^O'tish bali/).map((e) => e.getAttribute('placeholder')),
    ).toEqual(['60', '60']);
  });
});
