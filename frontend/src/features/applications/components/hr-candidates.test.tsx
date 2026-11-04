import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authKeys } from '@/features/auth';
import { ActiveCompanyProvider } from '@/features/companies';
import { envelope, makeMe } from '@/test/fixtures';
import { API, server } from '@/test/msw';
import { resetNav } from '@/test/navigation-mock';
import { renderWithProviders } from '@/test/render';
import type { HrApplication } from '../model';
import { HrCandidates } from './hr-candidates';

vi.mock(
  '@/i18n/navigation',
  async () => (await import('@/test/navigation-mock')).i18nNavigationMock,
);
vi.mock('next/navigation', async () => (await import('@/test/navigation-mock')).nextNavigationMock);

const C = `${API}/api/v1/companies/c-1`;
const hr = makeMe({
  role: 'hr',
  companies: [{ id: 'c-1', name: 'Najot Soft', slug: 'najot-soft', member_role: 'owner' }],
});

function application(status: HrApplication['status']): HrApplication {
  return {
    id: 'a-1',
    status,
    cover_note: 'FastAPI bilan 3 yil ishlaganman.',
    created_at: '2026-10-29T09:00:00Z',
    updated_at: '2026-10-29T09:00:00Z',
    final_score: null,
    stage1_score: null,
    stage2_score: null,
    recommendation: null,
    needs_review: false,
    report_state: null,
    vacancy: { id: 'v-1', title: 'Python backend dasturchi' },
    candidate: {
      user_id: 'u-9',
      full_name: 'Aziza Karimova',
      email: 'aziza@example.com',
      headline: 'Python dasturchi',
      country: 'UZ',
      city: 'Toshkent',
      experience_years: 4,
      desired_salary_min: 15_000_000,
      desired_salary_max: null,
      currency: 'UZS',
      has_resume: true,
    },
  };
}

function render() {
  const ui = renderWithProviders(
    <ActiveCompanyProvider>
      <HrCandidates />
    </ActiveCompanyProvider>,
    {},
  );
  return ui;
}

