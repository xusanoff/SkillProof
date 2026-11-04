import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
const AUDIO = `${STATE}/turns/t-1/question-audio`;

// Fake browser audio: a recorder that yields one chunk, a meter that always hears speech.
class FakeRecorder {
  static isTypeSupported = (m: string) => m === 'audio/mp4';
  mimeType: string;
  state = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(_s: unknown, o?: { mimeType?: string }) {
    this.mimeType = o?.mimeType ?? '';
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['ftypmp42audio'], { type: this.mimeType }) });
    this.onstop?.();
  }
}
class FakeAudioContext {
  resume = () => Promise.resolve();
  close = () => Promise.resolve();
  createAnalyser = () => ({
    fftSize: 1024,
    getFloatTimeDomainData: (b: Float32Array) => b.fill(0.3),
  });
  createMediaStreamSource = () => ({ connect: () => {} });
}
let ended: (() => void) | null = null;
let blockPlay = false;
class FakeAudio {
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public src: string) {}
  play() {
    if (blockPlay) return Promise.reject(new DOMException('blocked', 'NotAllowedError'));
    ended = () => this.onended?.();
    return Promise.resolve();
  }
  pause() {}
}

const mount = () =>
  renderWithProviders(<Stage2Step sid={SID} title="Backend" rulesVersion="2026-11" />);
const recorded = (type: string) => tel.record.mock.calls.filter((c) => c[0] === type);

function serve(state: ReturnType<typeof makeState>) {
  server.use(
    http.get(STATE, () => HttpResponse.json(state)),
    http.get(
      AUDIO,
      () =>
        new HttpResponse(new Uint8Array([82, 73, 70, 70]), {
          headers: { 'content-type': 'audio/wav' },
        }),
    ),
  );
}
const voice = (turn = {}, extra = {}) =>
  makeState({ mode: 'voice', can_fall_back_to_text: true, current_turn: makeTurn(turn), ...extra });

