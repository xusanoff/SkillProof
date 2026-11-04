import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { API, server } from '@/test/msw';
import { resetNav } from '@/test/navigation-mock';
import { renderWithProviders } from '@/test/render';
import type { CandidateResults } from '../model';
import { CandidateResultsPage } from './results-page';

vi.mock(
  '@/i18n/navigation',
  async () => (await import('@/test/navigation-mock')).i18nNavigationMock,
);
vi.mock('next/navigation', async () => (await import('@/test/navigation-mock')).nextNavigationMock);

const URL = `${API}/api/v1/applications/a-1/results`;

function results(over: Partial<CandidateResults> = {}): CandidateResults {
  return {
    application_id: 'a-1',
    vacancy_title: 'Python backend dasturchi',
    status: 'evaluated',
    state: 'done',
    disqualification_reason: null,
    stage1_score: 80,
    stage2_score: null,
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
  };
}

function render(r: CandidateResults | (() => CandidateResults)) {
  server.use(http.get(URL, () => HttpResponse.json(typeof r === 'function' ? r() : r)));
  return renderWithProviders(<CandidateResultsPage applicationId="a-1" />);
}

describe('CandidateResultsPage', () => {
  beforeEach(() => resetNav('/candidate/applications/a-1/results'));

  it('shows scores, tasks, answers, mistakes and what to learn next - and no suspicion', async () => {
    const { container } = render(results());
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mening natijalarim' }),
    ).toBeInTheDocument();
    expect(screen.getByText('72%')).toBeInTheDocument();
    // Stage 2 has no score yet: a dash.
    expect(screen.getByText("2-bosqich: og'zaki suhbat").nextSibling).toHaveTextContent('—');
    expect(screen.getByText("Yashirin testlardan o'tgani: 3 / 5")).toBeInTheDocument();
    expect(screen.getByText('Aniq nomlar')).toBeInTheDocument();
    expect(screen.getByText('55%')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Xatolar' })).toBeInTheDocument();
    expect(screen.getByText('Bo‘sh kiritish hisobga olinmagan.')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: "Keyin nimani o'rganish kerak" }),
    ).toBeInTheDocument();
    expect(screen.getByText('Generatorlar')).toBeInTheDocument();
    expect(container.textContent ?? '').not.toMatch(/shubha|suspic|подозр|tavsiya/i);
  });

  it('an empty feedback on a finished result says it is not available yet', async () => {
    render(results({ mistakes: [], learn_next: [] }));
    expect(
      await screen.findByText('Batafsil fikr-mulohaza hozircha mavjud emas.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Xatolar' })).not.toBeInTheDocument();
  });

  it('a result fully from verified skills says so instead of showing empty lists', async () => {
    render(
      results({
        per_skill: [{ name: 'Python', percent: 90, reused: true }],
        tasks: [],
        answers: [],
        mistakes: [],
        learn_next: [],
      }),
    );
    expect(await screen.findByText("Tasdiqlangan ko'nikmalardan natija")).toBeInTheDocument();
    expect(screen.getByText("Tasdiqlangan ko'nikmadan")).toBeInTheDocument();
    expect(
      screen.queryByText('Batafsil fikr-mulohaza hozircha mavjud emas.'),
    ).not.toBeInTheDocument();
  });

  it('not_ready explains when the results come', async () => {
    render(
      results({
        state: 'not_ready',
        status: 'stage1_in_progress',
        overall_score: null,
        tasks: [],
        answers: [],
        per_skill: [],
        mistakes: [],
        learn_next: [],
      }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Natijalar hali tayyor emas' }),
    ).toBeInTheDocument();
  });

  it('pending polls every 5 s until done', async () => {
    let calls = 0;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(() => {
        calls += 1;
        return calls === 1 ? results({ state: 'pending', overall_score: null }) : results();
      });
      expect(await screen.findByText('Natijalaringiz tayyorlanmoqda')).toBeInTheDocument();
      await vi.advanceTimersByTimeAsync(5100);
      await waitFor(() => expect(screen.getByText('Ballaringiz')).toBeInTheDocument());
    } finally {
      vi.useRealTimers();
    }
  });

  it('failed state is calm and asks nothing of the candidate', async () => {
    render(results({ state: 'failed' }));
    expect(await screen.findByText('Batafsil fikr-mulohaza kechikmoqda')).toBeInTheDocument();
    expect(screen.getByText(/Sizdan hech narsa talab qilinmaydi/)).toBeInTheDocument();
  });

  it('a disqualified application shows only the neutral wording of the reason', async () => {
    const { container } = render(
      results({
        status: 'stage1_disqualified',
        disqualification_reason: 'external_paste',
        state: 'done',
        overall_score: null,
        stage1_score: null,
        tasks: [],
        answers: [],
        per_skill: [],
        mistakes: [],
        learn_next: [],
      }),
    );
    expect(await screen.findByText(/tashqaridan katta matn qo'yildi/)).toBeInTheDocument();
    expect(screen.getByText('Suhbat erta tugadi')).toBeInTheDocument();
    expect(container.textContent ?? '').not.toMatch(/shubha|suspic|cheat|aldov/i);
  });
});
