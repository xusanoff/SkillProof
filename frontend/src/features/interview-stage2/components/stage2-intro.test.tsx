import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API, server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { makeState, SID } from './test-helpers';
import { Stage2Intro } from './stage2-intro';

const START = `${API}/api/v1/applications/a-1/interview/stage2/start`;

class FakeRecorder {
  static isTypeSupported = () => true;
  mimeType = 'audio/webm';
  state = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['x']) });
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

function mic(getUserMedia: () => Promise<unknown>) {
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  vi.stubGlobal('AudioContext', FakeAudioContext);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  URL.createObjectURL = vi.fn(() => 'blob:t');
  URL.revokeObjectURL = vi.fn();
}
const stream = async () => ({ getTracks: () => [{ stop: () => {} }] });

describe('Stage2Intro', () => {
  beforeEach(() => vi.useRealTimers());
  afterEach(() => vi.unstubAllGlobals());

  it('says the voice is recorded and stored, and needs a mic test before starting', async () => {
    mic(stream);
    renderWithProviders(<Stage2Intro applicationId="a-1" onStarted={() => {}} />);
    expect(screen.getByText('Ovozingiz yoziladi va saqlanadi')).toBeInTheDocument();
    expect(screen.getByText(/ish beruvchi ko.rib chiqishi uchun saqlanadi/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Suhbatni boshlash' })).toBeDisabled();
  });

  it('records, plays back, then starts the interview', async () => {
    mic(stream);
    const started = vi.fn();
    server.use(
      http.post(START, () => HttpResponse.json(makeState({ mode: 'voice' }), { status: 201 })),
    );
    const user = userEvent.setup();
    renderWithProviders(<Stage2Intro applicationId="a-1" onStarted={started} />);
    await user.click(screen.getByRole('button', { name: '4 soniya yozish' }));
    expect(
      await screen.findByText(/Mikrofon ishlayapti/, {}, { timeout: 6000 }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Test yozuvi')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Suhbatni boshlash' }));
    await waitFor(() => expect(started).toHaveBeenCalledWith(SID));
  }, 12_000);

  it('offers text when the microphone is denied and moves a voice session to text', async () => {
    mic(() => Promise.reject(new DOMException('no', 'NotAllowedError')));
    const started = vi.fn();
    let fallback = 0;
    server.use(
      http.post(START, () =>
        HttpResponse.json(makeState({ mode: 'voice', can_fall_back_to_text: true }), {
          status: 201,
        }),
      ),
      http.post(`${API}/api/v1/interview-sessions/${SID}/stage2/fallback-text`, () => {
        fallback += 1;
        return HttpResponse.json(makeState({ mode: 'text' }));
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<Stage2Intro applicationId="a-1" onStarted={started} />);
    await user.click(screen.getByRole('button', { name: '4 soniya yozish' }));
    expect(await screen.findByText(/Mikrofonga ruxsat berilmadi/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Suhbatni boshlash' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /matn bilan davom etish/ }));
    await waitFor(() => expect(started).toHaveBeenCalledWith(SID));
    expect(fallback).toBe(1);
  });

  it('shows the server error when the interview cannot start', async () => {
    mic(stream);
    server.use(
      http.post(START, () =>
        HttpResponse.json(
          { error: { code: 'stage2_not_available', message: 'x', details: {} } },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<Stage2Intro applicationId="a-1" onStarted={() => {}} />);
    await user.click(screen.getByRole('button', { name: /matn bilan davom etish/ }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('asks for no microphone when the interview is in text mode', () => {
    renderWithProviders(<Stage2Intro applicationId="a-1" mode="text" onStarted={() => {}} />);
    expect(screen.queryByText('Ovozingiz yoziladi va saqlanadi')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '4 soniya yozish' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suhbatni boshlash' })).not.toBeInTheDocument();
  });
});
