import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { envelope } from '@/test/fixtures';
import { API, server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import type { InterviewState } from '../model';
import { RulesStep } from './rules-step';

const state = {
  application_id: 'a-1',
  application_status: 'applied',
  vacancy_id: 'v-1',
  vacancy_title: 'Backend',
  language: 'ru',
  rules_version: '2026-11',
  rules_accepted: false,
  blocked_reason: null,
  warmup: null,
  session: null,
} as unknown as InterviewState;
const URL = `${API}/api/v1/applications/a-1/interview/rules`;

describe('RulesStep', () => {
  beforeEach(() => {
    server.use(
      http.get(`${API}/api/v1/applications/a-1/interview`, () => HttpResponse.json(state)),
    );
  });

  it('shows every rule in the interview language (not the site language) with the version', () => {
    renderWithProviders(<RulesStep state={state} lang="ru" />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Правила собеседования' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(6);
    expect(screen.getByText(/Лимит бездействия: 90 секунд/)).toBeInTheDocument();
    expect(screen.getByText('Версия правил: 2026-11')).toBeInTheDocument();
  });

  it('needs the tick, then posts the rules_version', async () => {
    const post = vi.fn();
    server.use(
      http.post(URL, async ({ request }) => {
        post(await request.json());
        return HttpResponse.json({ ...state, rules_accepted: true });
      }),
    );
    renderWithProviders(<RulesStep state={state} lang="en" />);
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Accept the rules to continue.')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'I have read and accept the rules' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith({ rules_version: '2026-11' }));
  });

  it('409 rules_version_mismatch asks to reload the rules', async () => {
    server.use(
      http.post(URL, () => HttpResponse.json(envelope('rules_version_mismatch'), { status: 409 })),
    );
    renderWithProviders(<RulesStep state={state} lang="uz" />);
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Davom etish' }));
    expect(await screen.findByText(/Qoidalar yangilangan/)).toBeInTheDocument();
  });
});
