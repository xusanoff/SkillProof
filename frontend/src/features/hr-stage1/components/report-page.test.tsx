import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { authKeys } from '@/features/auth';
import { ActiveCompanyProvider } from '@/features/companies';
import { envelope, makeMe } from '@/test/fixtures';
import { API, server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { Stage1ReportPage } from './report-page';

vi.mock(
  '@/i18n/navigation',
  async () => (await import('@/test/navigation-mock')).i18nNavigationMock,
);
vi.mock('next/navigation', async () => (await import('@/test/navigation-mock')).nextNavigationMock);
// The player (Monaco) has its own tests; the report page only needs to mount it.
vi.mock('@/features/hr-replay', () => ({ ReplayPlayer: () => <div>replay-player</div> }));

const CID = 'c-1';
const URL = `${API}/api/v1/companies/${CID}/applications/a-1/stage1`;

const task = {
  id: 't-1',
  title: 'Ikki son yig‘indisi',
  language: 'python',
  final_code: 'a, b = map(int, input().split())\nprint(a + b)',
  run_count: 2,
  shown_at: '2026-11-02T10:00:00Z',
  submitted_at: '2026-11-02T10:10:00Z',
  visible_results: [{ name: '1', passed: true, status: 'passed', time_ms: 8 }],
  hidden_results: [{ name: 'h1', passed: false, status: 'failed', time_ms: 9 }],
  review: {
    status: 'ok',
    score_percent: 80,
    criteria: [],
    findings: [],
    strengths: [{ text: 'Aniq nomlar', lines: [1] }],
    weaknesses: [{ text: 'Xatolar tekshirilmagan', lines: [2] }],
    rationale: '',
    confidence: 0.9,
    model: 'm',
    prompt_version: 'v1',
  },
};
const base = {
  application_id: 'a-1',
  session_id: 's-1',
  status: 'completed',
  disqualification_reason: null,
  evaluation_state: 'done',
  started_at: null,
  completed_at: null,
  score_percent: 72.5,
  hidden_tests_percent: 50,
  code_review_percent: 80,
  pass_threshold: 70,
  passed: true,
  needs_review: false,
  suspicion_percent: 45,
  suspicion_label: 'medium',
  reasons: [
    {
      type: 'burst_after_idle',
      severity: 'high',
      at_ms: 252_000,
      evidence: { chars: 240, window_s: 20 },
    },
  ],
  signals: [],
  tasks: [task],
};

function setup(status: number, body: unknown) {
  server.use(http.get(URL, () => HttpResponse.json(body as Record<string, unknown>, { status })));
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
      <Stage1ReportPage applicationId="a-1" />
    </ActiveCompanyProvider>,
  );
  queryClient.setQueryData(authKeys.me(), me);
}

describe('Stage1ReportPage', () => {
  it('404 means Stage 1 was not started', async () => {
    setup(404, envelope('not_found'));
    expect(
      await screen.findByRole('heading', { name: '1-bosqich hali boshlanmagan' }),
    ).toBeInTheDocument();
  });

  it('shows suspicion with label and timed reasons, scores, review lines and the code', async () => {
    setup(200, base);
    const susp = (await screen.findByRole('heading', { name: 'AI yordami shubhasi' })).closest(
      'section',
    )!;
    expect(within(susp).getByText('45')).toBeInTheDocument();
    expect(within(susp).getByText("O'rta")).toBeInTheDocument();
    expect(within(susp).getByText('04:12')).toBeInTheDocument();
    expect(
      within(susp).getByText(/Harakatsizlikdan keyin 20 soniyada 240 belgi/),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/qarorni avtomatik hal qilmaydi/).length).toBeGreaterThan(0);
    expect(screen.getByText('72.5%')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: '2-qator' });
    expect(link).toHaveAttribute('href', '#code-t-1-L2');
    expect(document.getElementById('code-t-1-L2')).not.toBeNull();
    expect(screen.getByText('replay-player')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /qayta tiklash/i })).not.toBeInTheDocument();
  });

  it('no score is a dash (never 0%), failed evaluation and needs_review are explicit', async () => {
    setup(200, {
      ...base,
      evaluation_state: 'failed',
      needs_review: true,
      score_percent: null,
      hidden_tests_percent: null,
      code_review_percent: null,
      suspicion_percent: null,
      suspicion_label: null,
      passed: null,
      reasons: [],
      tasks: [{ ...task, review: null }],
    });
    expect(await screen.findByText('Baholash bajarilmadi')).toBeInTheDocument();
    expect(screen.getByText("Qo'lda ko'rib chiqish kerak")).toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
  });

  it('disqualified shows the reason', async () => {
    setup(200, {
      ...base,
      status: 'disqualified',
      disqualification_reason: 'external_paste',
      evaluation_state: 'done',
      suspicion_percent: 100,
      suspicion_label: 'high',
      reasons: [
        {
          type: 'external_paste',
          severity: 'disqualifying',
          at_ms: 30_000,
          evidence: { lines: 6, chars: 200 },
        },
      ],
      score_percent: null,
    });
    expect(await screen.findByText('Nomzod chetlatilgan')).toBeInTheDocument();
    expect(screen.getByText(/Tashqi paste: nomzod qabul qilgan qoidaga ko'ra/)).toBeInTheDocument();
    expect(
      screen.getByText(/Katta tashqi paste: 1-bosqich shu yerda tugagan \(6 qator, 200 belgi\)/),
    ).toBeInTheDocument();
  });
});
