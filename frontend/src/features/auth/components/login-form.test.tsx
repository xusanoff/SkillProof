import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { envelope, makeMe } from '@/test/fixtures';
import { API, server } from '@/test/msw';
import { nav, resetNav } from '@/test/navigation-mock';
import { renderWithProviders } from '@/test/render';
import { authKeys } from '../api';
import { LoginForm } from './login-form';

vi.mock(
  '@/i18n/navigation',
  async () => (await import('@/test/navigation-mock')).i18nNavigationMock,
);
vi.mock('next/navigation', async () => (await import('@/test/navigation-mock')).nextNavigationMock);

const LOGIN = `${API}/api/v1/auth/login`;

async function fill(email: string, password: string) {
  const user = userEvent.setup();
  if (email) await user.type(screen.getByLabelText('Elektron pochta'), email);
  if (password) await user.type(screen.getByLabelText('Parol'), password);
  await user.click(screen.getByRole('button', { name: 'Kirish' }));
}

describe('LoginForm', () => {
  beforeEach(() => resetNav('/login'));

  it('signs in, stores the user and goes to the role home', async () => {
    let body: unknown;
    const me = makeMe({ role: 'hr' });
    server.use(
      http.post(LOGIN, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(me);
      }),
    );
    const { queryClient } = renderWithProviders(<LoginForm />);
    await fill('hr@example.com', 'secret-pass');

    await vi.waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/hr'));
    expect(body).toEqual({ email: 'hr@example.com', password: 'secret-pass' });
    expect(queryClient.getQueryData(authKeys.me())).toEqual(me);
  });

  it('returns to a safe ?next= path', async () => {
    resetNav('/login', 'next=%2Finvitations%2Ftok');
    server.use(http.post(LOGIN, () => HttpResponse.json(makeMe())));
    renderWithProviders(<LoginForm />);
    await fill('a@example.com', 'secret-pass');
    await vi.waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/invitations/tok'));
  });

  it('shows invalid_credentials as a form error', async () => {
    server.use(
      http.post(LOGIN, () => HttpResponse.json(envelope('invalid_credentials'), { status: 401 })),
    );
    renderWithProviders(<LoginForm />);
    await fill('a@example.com', 'wrong-pass');
    expect(await screen.findByRole('alert')).toHaveTextContent("Pochta yoki parol noto'g'ri.");
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('shows rate_limited', async () => {
    server.use(
      http.post(LOGIN, () => HttpResponse.json(envelope('rate_limited'), { status: 429 })),
    );
    renderWithProviders(<LoginForm />);
    await fill('a@example.com', 'whatever1');
    expect(await screen.findByRole('alert')).toHaveTextContent('Urinishlar juda ko');
  });

  it('validates on the client before calling the API', async () => {
    const spy = vi.fn();
    server.use(http.post(LOGIN, () => (spy(), HttpResponse.json(makeMe()))));
    renderWithProviders(<LoginForm />);
    await fill('not-an-email', '');

    const email = screen.getByLabelText('Elektron pochta');
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription(/Elektron pochta manzilini to'g'ri kiriting/);
    expect(screen.getByLabelText('Parol')).toHaveAccessibleDescription("Bu maydonni to'ldiring.");
    expect(spy).not.toHaveBeenCalled();
  });

  it('attaches server validation_error details to fields', async () => {
    server.use(
      http.post(LOGIN, () =>
        HttpResponse.json(
          envelope('validation_error', {
            fields: [{ loc: ['body', 'email'], msg: 'bad', type: 'value_error' }],
          }),
          { status: 422 },
        ),
      ),
    );
    renderWithProviders(<LoginForm />);
    await fill('a@example.com', 'secret-pass');
    expect(await screen.findByLabelText('Elektron pochta')).toHaveAccessibleDescription(
      "Qiymat noto'g'ri. Tekshirib, qayta kiriting.",
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
