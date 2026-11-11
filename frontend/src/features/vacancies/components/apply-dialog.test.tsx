import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { envelope, makeVacancy } from '@/test/fixtures';
import { API, server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { ApplyDialog } from './apply-dialog';

vi.mock(
  '@/i18n/navigation',
  async () => (await import('@/test/navigation-mock')).i18nNavigationMock,
);

const APPLY = `${API}/api/v1/vacancies/v-1/apply`;

function open() {
  renderWithProviders(<ApplyDialog vacancy={makeVacancy()} open onOpenChange={() => {}} />);
}

describe('ApplyDialog', () => {
  it('sends the cover note once (double click) and shows the server status', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post(APPLY, async ({ request }) => {
        bodies.push(await request.json());
        await delay(30);
        return HttpResponse.json(
          {
            id: 'a-1',
            status: 'applied',
            cover_note: 'Salom',
            created_at: '2026-10-30T09:00:00Z',
            updated_at: '2026-10-30T09:00:00Z',
            vacancy: makeVacancy(),
          },
          { status: 201 },
        );
      }),
    );
    open();
    const user = userEvent.setup();
    expect(screen.getByText(/ikki bosqichli suhbatni/)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Qo'shimcha xat/), 'Salom');
    await user.dblClick(screen.getByRole('button', { name: 'Ariza yuborish' }));

    expect(await screen.findByRole('heading', { name: 'Ariza yuborildi' })).toBeInTheDocument();
    expect(bodies).toEqual([{ cover_note: 'Salom' }]);
    expect(screen.getByRole('link', { name: "Arizalarimga o'tish" })).toHaveAttribute(
      'href',
      '/candidate/applications',
    );
  });

  it('already_applied → treated as applied', async () => {
    server.use(
      http.post(APPLY, () => HttpResponse.json(envelope('already_applied'), { status: 409 })),
    );
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Ariza yuborish' }));
    expect(
      await screen.findByText('Siz bu vakansiyaga allaqachon ariza bergansiz'),
    ).toBeInTheDocument();
  });

  it('vacancy_not_open → explains and blocks resubmitting', async () => {
    server.use(
      http.post(APPLY, () => HttpResponse.json(envelope('vacancy_not_open'), { status: 409 })),
    );
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Ariza yuborish' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Bu vakansiya bo'yicha arizalar qabul qilinmayapti.",
    );
    expect(screen.getByRole('button', { name: 'Ariza yuborish' })).toBeDisabled();
  });
});
