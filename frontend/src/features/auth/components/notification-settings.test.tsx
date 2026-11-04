import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { envelope, makeMe } from '@/test/fixtures';
import { API, server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { NotificationSettings } from './notification-settings';

const ME = `${API}/api/v1/auth/me`;

function setup(over: Partial<ReturnType<typeof makeMe>> = {}) {
  const me = makeMe({ is_email_verified: true, telegram_available: true, ...over });
  server.use(http.get(ME, () => HttpResponse.json(me)));
  renderWithProviders(<NotificationSettings me={me} />);
  return me;
}

describe('NotificationSettings', () => {
  it('saves the email choice', async () => {
    const bodies: unknown[] = [];
    const me = makeMe({ is_email_verified: true });
    server.use(
      http.patch(ME, async ({ request }) => {
        const body = await request.json();
        bodies.push(body);
        return HttpResponse.json({ ...me, notify_email: false });
      }),
    );
    setup();
    await userEvent.click(screen.getByRole('switch', { name: 'Elektron pochta' }));
    await waitFor(() => expect(bodies).toEqual([{ notify_email: false }]));
  });

  it('says emails wait for a confirmed address', () => {
    setup({ is_email_verified: false });
    expect(screen.getByText(/pochtangizni tasdiqlaganingizdan/)).toBeVisible();
  });

  it('hides Telegram when the platform has no bot', () => {
    setup({ telegram_available: false });
    expect(screen.queryByRole('switch', { name: 'Telegram' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Telegramni ulash' })).toBeNull();
  });

  it('offers the deep link after asking for it', async () => {
    const url = 'https://t.me/skillproof_bot?start=abc';
    server.use(http.post(`${ME}/telegram`, () => HttpResponse.json({ url })));
    setup();
    expect(screen.getByRole('switch', { name: 'Telegram' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Telegramni ulash' }));
    const open = await screen.findByRole('link', { name: 'Telegramda ochish' });
    expect(open).toHaveAttribute('href', url);
    expect(open).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('disconnects a linked chat', async () => {
    let deleted = false;
    server.use(
      http.delete(`${ME}/telegram`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    setup({ telegram_linked: true });
    await userEvent.click(screen.getByRole('button', { name: 'Uzish' }));
    await waitFor(() => expect(deleted).toBe(true));
  });

  it('shows an error when linking fails', async () => {
    server.use(
      http.post(`${ME}/telegram`, () =>
        HttpResponse.json(envelope('telegram_unavailable'), { status: 503 }),
      ),
    );
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Telegramni ulash' }));
    expect(await screen.findByRole('alert')).toBeVisible();
  });
});
