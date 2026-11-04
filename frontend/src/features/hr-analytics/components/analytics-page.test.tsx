import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { ActiveCompanyProvider } from '@/features/companies';
import { makeMe } from '@/test/fixtures';
import { API, server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { AnalyticsPage } from './analytics-page';

vi.mock(
  '@/i18n/navigation',
  async () => (await import('@/test/navigation-mock')).i18nNavigationMock,
);
vi.mock('next/navigation', async () => (await import('@/test/navigation-mock')).nextNavigationMock);

const funnel = {
  applied: 4,
  stage1_started: 2,
  stage1_passed: 1,
  stage2_started: 0,
  stage2_passed: 0,
  shortlisted: 0,
  hired: 0,
  stage1_pass_rate: 50,
  stage2_pass_rate: null,
  avg_stage1_score: 70,
  avg_stage2_score: null,
  avg_overall_score: null,
};

function setup(total: typeof funnel) {
  const me = makeMe({
    role: 'hr',
    companies: [
      {
        id: 'c-1',
        name: 'Acme',
        slug: 'acme',
        member_role: 'owner',
        blocked: false,
        block_reason: null,
      },
    ],
  });
  server.use(
    http.get(`${API}/api/v1/auth/me`, () => HttpResponse.json(me)),
    http.get(`${API}/api/v1/companies/c-1/analytics`, () =>
      HttpResponse.json({
        days: 90,
        total,
        median_hours_to_shortlist: null,
        vacancies: [{ vacancy_id: 'v-1', title: 'Backend', funnel: total }],
      }),
    ),
  );
  renderWithProviders(
    <ActiveCompanyProvider>
      <AnalyticsPage />
    </ActiveCompanyProvider>,
  );
}

describe('AnalyticsPage', () => {
  it('states each funnel step in numbers', async () => {
    setup(funnel);
    const step = await screen.findByRole('list');
    expect(step).toHaveTextContent('Ariza berdi');
    expect(step).toHaveTextContent('100%');
    expect(step).toHaveTextContent('50%');
    expect(screen.getByRole('rowheader', { name: 'Backend' })).toBeVisible();
  });

  it('shows no rate as a dash, not as zero', async () => {
    setup(funnel);
    await screen.findByRole('list');
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('says so when there are no applications', async () => {
    setup({ ...funnel, applied: 0 });
    expect(await screen.findByText("Bu davrda ariza yo'q.")).toBeVisible();
  });
});
