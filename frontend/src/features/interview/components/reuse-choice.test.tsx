import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { API, server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { coversStage1, coversStage2, type InterviewState, type ReuseOffer } from '../model';
import { ReuseChoice } from './reuse-choice';
import { Stage1Step } from './stage1-step';

vi.mock(
  '@/i18n/navigation',
  async () => (await import('@/test/navigation-mock')).i18nNavigationMock,
);
vi.mock('next/navigation', async () => (await import('@/test/navigation-mock')).nextNavigationMock);

const offer: ReuseOffer = {
  skills: [
    {
      skill_id: 's-1',
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
  questions_total: 5,
  questions_skipped: 3,
};
const state = {
  application_id: 'a-1',
  application_status: 'interview_pending',
  vacancy_title: 'Backend',
  rules_version: '2026-11',
  session: null,
  reuse: offer,
} as unknown as InterviewState;

describe('reuse model', () => {
  it('covers a stage only when chosen and everything is skipped', () => {
    expect(coversStage1(offer, true)).toBe(true);
    expect(coversStage1(offer, false)).toBe(false);
    expect(coversStage1(null, true)).toBe(false);
    expect(coversStage2(offer, true)).toBe(false);
    expect(coversStage2({ ...offer, questions_skipped: 5 }, true)).toBe(true);
  });
});

describe('ReuseChoice', () => {
  it('shows the skills, what is skipped and the final warning; the switch reports changes', async () => {
    const onChange = vi.fn();
    renderWithProviders(<ReuseChoice offer={offer} reuse onChange={onChange} />);
    expect(screen.getByText('Python')).toBeInTheDocument();
    expect(screen.getByText(/2 ta topshiriqdan 2 tasi, 5 ta savoldan 3 tasi/)).toBeInTheDocument();
    expect(screen.getByText(/bu ariza uchun uni o'zgartirib bo'lmaydi/)).toBeInTheDocument();
    const sw = screen.getByRole('switch');
    expect(sw).toBeChecked();
    await userEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(false);
  });
});

describe('Stage1Step with an offer', () => {
  const url = `${API}/api/v1/applications/a-1/interview/stage1`;

  it('sends {reuse} and shows the end screen without opening the editor when all is covered', async () => {
    const post = vi.fn();
    server.use(
      http.post(url, async ({ request }) => {
        post(await request.json());
        return HttpResponse.json({
          id: 's-1',
          status: 'completed',
          tasks: [],
          result: { state: 'done', score_percent: 90, passed: true, tasks: [] },
        });
      }),
      http.get(`${API}/api/v1/applications/a-1/interview`, () => HttpResponse.json(state)),
    );
    renderWithProviders(<Stage1Step state={state} reuse covered />);
    await userEvent.click(screen.getByRole('button', { name: '1-bosqichni boshlash' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith({ reuse: true }));
    expect(
      await screen.findByText(/tasdiqlangan ko'nikmalaringiz bilan qoplangan/),
    ).toBeInTheDocument();
  });

  it('sends nothing when there is no offer', async () => {
    const post = vi.fn();
    server.use(
      http.post(url, async ({ request }) => {
        post(await request.text());
        return HttpResponse.json({ id: 's-1', status: 'completed', tasks: [], result: null });
      }),
    );
    renderWithProviders(<Stage1Step state={{ ...state, reuse: null }} />);
    await userEvent.click(screen.getByRole('button', { name: '1-bosqichni boshlash' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith(''));
  });

  it('sends {reuse: false} when the candidate turned the choice off', async () => {
    const post = vi.fn();
    server.use(
      http.post(url, async ({ request }) => {
        post(await request.json());
        return HttpResponse.json({ id: 's-1', status: 'abandoned', tasks: [], result: null });
      }),
    );
    renderWithProviders(<Stage1Step state={state} reuse={false} />);
    await userEvent.click(screen.getByRole('button', { name: '1-bosqichni boshlash' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith({ reuse: false }));
  });
});
