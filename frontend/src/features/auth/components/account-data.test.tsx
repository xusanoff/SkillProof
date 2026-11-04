import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { envelope } from '@/test/fixtures';
import { API, server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { AccountData } from './account-data';

vi.mock(
  '@/i18n/navigation',
  async () => (await import('@/test/navigation-mock')).i18nNavigationMock,
);
vi.mock('next/navigation', async () => (await import('@/test/navigation-mock')).nextNavigationMock);

const ME = `${API}/api/v1/auth/me`;

describe('AccountData', () => {
  it('needs the password before deleting', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post(`${ME}/delete`, async ({ request }) => {
        bodies.push(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithProviders(<AccountData />);
    await userEvent.click(screen.getByRole('button', { name: "Hisobni o'chirish" }));
    const confirm = await screen.findByRole('button', { name: "Butunlay o'chirish" });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Parolingiz'), 'secret-pass');
    await userEvent.click(confirm);
    await waitFor(() => expect(bodies).toEqual([{ password: 'secret-pass' }]));
  });

  it('explains why a sole owner cannot leave', async () => {
    server.use(
      http.post(`${ME}/delete`, () =>
        HttpResponse.json(envelope('sole_company_owner'), { status: 409 }),
      ),
    );
    renderWithProviders(<AccountData />);
    await userEvent.click(screen.getByRole('button', { name: "Hisobni o'chirish" }));
    await userEvent.type(await screen.findByLabelText('Parolingiz'), 'secret-pass');
    await userEvent.click(screen.getByRole('button', { name: "Butunlay o'chirish" }));
    expect(await screen.findByRole('alert')).toHaveTextContent('boshqa egaga');
  });
});
