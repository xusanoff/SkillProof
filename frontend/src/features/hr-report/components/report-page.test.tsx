import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authKeys } from '@/features/auth';
import { ActiveCompanyProvider } from '@/features/companies';
import { envelope, makeMe } from '@/test/fixtures';
import { API, server } from '@/test/msw';
import { resetNav } from '@/test/navigation-mock';
import { renderWithProviders } from '@/test/render';
import type { HrReport } from '../model';
import { HrReportPage } from './report-page';

vi.mock(
  '@/i18n/navigation',
  async () => (await import('@/test/navigation-mock')).i18nNavigationMock,
);
vi.mock('next/navigation', async () => (await import('@/test/navigation-mock')).nextNavigationMock);
vi.mock('@/features/hr-replay', () => ({ ReplayPlayer: () => <div>replay-player</div> }));

const C = `${API}/api/v1/companies/c-1/applications/a-1`;
const hr = makeMe({
  role: 'hr',
  companies: [{ id: 'c-1', name: 'Najot Soft', slug: 'najot-soft', member_role: 'owner' }],
});

function report(over: Partial<HrReport> = {}): HrReport {
  return {
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
        lines: [1, 2],
        excerpt: 'def total(a, b):\n    return a + b',
      },
    ],
    gaps: [
      {
        text: 'Generator nima ekanini tushuntirmadi',
        ref: 'turn_2',
        quote: 'Bilmayman, xotira haqida',
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
        at_ms: 252_000,
        evidence: { lines: 10, chars: 300 },
      },
      {
        stage: 'stage2',
        type: 'long_silence_then_fluent',
        severity: 'medium',
        at_ms: 70_000,
        evidence: { turn: 2, silence_s: 12.5, words: 55 },
      },
    ],
    signals: [
      {
        id: 'g-1',
        stage: 'stage1',
        type: 'focus_loss',
        severity: 'low',
        at_ms: 1000,
        evidence: { count: 2, total_s: 9, fullscreen_exits: 0 },
        created_at: '2026-11-02T10:00:00Z',
      },
    ],
    stage2: {
      session_id: 'ss-1',
      status: 'completed',
      mode: 'voice',
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
          answer_source: 'voice',
          has_answer_audio: true,
          response_latency_ms: 2000,
          silence_ms: 0,
          flags: { thinking_phrase: true },
          percent: 55,
          needs_review: true,
          criteria: [{ key: 'accuracy', score: 55, rationale: 'Qisman', quote: 'tejaydi' }],
          rationale: '',
          confidence: 0.7,
          model: 'm',
          prompt_version: 'v1',
        },
      ],
    },
    overrides: [],
    model: 'mock',
    prompt_version: 'report_writer.v1',
    ...over,
  };
}

function serve(r: HrReport | (() => HrReport), extra: Parameters<typeof server.use> = []) {
  server.use(
    http.get(`${API}/api/v1/auth/me`, () => HttpResponse.json(hr)),
    http.get(`${C}/report`, () => HttpResponse.json(typeof r === 'function' ? r() : r)),
    http.get(`${C}/stage1`, () => HttpResponse.json(envelope('not_found'), { status: 404 })),
    http.get(`${C}/notes`, () => HttpResponse.json([])),
    ...extra,
  );
}

function render() {
  const ui = renderWithProviders(
    <ActiveCompanyProvider>
      <HrReportPage applicationId="a-1" />
    </ActiveCompanyProvider>,
  );
  ui.queryClient.setQueryData(authKeys.me(), hr);
  return ui;
}

