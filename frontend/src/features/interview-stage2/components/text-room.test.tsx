import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { envelope } from '@/test/fixtures';
import { API, server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { makeState, makeTurn, SID, tel } from './test-helpers';
import { Stage2Step } from './stage2-step';

vi.mock('../use-stage2-telemetry', async () => {
  const { tel: fake } = await import('./test-helpers');
  return { useStage2Telemetry: () => fake };
});
vi.mock(
  '@/i18n/navigation',
  async () => (await import('@/test/navigation-mock')).i18nNavigationMock,
);

const STATE = `${API}/api/v1/interview-sessions/${SID}/stage2`;
const ANSWER = `${STATE}/turns/t-1/answer`;

function serve(state: ReturnType<typeof makeState>) {
  server.use(http.get(STATE, () => HttpResponse.json(state)));
}
const mount = () =>
  renderWithProviders(<Stage2Step sid={SID} title="Backend" rulesVersion="2026-11" />);
const typed = (type: string) => tel.record.mock.calls.filter((c) => c[0] === type);

describe('Stage 2 text room', () => {
  beforeEach(() => {
    tel.record.mockClear();
    tel.flush.mockClear();
    tel.connection = 'open';
    window.sessionStorage.clear();
  });

  it('shows the question, the progress and announces it politely', async () => {
    serve(makeState());
    mount();
    const q = await screen.findByText('Generatorlar nima uchun kerak?');
    expect(q.closest('[aria-live]')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('2-savol, jami 5 ta')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    expect(screen.getByText('Javob berilgan: 1 / 5')).toBeInTheDocument();
    // The text is on screen: the answer clocks start.
    await waitFor(() => expect(typed('question_played')).toEqual([['question_played', 't-1']]));
  });

  it('blocks paste and drop and records it; says paste is off', async () => {
    serve(makeState());
    mount();
    const box = await screen.findByRole('textbox', { name: 'Javobingiz' });
    expect(screen.getByText(/nusxa qo.yish o.chirilgan/)).toBeInTheDocument();
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    fireEvent(box, paste);
    expect(paste.defaultPrevented).toBe(true);
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    fireEvent(box, drop);
    expect(drop.defaultPrevented).toBe(true);
    expect(typed('paste_external_blocked')).toHaveLength(2);
    expect(box).toHaveValue('');
  });

  it('records typing activity without content, at most every 3 s, and keeps a draft per turn', async () => {
    serve(makeState());
    const user = userEvent.setup();
    const { unmount } = mount();
    const box = await screen.findByRole('textbox', { name: 'Javobingiz' });
    await user.type(box, 'Generator xotirani tejaydi');
    expect(typed('typing_activity')).toEqual([['typing_activity', 't-1']]);
    expect(JSON.stringify(tel.record.mock.calls)).not.toContain('xotirani');
    expect(window.sessionStorage.getItem('sp-s2-draft:t-1')).toBe('Generator xotirani tejaydi');
    unmount();
    mount();
    expect(await screen.findByRole('textbox', { name: 'Javobingiz' })).toHaveValue(
      'Generator xotirani tejaydi',
    );
  });

  it('sends the text once (double click guarded) and shows the next question', async () => {
    serve(makeState());
    const bodies: string[] = [];
    server.use(
      http.post(ANSWER, async ({ request }) => {
        bodies.push(String((await request.formData()).get('text')));
        return HttpResponse.json(
          makeState({
            answered_count: 2,
            current_turn: makeTurn({ id: 't-2', order: 2, text: 'Ikkinchi savol' }),
          }),
        );
      }),
    );
    const user = userEvent.setup();
    mount();
    await user.type(await screen.findByRole('textbox', { name: 'Javobingiz' }), 'Javob');
    const send = screen.getByRole('button', { name: 'Javobni yuborish' });
    await user.dblClick(send);
    expect(await screen.findByText('Ikkinchi savol')).toBeInTheDocument();
    expect(bodies).toEqual(['Javob']);
    expect(window.sessionStorage.getItem('sp-s2-draft:t-1')).toBeNull();
  });

  it('keeps the answer after a failed upload and sends it again', async () => {
    serve(makeState());
    let calls = 0;
    server.use(
      http.post(ANSWER, () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json(envelope('internal_error'), { status: 500 })
          : HttpResponse.json(makeState({ status: 'completed', current_turn: null }));
      }),
    );
    const user = userEvent.setup();
    mount();
    await user.type(await screen.findByRole('textbox', { name: 'Javobingiz' }), 'Javob');
    await user.click(screen.getByRole('button', { name: 'Javobni yuborish' }));
    expect(await screen.findByText('Javob yuborilmadi')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Javobingiz' })).toHaveValue('Javob');
    await user.click(screen.getByRole('button', { name: 'Qayta yuborish' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Suhbat tugadi' }),
    ).toBeInTheDocument();
    expect(calls).toBe(2);
  });

  it('submits what is typed when the answer clock reaches zero', async () => {
    const now = '2026-11-02T10:01:00Z';
    serve(
      makeState({
        server_now: now,
        current_turn: makeTurn({ asked: true, answer_deadline: '2026-11-02T10:00:58Z' }),
      }),
    );
    window.sessionStorage.setItem('sp-s2-draft:t-1', 'yarim javob');
    const bodies: string[] = [];
    server.use(
      http.post(ANSWER, async ({ request }) => {
        bodies.push(String((await request.formData()).get('text')));
        return HttpResponse.json(makeState({ status: 'completed', current_turn: null }));
      }),
    );
    mount();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Suhbat tugadi' }),
    ).toBeInTheDocument();
    expect(bodies).toEqual(['yarim javob']);
    // The page was reloaded mid-question: no second `question_played`.
    expect(typed('question_played')).toHaveLength(0);
  });

  it('"Let me think" records once and then goes away', async () => {
    serve(makeState());
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: "O'ylab olay" }));
    expect(typed('think')).toEqual([['think', 't-1']]);
    expect(screen.queryByRole('button', { name: "O'ylab olay" })).not.toBeInTheDocument();
  });

  it('has no think button when the server does not offer it', async () => {
    serve(makeState({ current_turn: makeTurn({ think_available: false }) }));
    mount();
    await screen.findByRole('textbox', { name: 'Javobingiz' });
    expect(screen.queryByRole('button', { name: "O'ylab olay" })).not.toBeInTheDocument();
  });

  it('shows the own code panel with numbered lines and the marked ones', async () => {
    serve(
      makeState({
        current_turn: makeTurn({
          kind: 'own_code',
          code: { language: 'python', code: 'a = 1\nb = 2\nprint(a + b)', lines: [2, 3] },
        }),
      }),
    );
    mount();
    const pre = await screen.findByLabelText("Sizning kodingiz, faqat o'qish uchun");
    expect(pre.tagName).toBe('PRE');
    expect(pre).toHaveTextContent('a = 1');
    expect(screen.getAllByText('savol shu qator haqida', { exact: false })).toHaveLength(2);
  });

  it('labels a follow-up and does not count it in the total', async () => {
    serve(
      makeState({
        answered_count: 5,
        current_turn: makeTurn({ is_follow_up: true, text: 'Nega?' }),
      }),
    );
    mount();
    expect(await screen.findByText('Nega?')).toBeInTheDocument();
    expect(screen.getAllByText('Aniqlashtiruvchi savol').length).toBeGreaterThan(0);
    expect(screen.getByText('Javob berilgan: 5 / 5')).toBeInTheDocument();
  });

  it('polls about every 2 s while the next question is prepared', async () => {
    let n = 0;
    server.use(
      http.get(STATE, () => {
        n += 1;
        return HttpResponse.json(
          n === 1 ? makeState({ preparing: true, current_turn: null }) : makeState(),
        );
      }),
    );
    mount();
    expect(await screen.findByText(/Keyingi savol tayyorlanmoqda/)).toBeInTheDocument();
    expect(
      await screen.findByText('Generatorlar nima uchun kerak?', {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(n).toBe(2);
  }, 10_000);

  it.each([
    [{ status: 'completed' }, 'Suhbat tugadi', /Javoblaringiz qabul qilindi/],
    [{ status: 'expired' }, 'Vaqt tugadi', /saqlangan/],
    [{ status: 'abandoned' }, "Suhbat to'xtatildi", /Aloqa/],
    [
      { status: 'disqualified', reason: 'inactivity' },
      'Suhbat tugadi: harakatsizlik',
      /qoidalarga ko.ra/,
    ],
  ] as const)('end screen for %j', async (patch, title, body) => {
    serve(makeState({ ...patch, current_turn: null } as never));
    mount();
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByText(body)).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument(); // never a score
    expect(screen.getByRole('link', { name: 'Arizalarimga qaytish' })).toBeInTheDocument();
  });

  it('after "completed" tells the candidate results will follow', async () => {
    serve(makeState({ status: 'completed', current_turn: null }));
    mount();
    expect(await screen.findByText(/Baholash tugagach, natijalar/)).toBeInTheDocument();
  });

  it('an inactivity warning is an alert with a countdown', async () => {
    tel.server = {
      state: { status: 'in_progress', inactive_s: 62, warning_s: 60, limit_s: 90 },
      at: performance.now(),
    };
    serve(makeState());
    mount();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Harakatsizlik ogohlantirishi');
    expect(alert).toHaveTextContent(/2[78] soniya qoldi/);
    tel.server = null;
  });
});
