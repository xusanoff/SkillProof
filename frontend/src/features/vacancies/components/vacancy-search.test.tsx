import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { envelope, makeMe, makePage, makeVacancy } from '@/test/fixtures';
import { API, server } from '@/test/msw';
import { resetNav } from '@/test/navigation-mock';
import { renderWithProviders } from '@/test/render';
import { VacancySearch } from './vacancy-search';

vi.mock(
  '@/i18n/navigation',
  async () => (await import('@/test/navigation-mock')).i18nNavigationMock,
);
vi.mock('next/navigation', async () => (await import('@/test/navigation-mock')).nextNavigationMock);

const V1 = `${API}/api/v1`;

function catalog() {
  return [
    http.get(`${V1}/regions`, () =>
      HttpResponse.json([
        {
          code: 'UZ-TK',
          country: 'UZ',
          names: { uz: 'Toshkent shahri', ru: 'Ташкент', en: 'Tashkent' },
        },
      ]),
    ),
    http.get(`${V1}/profession-areas`, () =>
      HttpResponse.json([{ slug: 'it', names: { uz: 'IT', ru: 'IT', en: 'IT' } }]),
    ),
  ];
}

describe('VacancySearch', () => {
  let pushState: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    resetNav('/vacancies', 'q=python');
    pushState = vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
  });
  afterEach(() => pushState.mockRestore());

  it('renders the server page and puts filter changes into the URL', async () => {
    server.use(
      ...catalog(),
      http.get(`${V1}/auth/me`, () => HttpResponse.json(envelope('unauthorized'), { status: 401 })),
      http.post(`${V1}/auth/refresh`, () => HttpResponse.json(envelope('x'), { status: 401 })),
    );
    const page = makePage([makeVacancy()]);
    renderWithProviders(<VacancySearch initial={{ params: 'q=python', data: page }} />);

    expect(
      screen.getByRole('heading', { level: 1, name: "«python» bo'yicha 1 ta vakansiya" }),
    ).toBeInTheDocument();
    const user = userEvent.setup();
    const filters = screen.getByRole('complementary', { name: 'Filtrlar' });
    await user.click(within(filters).getByRole('checkbox', { name: /Masofaviy/ }));
    expect(pushState).toHaveBeenLastCalledWith(null, '', '?q=python&remote_type=remote');

    await user.click(within(filters).getByRole('checkbox', { name: /Toshkent shahri/ }));
    expect(pushState).toHaveBeenLastCalledWith(null, '', '?q=python&region=UZ-TK');

    await user.selectOptions(screen.getByLabelText('Saralash'), 'salary_desc');
    expect(pushState).toHaveBeenLastCalledWith(null, '', '?q=python&sort=salary_desc');
  });

  it('save toggle is optimistic and rolls back when the API fails', async () => {
    resetNav('/vacancies', '');
    let calls = 0;
    server.use(
      ...catalog(),
      http.get(`${V1}/auth/me`, () => HttpResponse.json(makeMe())),
      // Candidates get their own list with `viewer`.
      http.get(`${V1}/vacancies`, () =>
        HttpResponse.json(
          makePage([makeVacancy({ viewer: { is_saved: false, application_status: null } })]),
        ),
      ),
      http.put(`${V1}/candidate/saved-vacancies/v-1`, async () => {
        calls += 1;
        await delay(50);
        return HttpResponse.json(envelope('internal_error'), { status: 500 });
      }),
    );
    renderWithProviders(<VacancySearch initial={null} />);

    const heart = await screen.findByRole('button', {
      name: '«Python backend dasturchi» vakansiyasini saqlash',
    });
    expect(heart).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(heart);
    // Optimistic: pressed before the server answers…
    expect(heart).toHaveAttribute('aria-pressed', 'true');
    // …rolled back after the 500, with a message.
    await waitFor(() => expect(heart).toHaveAttribute('aria-pressed', 'false'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Saqlanmadi');
    expect(calls).toBe(1);
  });

  it('shows the empty state with suggestions', async () => {
    resetNav('/vacancies', 'q=cobol&remote_type=remote');
    server.use(
      ...catalog(),
      http.get(`${V1}/auth/me`, () => HttpResponse.json(envelope('unauthorized'), { status: 401 })),
      http.post(`${V1}/auth/refresh`, () => HttpResponse.json(envelope('x'), { status: 401 })),
    );
    renderWithProviders(
      <VacancySearch
        initial={{ params: 'q=cobol&remote_type=remote', data: makePage([], { facets: null }) }}
      />,
    );
    expect(
      screen.getByRole('heading', { name: "«cobol» bo'yicha hech narsa topilmadi" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Filtrlarni tozalash' }).at(-1)!);
    expect(pushState).toHaveBeenLastCalledWith(null, '', '?q=cobol');
  });
});