describe('Stage 2 voice room', () => {
  beforeEach(() => {
    tel.record.mockClear();
    ended = null;
    blockPlay = false;
    const stop = vi.fn();
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('Audio', FakeAudio);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop }] })) },
    });
    URL.createObjectURL = vi.fn(() => 'blob:q');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('plays the question, records question_played on end, then records and reports speech', async () => {
    serve(voice({ has_audio: true }));
    mount();
    expect(await screen.findByText(/Savol o.qilmoqda/)).toBeInTheDocument();
    await waitFor(() => expect(ended).not.toBeNull());
    expect(recorded('question_played')).toHaveLength(0);
    ended!();
    await waitFor(() => expect(recorded('question_played')).toEqual([['question_played', 't-1']]));
    expect(await screen.findByText(/Ovozingiz eshitilmoqda/)).toBeInTheDocument();
    await waitFor(() => expect(recorded('speech_activity')).toEqual([['speech_activity', 't-1']]));
  });

  it('uploads the recording in a supported format with silence_ms and the hint', async () => {
    serve(voice({ has_audio: false }, { transcript_hint_needed: true }));
    let form: FormData | null = null;
    server.use(
      http.post(ANSWER, async ({ request }) => {
        form = await request.formData();
        return HttpResponse.json(makeState({ status: 'completed', current_turn: null }));
      }),
    );
    const user = userEvent.setup();
    mount();
    // No audio: the text is the question, so it counts as played at once.
    await waitFor(() => expect(recorded('question_played')).toHaveLength(1));
    await user.type(await screen.findByLabelText(/Sinov rejimi/), 'Men shunday dedim');
    expect(recorded('typing_activity')).toEqual([['typing_activity', 't-1']]);
    await user.click(await screen.findByRole('button', { name: 'Javobni tugatish' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Suhbat tugadi' }),
    ).toBeInTheDocument();
    const f = form as unknown as FormData;
    expect(f.get('transcript_hint')).toBe('Men shunday dedim');
    expect(Number(f.get('silence_ms'))).toBeGreaterThanOrEqual(0);
    expect((f.get('audio') as Blob).size).toBeGreaterThan(0);
  });

  it('asks for a press when autoplay is blocked, and counts it played only after it ends', async () => {
    blockPlay = true;
    serve(voice({ has_audio: true }));
    const user = userEvent.setup();
    mount();
    expect(await screen.findByText(/Brauzer savolni o.zi o.ynata olmadi/)).toBeInTheDocument();
    expect(recorded('question_played')).toHaveLength(0);
    blockPlay = false;
    await user.click(screen.getByRole('button', { name: 'Savolni eshitish' }));
    await waitFor(() => expect(ended).not.toBeNull());
    ended!();
    await waitFor(() => expect(recorded('question_played')).toHaveLength(1));
  });

  it('after a reload does not play or record by itself; replay changes no events', async () => {
    serve(voice({ has_audio: true, asked: true }));
    const user = userEvent.setup();
    mount();
    expect(
      await screen.findByRole('button', { name: 'Savolni qayta eshitish' }),
    ).toBeInTheDocument();
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Savolni qayta eshitish' }));
    await waitFor(() => expect(ended).not.toBeNull());
    await act(async () => ended!());
    expect(recorded('question_played')).toHaveLength(0);
    await user.click(await screen.findByRole('button', { name: 'Javob berishni boshlash' }));
    expect(await screen.findByText(/Ovozingiz eshitilmoqda/)).toBeInTheDocument();
  });

  it('keeps the recording for a retry when the upload fails', async () => {
    serve(voice());
    let calls = 0;
    let sizes: number[] = [];
    server.use(
      http.post(ANSWER, async ({ request }) => {
        calls += 1;
        sizes.push(((await request.formData()).get('audio') as Blob).size);
        return calls === 1
          ? HttpResponse.json(
              { error: { code: 'internal_error', message: 'x', details: {} } },
              { status: 500 },
            )
          : HttpResponse.json(makeState({ status: 'completed', current_turn: null }));
      }),
    );
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: 'Javobni tugatish' }));
    await user.click(await screen.findByRole('button', { name: 'Qayta yuborish' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Suhbat tugadi' }),
    ).toBeInTheDocument();
    expect(calls).toBe(2);
    expect(sizes[1]).toBe(sizes[0]);
    expect(sizes[0]).toBeGreaterThan(0);
    sizes = [];
  });

  it('auto-submits the recording when the answer clock runs out', async () => {
    const t = '2026-11-02T10:01:00Z';
    serve(voice({ answer_deadline: '2026-11-02T10:01:01Z' }, { server_now: t }));
    let posted = 0;
    server.use(
      http.post(ANSWER, () => {
        posted += 1;
        return HttpResponse.json(makeState({ status: 'completed', current_turn: null }));
      }),
    );
    mount();
    // Recording starts by itself (no question audio); one second later the clock is out.
    await waitFor(() => expect(posted).toBe(1), { timeout: 4000 });
  });

  it('offers text when the microphone is denied, and switches after confirming', async () => {
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValue(
      new DOMException('no', 'NotAllowedError'),
    );
    serve(voice());
    let fallbackCalls = 0;
    server.use(
      http.post(`${STATE}/fallback-text`, () => {
        fallbackCalls += 1;
        return HttpResponse.json(makeState({ mode: 'text' }));
      }),
    );
    const user = userEvent.setup();
    mount();
    expect(await screen.findByText('Mikrofon ishlamadi')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Matnga o.tish/ }));
    expect(screen.getByText(/qaytarib bo.lmaydi/)).toBeInTheDocument();
    expect(fallbackCalls).toBe(0);
    await user.click(screen.getByRole('button', { name: 'Ha, matnga o‘tish'.replace('‘', "'") }));
    expect(await screen.findByRole('textbox', { name: 'Javobingiz' })).toBeInTheDocument();
    expect(fallbackCalls).toBe(1);
  });

  it('shows no fallback when the server does not allow it', async () => {
    serve(voice({}, { can_fall_back_to_text: false }));
    mount();
    await screen.findByRole('button', { name: 'Javobni tugatish' });
    expect(screen.queryByRole('button', { name: /Matnga o.tish/ })).not.toBeInTheDocument();
  });
});
