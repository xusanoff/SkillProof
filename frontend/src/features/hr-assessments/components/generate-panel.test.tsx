import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { envelope } from '@/test/fixtures';
import { API, server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { GeneratePanel } from './generate-panel';

// Poll fast in tests (production: ~2 s).
vi.mock('../model', async (orig) => ({
  ...(await orig<typeof import('../model')>()),
  JOB_POLL_MS: 20,
}));

const CID = 'c-1';
const VID = 'v-1';
const GEN = `${API}/api/v1/companies/${CID}/vacancies/${VID}/assessment/generate`;
const JOB = `${API}/api/v1/companies/${CID}/generation-jobs/j-1`;
const job = (status: string, result = {}, error: string | null = null) => ({
  id: 'j-1',
  assessment_id: 'a-1',
  status,
  params: {},
  result,
  error,
  created_at: '2026-11-02T10:00:00Z',
  updated_at: '2026-11-02T10:00:00Z',
});

function setup() {
  server.use(http.get(`${API}/api/v1/skills`, () => HttpResponse.json([])));
  return renderWithProviders(<GeneratePanel companyId={CID} vacancyId={VID} autoApprove={false} />);
}

describe('GeneratePanel', () => {
  it('polls until succeeded, shows flagged count and invalidates assessment + banks', async () => {
    const statuses = ['queued', 'running', 'succeeded'];
    let polls = 0;
    const body = vi.fn();
    server.use(
      http.post(GEN, async ({ request }) => {
        body(await request.json());
        return HttpResponse.json(job('queued'), { status: 202 });
      }),
      http.get(JOB, () => {
        const status = statuses[Math.min(polls++, statuses.length - 1)];
        return HttpResponse.json(
          job(
            status,
            status === 'succeeded'
              ? { question_ids: ['q1', 'q2'], task_ids: ['t1'], flagged: 1 }
              : {},
          ),
        );
      }),
    );
    const { queryClient } = setup();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    await userEvent.click(screen.getByRole('button', { name: 'AI bilan yaratish' }));

    expect(await screen.findByText('Yaratish tugadi')).toBeInTheDocument();
    expect(polls).toBeGreaterThanOrEqual(3);
    expect(body).toHaveBeenCalledWith({
      question_count: 8,
      task_count: 1,
      difficulty: 3,
      skill_ids: [],
    });
    expect(screen.getByText("2 ta savol va 1 ta topshiriq qo'shildi.")).toBeInTheDocument();
    expect(screen.getByText('1 ta element shubhali deb belgilandi')).toBeInTheDocument();
    await waitFor(() => {
      const keys = invalidate.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
      expect(keys).toContain(JSON.stringify(['hr-assessment', CID, VID]));
      expect(keys).toContain(JSON.stringify(['hr-bank', CID, 'questions']));
      expect(keys).toContain(JSON.stringify(['hr-bank', CID, 'tasks']));
    });
    // Stopped polling after the terminal status.
    const seen = polls;
    await new Promise((r) => setTimeout(r, 120));
    expect(polls).toBe(seen);
  });

  it('shows the failure reason when the job fails', async () => {
    server.use(
      http.post(GEN, () => HttpResponse.json(job('queued'), { status: 202 })),
      http.get(JOB, () => HttpResponse.json(job('failed', {}, 'model unavailable'))),
    );
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'AI bilan yaratish' }));
    expect(await screen.findByText("Yaratib bo'lmadi")).toBeInTheDocument();
    expect(screen.getByText('model unavailable')).toBeInTheDocument();
  });

  it('409 generation_in_progress explains that a job is already running', async () => {
    server.use(
      http.post(GEN, () => HttpResponse.json(envelope('generation_in_progress'), { status: 409 })),
    );
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'AI bilan yaratish' }));
    expect(await screen.findByText('Yaratish allaqachon ishlayapti')).toBeInTheDocument();
  });

  it('rejects out-of-range counts before calling the API', async () => {
    const post = vi.fn();
    server.use(http.post(GEN, () => (post(), HttpResponse.json(job('queued'), { status: 202 }))));
    setup();
    const input = screen.getByLabelText('Savollar soni (0–20)');
    await userEvent.clear(input);
    await userEvent.type(input, '25');
    await userEvent.click(screen.getByRole('button', { name: 'AI bilan yaratish' }));
    expect(await screen.findByText('0 dan 20 gacha butun son kiriting.')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });
});
