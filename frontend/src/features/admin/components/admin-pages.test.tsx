import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { envelope, makeMe } from '@/test/fixtures';
import { API, server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { AiUsagePage } from './ai-usage-page';
import { CompaniesPage } from './companies-page';
import { ThresholdsPage } from './thresholds-page';
import { UsersPage } from './users-page';

vi.mock(
  '@/i18n/navigation',
  async () => (await import('@/test/navigation-mock')).i18nNavigationMock,
);
vi.mock('next/navigation', async () => (await import('@/test/navigation-mock')).nextNavigationMock);

const ADMIN = `${API}/api/v1/admin`;

const user = {
  id: 'u-2',
  email: 'jasur@example.com',
  full_name: 'Jasur Aliyev',
  role: 'candidate',
  is_active: true,
  is_email_verified: true,
  created_at: '2026-10-01T09:00:00Z',
};

function usersPage(items: unknown[]) {
  return http.get(`${ADMIN}/users`, () =>
    HttpResponse.json({ items, total: items.length, page: 1, page_size: 20 }),
  );
}

describe('UsersPage', () => {
  it('asks before deactivating, then sends the change', async () => {
    const bodies: unknown[] = [];
    server.use(
      usersPage([user]),
      http.get(`${API}/api/v1/auth/me`, () => HttpResponse.json(makeMe({ role: 'admin' }))),
      http.patch(`${ADMIN}/users/u-2`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ ...user, is_active: false });
      }),
    );
    renderWithProviders(<UsersPage />);
    await userEvent.click(await screen.findByRole('button', { name: "O'chirib qo'yish" }));
    expect(bodies).toEqual([]);
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: "O'chirib qo'yish" }));
    await waitFor(() => expect(bodies).toEqual([{ is_active: false }]));
  });

  it('offers no switch on the admin own row', async () => {
    server.use(
      usersPage([{ ...user, id: 'u-1' }]),
      http.get(`${API}/api/v1/auth/me`, () => HttpResponse.json(makeMe({ role: 'admin' }))),
    );
    renderWithProviders(<UsersPage />);
    expect(await screen.findByText('jasur@example.com')).toBeVisible();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: "O'chirib qo'yish" })).toBeNull(),
    );
  });

  it('searches on submit', async () => {
    const seen: (string | null)[] = [];
    server.use(
      http.get(`${ADMIN}/users`, ({ request }) => {
        seen.push(new URL(request.url).searchParams.get('q'));
        return HttpResponse.json({ items: [], total: 0, page: 1, page_size: 20 });
      }),
    );
    renderWithProviders(<UsersPage />);
    await userEvent.type(await screen.findByRole('textbox', { name: 'Qidirish' }), 'jasur{Enter}');
    await waitFor(() => expect(seen).toContain('jasur'));
    expect(await screen.findByText('Hech narsa topilmadi.')).toBeVisible();
  });
});

describe('CompaniesPage', () => {
  it('sends the block reason', async () => {
    const bodies: unknown[] = [];
    const company = {
      id: 'c-1',
      name: 'Acme',
      slug: 'acme',
      is_verified: false,
      blocked_at: null,
      block_reason: null,
      members: 1,
      vacancies: 2,
      created_at: '2026-10-01T09:00:00Z',
    };
    server.use(
      http.get(`${ADMIN}/companies`, () =>
        HttpResponse.json({ items: [company], total: 1, page: 1, page_size: 20 }),
      ),
      http.patch(`${ADMIN}/companies/c-1`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(company);
      }),
    );
    renderWithProviders(<CompaniesPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Bloklash' }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.type(within(dialog).getByRole('textbox'), 'Firibgarlik');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Bloklash' }));
    await waitFor(() => expect(bodies).toEqual([{ blocked: true, reason: 'Firibgarlik' }]));
  });
});

describe('ThresholdsPage', () => {
  const data = {
    defaults: { stage1: { pass_threshold: 60, strict: true } },
    overrides: {},
    effective: { stage1: { pass_threshold: 60, strict: true } },
    updated_at: null,
  };

  it('saves only what differs from the defaults', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.get(`${ADMIN}/thresholds`, () => HttpResponse.json(data)),
      http.put(`${ADMIN}/thresholds`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(data);
      }),
    );
    renderWithProviders(<ThresholdsPage />);
    const input = await screen.findByRole('spinbutton', { name: /pass_threshold/ });
    await userEvent.clear(input);
    await userEvent.type(input, '70');
    await userEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    await waitFor(() =>
      expect(bodies).toEqual([{ overrides: { stage1: { pass_threshold: 70 } } }]),
    );
  });

  it('names the refused fields', async () => {
    server.use(
      http.get(`${ADMIN}/thresholds`, () => HttpResponse.json(data)),
      http.put(`${ADMIN}/thresholds`, () =>
        HttpResponse.json(envelope('invalid_thresholds', { fields: ['stage1.pass_threshold'] }), {
          status: 422,
        }),
      ),
    );
    renderWithProviders(<ThresholdsPage />);
    await screen.findByRole('spinbutton', { name: /pass_threshold/ });
    await userEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    expect(await screen.findByText('stage1.pass_threshold')).toBeVisible();
  });
});

describe('AiUsagePage', () => {
  const bucket = {
    key: 'total',
    calls: 3,
    input_tokens: 10,
    output_tokens: 5,
    seconds: 0,
    characters: 0,
    cost_usd: 0,
    unpriced_calls: 3,
    failed_calls: 0,
  };

  it('shows an unknown price as unknown, not as free', async () => {
    server.use(
      http.get(`${ADMIN}/ai-usage`, () =>
        HttpResponse.json({
          days: 30,
          total: bucket,
          by_day: [],
          by_kind: [],
          by_model: [],
          by_role: [],
        }),
      ),
    );
    renderWithProviders(<AiUsagePage />);
    expect(await screen.findByText("Noma'lum")).toBeVisible();
    expect(screen.getByText(/narxi noma'lum/)).toBeVisible();
    expect(screen.queryByText('$0.00')).toBeNull();
  });
});