describe('HrReportPage', () => {
  beforeEach(() => resetNav('/hr/candidates/a-1'));

  it('shows sections in the order of spec §8 and the evidence', async () => {
    serve(report());
    render();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Aziza Karimova' }),
    ).toBeInTheDocument();

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    const order = [
      'AI yordami shubhasi',
      'Ballar',
      "Kuchli tomonlar va bo'shliqlar",
      'Tavsiya',
      "2-bosqich: og'zaki suhbat",
    ];
    const positions = order.map((name) => headings.indexOf(name));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));

    // Suspicion: percent, label, reasons with time and stage.
    const susp = screen.getByRole('region', { name: 'AI yordami shubhasi' });
    expect(susp).toHaveTextContent('42%');
    expect(susp).toHaveTextContent('04:12');
    expect(susp).toHaveTextContent('2-bosqich');
    expect(susp).toHaveTextContent("55 so'zli ravon javob");
    // Scores: a missing per-skill stage percent is a dash.
    const scores = screen.getByRole('region', { name: 'Ballar' });
    expect(scores).toHaveTextContent('72%');
    expect(scores).toHaveTextContent('2-bosqich —');
    // Evidence: quote as blockquote, excerpt as code with its lines.
    const points = screen.getByRole('region', { name: "Kuchli tomonlar va bo'shliqlar" });
    expect(within(points).getByText('Bilmayman, xotira haqida').tagName).toBe('BLOCKQUOTE');
    expect(points.querySelector('pre code')).toHaveTextContent('def total(a, b):');
    expect(points).toHaveTextContent('1, 2-qatorlar');
    // Stage 2: audio is lazy, flag shown, needs-review mark.
    const audio = document.querySelector('audio')!;
    expect(audio).toHaveAttribute('preload', 'none');
    expect(audio.getAttribute('src')).toBe(
      '/api/api/v1/companies/c-1/applications/a-1/stage2/turns/tt-1/answer-audio',
    );
    expect(screen.getByText("o'ylash uchun vaqt so'radi")).toBeInTheDocument();
    expect(screen.getAllByText("Ko'rib chiqish kerak").length).toBeGreaterThan(0);
    // No Stage 1 (404): that section is simply absent.
    expect(screen.queryByText('replay-player')).not.toBeInTheDocument();
  });

  it('polls while evaluating and shows the result when the report is done', async () => {
    let calls = 0;
    serve(() => {
      calls += 1;
      return calls === 1
        ? report({ state: 'pending', overall_score: null, summary: '' })
        : report();
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render();
      expect(await screen.findByText('Baholanmoqda')).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Tavsiya' })).not.toBeInTheDocument();
      await vi.advanceTimersByTimeAsync(5100);
      await waitFor(() =>
        expect(screen.getByRole('region', { name: 'Tavsiya' })).toBeInTheDocument(),
      );
      expect(screen.queryByText('Baholanmoqda')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('state null is shown as evaluating too', async () => {
    serve(report({ state: null, overall_score: null, stage1_score: null, stage2_score: null }));
    render();
    expect(await screen.findByText('Baholanmoqda')).toBeInTheDocument();
  });

  it('a failed report gets a clear notice', async () => {
    serve(report({ state: 'failed' }));
    render();
    expect(await screen.findByRole('alert')).toHaveTextContent('Baholash bajarilmadi');
  });

  it('empty summary with needs_review says the AI summary is unavailable; scores still show', async () => {
    serve(report({ summary: '', needs_review: true, strengths: [], gaps: [] }));
    render();
    expect(await screen.findByText('AI xulosasi mavjud emas')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Ballar' })).toHaveTextContent('72%');
  });

  it('marks reused skills and explains an empty written part', async () => {
    serve(
      report({
        summary: '',
        strengths: [],
        gaps: [],
        per_skill: [
          {
            skill_id: 's-1',
            name: 'Python',
            percent: 88,
            stage1_percent: 88,
            stage2_percent: null,
            reused: ['stage1'],
          },
        ],
        reused_skills: [
          {
            skill_id: 's-1',
            name: 'Python',
            stage: 'stage1',
            percent: 88,
            verified_at: '2026-05-01T10:00:00Z',
            valid_until: '2027-05-01T10:00:00Z',
          },
        ],
      }),
    );
    render();
    expect(await screen.findByText("Tasdiqlangan ko'nikmalardan olingan")).toBeInTheDocument();
    expect(screen.getByText(/Tasdiqlangan ko'nikmadan:/)).toBeInTheDocument();
    expect(
      screen.getByText(/Yozma xulosa, kuchli tomonlar va kamchiliklar yo'q/),
    ).toBeInTheDocument();
    expect(screen.queryByText('AI xulosasi mavjud emas')).not.toBeInTheDocument();
  });

  it('hides the recommendation when the server sent none', async () => {
    serve(report({ recommendation: null }));
    render();
    await screen.findByRole('heading', { level: 1, name: 'Aziza Karimova' });
    expect(screen.queryByRole('region', { name: 'Tavsiya' })).not.toBeInTheDocument();
  });

  it('override: validates, sends the body, writes the returned report to the cache', async () => {
    let sent: unknown = null;
    serve(report(), [
      http.post(`${C}/overrides`, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(
          report({
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
          }),
        );
      }),
    ]);
    const { queryClient } = render();
    await screen.findByRole('heading', { level: 1, name: 'Aziza Karimova' });
    const probe = ['applications', 'company', 'c-1', 'probe'];
    queryClient.setQueryData(probe, { items: [] });
    await userEvent.click(screen.getByRole('button', { name: "Natijani o'zgartirish" }));

    const dialog = await screen.findByRole('dialog');
    // Not disqualified: no disqualification option.
    expect(within(dialog).queryByRole('option', { name: 'Chetlatish' })).not.toBeInTheDocument();
    await userEvent.selectOptions(
      within(dialog).getByLabelText("Nimani o'zgartirasiz"),
      'overall_score',
    );
    // Missing value and a too-short comment block the request.
    await userEvent.type(within(dialog).getByLabelText('Izoh'), 'ok');
    await userEvent.click(within(dialog).getByRole('button', { name: "O'zgartirishni saqlash" }));
    expect(within(dialog).getByText('Qiymat kiriting.')).toBeInTheDocument();
    expect(within(dialog).getByText('Kamida 3 ta belgi yozing.')).toBeInTheDocument();
    expect(sent).toBeNull();

    await userEvent.type(within(dialog).getByLabelText('Yangi ball, %'), '150');
    await userEvent.clear(within(dialog).getByLabelText('Izoh'));
    await userEvent.type(within(dialog).getByLabelText('Izoh'), 'Intervyu yaxshi o‘tdi');
    await userEvent.click(within(dialog).getByRole('button', { name: "O'zgartirishni saqlash" }));
    expect(within(dialog).getByText('0 dan 100 gacha son kiriting.')).toBeInTheDocument();
    expect(sent).toBeNull();

    await userEvent.clear(within(dialog).getByLabelText('Yangi ball, %'));
    await userEvent.type(within(dialog).getByLabelText('Yangi ball, %'), '90');
    await userEvent.click(within(dialog).getByRole('button', { name: "O'zgartirishni saqlash" }));

    await waitFor(() =>
      expect(sent).toEqual({ field: 'overall_score', value: 90, comment: 'Intervyu yaxshi o‘tdi' }),
    );
    // The returned report is shown without a second GET, with the history entry.
    expect(await screen.findByText('72% → 90%')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Ballar' })).toHaveTextContent('90%');
    expect(screen.getByText(/Hilola HR/)).toBeInTheDocument();
    // The HR list is refreshed after an override.
    await waitFor(() => expect(queryClient.getQueryState(probe)?.isInvalidated).toBe(true));
  });

  it('shows the server error code of a rejected override', async () => {
    serve(report({ status: 'stage1_disqualified', disqualification_reason: 'inactivity' }), [
      http.post(`${C}/overrides`, () =>
        HttpResponse.json(envelope('not_disqualified'), { status: 409 }),
      ),
    ]);
    render();
    await screen.findByRole('heading', { level: 1, name: 'Aziza Karimova' });
    await userEvent.click(screen.getByRole('button', { name: "Natijani o'zgartirish" }));
    const dialog = await screen.findByRole('dialog');
    // Disqualified: lifting is offered, needs no value.
    await userEvent.selectOptions(
      within(dialog).getByLabelText("Nimani o'zgartirasiz"),
      'disqualification',
    );
    await userEvent.type(within(dialog).getByLabelText('Izoh'), 'Aloqa uzilgan edi');
    await userEvent.click(within(dialog).getByRole('button', { name: "O'zgartirishni saqlash" }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Bu ariza chetlatilmagan.');
  });

  it('adds a private note', async () => {
    let sent: unknown = null;
    let notes: Record<string, string>[] = [];
    server.use(
      http.post(`${C}/notes`, async ({ request }) => {
        sent = await request.json();
        notes = [
          {
            id: 'n-1',
            text: 'Qayta suhbat kerak',
            author_name: 'Hilola HR',
            created_at: '2026-11-03T10:00:00Z',
          },
        ];
        return HttpResponse.json(notes[0]!, { status: 201 });
      }),
    );
    serve(report());
    server.use(http.get(`${C}/notes`, () => HttpResponse.json(notes)));
    render();
    await screen.findByRole('heading', { level: 1, name: 'Aziza Karimova' });
    await userEvent.type(screen.getByLabelText('Yangi eslatma'), 'Qayta suhbat kerak');
    await userEvent.click(screen.getByRole('button', { name: "Eslatma qo'shish" }));
    expect(await screen.findByText('Qayta suhbat kerak', { selector: 'p' })).toBeInTheDocument();
    expect(sent).toEqual({ text: 'Qayta suhbat kerak' });
  });
});
