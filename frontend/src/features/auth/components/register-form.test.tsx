import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { envelope, makeMe } from '@/test/fixtures';
import { API, server } from '@/test/msw';
import { nav, resetNav } from '@/test/navigation-mock';
import { renderWithProviders } from '@/test/render';
import { RegisterForm } from './register-form';

vi.mock(
  '@/i18n/navigation',
  async () => (await import('@/test/navigation-mock')).i18nNavigationMock,
);
vi.mock('next/navigation', async () => (await import('@/test/navigation-mock')).nextNavigationMock);

const REGISTER = `${API}/api/v1/auth/register`;

async function fillCommon(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Ism va familiya'), 'Aziza Karimova');
  await user.type(screen.getByLabelText('Elektron pochta'), 'aziza@example.com');
  await user.type(screen.getByLabelText('Parol'), 'long-enough-1');
}

describe('RegisterForm role choice', () => {
  beforeEach(() => resetNav('/register'));

  it('offers exactly two roles as radio options, none preselected', () => {
    renderWithProviders(<RegisterForm />);
    const group = screen.getByRole('group', { name: "Kim sifatida ro'yxatdan o'tasiz?" });
    expect(group).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
    expect(screen.getByRole('radio', { name: /Ish izlayman/ })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /Xodim izlayman/ })).not.toBeChecked();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('requires a role', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterForm />);
    await fillCommon(user);
    await user.click(screen.getByRole('button', { name: 'Hisob yaratish' }));
    expect(await screen.findByText("Kim sifatida ro'yxatdan o'tishingizni tanlang.")).toBeVisible();
  });

  it('sends the chosen role with locale and timezone, then goes to the HR area', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post(REGISTER, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(makeMe({ role: 'hr' }), { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<RegisterForm />);
    await user.click(screen.getByRole('radio', { name: /Xodim izlayman/ }));
    await fillCommon(user);
    await user.click(screen.getByRole('button', { name: 'Hisob yaratish' }));

    await vi.waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/hr'));
    expect(body).toMatchObject({
      role: 'hr',
      email: 'aziza@example.com',
      full_name: 'Aziza Karimova',
      locale: 'uz',
    });
    expect(typeof body.timezone).toBe('string');
  });

  it('preselects ?role=hr and prefills ?email=', () => {
    resetNav('/register', 'role=hr&email=inv%40example.com');
    renderWithProviders(<RegisterForm />);
    expect(screen.getByRole('radio', { name: /Xodim izlayman/ })).toBeChecked();
    expect(screen.getByLabelText('Elektron pochta')).toHaveValue('inv@example.com');
  });

  it('puts email_taken on the email field', async () => {
    server.use(
      http.post(REGISTER, () => HttpResponse.json(envelope('email_taken'), { status: 409 })),
    );
    const user = userEvent.setup();
    renderWithProviders(<RegisterForm />);
    await user.click(screen.getByRole('radio', { name: /Ish izlayman/ }));
    await fillCommon(user);
    await user.click(screen.getByRole('button', { name: 'Hisob yaratish' }));
    expect(await screen.findByLabelText('Elektron pochta')).toHaveAccessibleDescription(
      /allaqachon bor/,
    );
  });
});
