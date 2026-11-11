import type { components } from '@/lib/api/schema';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { expect, it, vi } from 'vitest';
import { API, server } from '@/test/msw';
import { makeMe } from '@/test/fixtures';
import { renderWithProviders } from '@/test/render';
import { ChatPage } from './chat-page';
vi.mock(
  '@/i18n/navigation',
  async () => (await import('@/test/navigation-mock')).i18nNavigationMock,
);
it('preserves a failed message and retries with the same idempotency key after rejection', async () => {
  const me = makeMe({ role: 'candidate' });
  let attempts = 0;
  const ids: string[] = [];
  const items: components['schemas']['MessageOut'][] = [
    {
      id: 'm1',
      sequence: 1,
      sender_id: null,
      kind: 'status',
      text: null,
      application_status: 'rejected',
      created_at: '2026-11-09T10:00:00Z',
    },
  ];
  server.use(
    http.get(`${API}/api/v1/auth/me`, () => HttpResponse.json(me)),
    http.get(`${API}/api/v1/chat/threads/a1/messages`, () =>
      HttpResponse.json({
        thread: {
          application_id: 'a1',
          company_name: 'Acme',
          vacancy_title: 'Engineer',
          candidate_name: 'Candidate',
          candidate_id: me.id,
          company_id: 'c1',
          cover_note: null,
          unread_count: 1,
          application_status: 'rejected',
          last_message: items.at(-1),
        },
        items,
        has_more: false,
      }),
    ),
    http.post(`${API}/api/v1/chat/threads/a1/read`, () => new HttpResponse(null, { status: 204 })),
    http.post(`${API}/api/v1/chat/threads/a1/messages`, async ({ request }) => {
      const b = (await request.json()) as { text: string; client_id: string };
      ids.push(b.client_id);
      if (++attempts === 1)
        return HttpResponse.json(
          { error: { code: 'internal_error', message: 'failed' } },
          { status: 503 },
        );
      const row = {
        id: 'm2',
        sequence: 2,
        sender_id: me.id,
        kind: 'message' as const,
        text: b.text,
        application_status: null,
        created_at: '2026-11-09T10:01:00Z',
      };
      items.push(row);
      return HttpResponse.json(row, { status: 201 });
    }),
  );
  renderWithProviders(<ChatPage applicationId="a1" />);
  const user = userEvent.setup();
  const input = await screen.findByLabelText('Xabaringizni yozing');
  await user.type(input, 'Can you share feedback?');
  await user.click(screen.getByRole('button', { name: 'Yuborish' }));
  await screen.findByText('Xabar yuborilmadi. Matn saqlandi; qayta urinib ko‘ring.');
  expect(input).toHaveValue('Can you share feedback?');
  await user.click(screen.getByRole('button', { name: 'Yuborish' }));
  await waitFor(() => expect(input).toHaveValue(''));
  expect(await screen.findByText('Can you share feedback?')).toBeInTheDocument();
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
});
