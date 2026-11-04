import { vi } from 'vitest';
import type { Stage2State, Turn } from '../model';

/** Shared fakes for the Stage 2 component tests. */
export const tel = {
  record: vi.fn(),
  flush: vi.fn(),
  connection: 'open' as string,
  server: null as unknown,
};

export const SID = 's-1';

export function makeTurn(overrides: Partial<Turn> = {}): Turn {
  return {
    id: 't-1',
    order: 1,
    kind: 'bank',
    is_follow_up: false,
    text: 'Generatorlar nima uchun kerak?',
    has_audio: false,
    code: null,
    asked: false,
    answer_deadline: null,
    think_available: true,
    ...overrides,
  };
}

export function makeState(overrides: Partial<Stage2State> = {}): Stage2State {
  return {
    id: SID,
    application_id: 'a-1',
    status: 'in_progress',
    reason: null,
    mode: 'text',
    can_fall_back_to_text: false,
    transcript_hint_needed: false,
    language: 'uz',
    started_at: '2026-11-02T10:00:00Z',
    expires_at: '2026-11-02T10:30:00Z',
    server_now: '2026-11-02T10:01:00Z',
    question_count: 5,
    answered_count: 1,
    answer_limit_s: 90,
    warning_s: 60,
    limit_s: 90,
    audio_max_bytes: 15_000_000,
    answer_max_chars: 4000,
    preparing: false,
    current_turn: makeTurn(),
    ...overrides,
  } as Stage2State;
}