describe('HrCandidates', () => {
  beforeEach(() => resetNav('/hr/candidates', 'tab=ranked&status=applied'));

  it('shortlists after the server confirms and shows the row details', async () => {
    let patched: unknown = null;
    let current: HrApplication['status'] = 'applied';
    server.use(
      http.get(`${API}/api/v1/auth/me`, () => HttpResponse.json(hr)),
      http.get(`${C}/vacancies`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, page_size: 50 }),
      ),
      http.get(`${C}/applications`, ({ request }) => {
        const status = new URL(request.url).searchParams.get('status');
        const items = status === current ? [application(current)] : [];
        return HttpResponse.json({ items, total: items.length, page: 1, page_size: 20 });
      }),
      http.patch(`${C}/applications/a-1`, async ({ request }) => {
        patched = await request.json();
        current = 'shortlisted';
        return HttpResponse.json(application('shortlisted'));
      }),
    );
    const { queryClient } = render();
    queryClient.setQueryData(authKeys.me(), hr);

    const row = await screen.findByRole('article', { name: 'Aziza Karimova' });
    expect(within(row).getByText('4 yil')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'Rezyumeni yuklab olish' })).toHaveAttribute(
      'href',
      '/api/api/v1/companies/c-1/applications/a-1/resume',
    );
    // Stage 1 not started: no numbers, no report link.
    const scores = within(row).getByRole('complementary', { name: 'Suhbat natijalari' });
    expect(scores).toHaveTextContent('Suhbat boshlanmagan');
    expect(within(scores).queryByRole('link')).not.toBeInTheDocument();

    await userEvent.click(within(row).getByRole('button', { name: 'Taklif qilish' }));
    expect(patched).toEqual({ status: 'shortlisted' });
    // The "Yangi" tab refetches and is now empty.
    expect(
      await screen.findByRole('heading', { name: "Reytingda hali nomzod yo'q" }),
    ).toBeInTheDocument();
  });

  it('shows the API error when the candidate has withdrawn', async () => {
    server.use(
      http.get(`${API}/api/v1/auth/me`, () => HttpResponse.json(hr)),
      http.get(`${C}/vacancies`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, page_size: 50 }),
      ),
      http.get(`${C}/applications`, () =>
        HttpResponse.json({ items: [application('applied')], total: 1, page: 1, page_size: 20 }),
      ),
      http.patch(`${C}/applications/a-1`, () =>
        HttpResponse.json(envelope('application_withdrawn'), { status: 409 }),
      ),
    );
    const { queryClient } = render();
    queryClient.setQueryData(authKeys.me(), hr);
    const row = await screen.findByRole('article', { name: 'Aziza Karimova' });
    await userEvent.click(within(row).getByRole('button', { name: 'Rad etish' }));
    expect(await within(row).findByRole('alert')).toHaveTextContent(
      'Nomzod arizasini qaytarib olgan.',
    );
  });
  it('shows scores with dashes for missing ones, the badge, recommendation and review mark', async () => {
    const scored: HrApplication = {
      ...application('evaluated'),
      final_score: 78.4,
      stage1_score: 81,
      stage2_score: null,
      recommendation: 'yes',
      needs_review: true,
      report_state: 'done',
      suspicion_percent: 34,
      suspicion_label: 'medium',
    };
    server.use(
      http.get(`${API}/api/v1/auth/me`, () => HttpResponse.json(hr)),
      http.get(`${C}/vacancies`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, page_size: 50 }),
      ),
      http.get(`${C}/applications`, () =>
        HttpResponse.json({ items: [scored], total: 1, page: 1, page_size: 20 }),
      ),
    );
    resetNav('/hr/candidates', 'tab=ranked');
    const { queryClient } = render();
    queryClient.setQueryData(authKeys.me(), hr);

    const row = await screen.findByRole('article', { name: 'Aziza Karimova' });
    const scores = within(row).getByRole('complementary', { name: 'Suhbat natijalari' });
    expect(scores).toHaveTextContent('78.4%');
    expect(scores).toHaveTextContent('81%');
    // No Stage 2 score: a dash, never 0%.
    expect(scores).toHaveTextContent('—');
    expect(scores).not.toHaveTextContent('0%');
    expect(scores).toHaveTextContent("O'rta");
    expect(scores).toHaveTextContent('34%');
    expect(scores).toHaveTextContent('Ha');
    expect(scores).toHaveTextContent("Ko'rib chiqish kerak");
    expect(
      within(row).getAllByRole('link', { name: /Aziza Karimova|Hisobotni ochish/ }),
    ).toHaveLength(2);
    for (const link of within(row).getAllByRole('link', {
      name: /Aziza Karimova|Hisobotni ochish/,
    })) {
      expect(link).toHaveAttribute('href', '/hr/candidates/a-1');
    }
    // Hire is offered next to shortlist / reject.
    expect(within(row).getByRole('button', { name: 'Ishga olish' })).toBeInTheDocument();
  });

  it('asks the server for the excluded tab, sorted by score, with the filters', async () => {
    let query: URLSearchParams | null = null;
    server.use(
      http.get(`${API}/api/v1/auth/me`, () => HttpResponse.json(hr)),
      http.get(`${C}/vacancies`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, page_size: 50 }),
      ),
      http.get(`${C}/applications`, ({ request }) => {
        query = new URL(request.url).searchParams;
        return HttpResponse.json({ items: [], total: 0, page: 1, page_size: 20 });
      }),
    );
    resetNav('/hr/candidates', 'tab=excluded&status=stage1_failed&min=40');
    const { queryClient } = render();
    queryClient.setQueryData(authKeys.me(), hr);

    expect(
      await screen.findByRole('heading', { name: "O'tmagan yoki chetlatilgan nomzodlar yo'q" }),
    ).toBeInTheDocument();
    expect(query!.get('tab')).toBe('excluded');
    expect(query!.get('sort')).toBe('score');
    expect(query!.get('status')).toBe('stage1_failed');
    expect(query!.get('min_score')).toBe('40');
    expect(screen.getByRole('link', { name: "O'tmagan / chetlatilgan" })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
