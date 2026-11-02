import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { makeMe, makeVacancy } from '@/test/fixtures';
import { API, server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { useVacancy } from '../api';
import type { VacancyDetail } from '../model';
import { ApplyAction } from './apply-action';

vi.mock(
  '@/i18n/navigation',
  async () => (await import('@/test/navigation-mock')).i18nNavigationMock,
);

const detail = {
  ...makeVacancy({ viewer: { is_saved: false, application_status: null } }),
  description: 'x',
  requirements: null,
  profession_area: 'it',
  country: 'UZ',
  status: 'published',
  skills: [],
  applications_count: null,
} as VacancyDetail;

function FromCache() {
  const { data } = useVacancy('v-1');
  return data ? <ApplyAction vacancy={data} /> : null;
}

describe('ApplyAction', () => {
  // Regression: the status flip to "applied" unmounted the dialog before its success view.
  it('keeps the dialog open with the success view after applying', async () => {
    server.use(
      http.get(`${API}/api/v1/auth/me`, () => HttpResponse.json(makeMe())),
      http.get(`${API}/api/v1/vacancies/v-1`, () => HttpResponse.json(detail)),
      http.post(`${API}/api/v1/vacancies/v-1/apply`, () =>
        HttpResponse.json(
          {
            id: 'a-1',
            status: 'applied',
            cover_note: null,
            created_at: '2026-10-30T09:00:00Z',
            updated_at: '2026-10-30T09:00:00Z',
            vacancy: makeVacancy(),
          },
          { status: 201 },
        ),
      ),
    );
    renderWithProviders(<FromCache />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Ariza berish' }));
    await user.click(screen.getByRole('button', { name: 'Ariza yuborish' }));
    expect(await screen.findByRole('dialog', { name: 'Ariza yuborildi' })).toBeInTheDocument();
    // Behind the dialog the trigger now reflects the server status.
    expect(screen.getByRole('link', { name: 'Ariza yuborildi', hidden: true })).toBeInTheDocument();
  });
});
