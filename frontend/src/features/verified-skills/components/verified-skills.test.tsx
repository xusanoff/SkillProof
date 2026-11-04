import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActiveCompanyProvider } from '@/features/companies';
import { makeMe } from '@/test/fixtures';
import { API, server } from '@/test/msw';
import { nav, resetNav } from '@/test/navigation-mock';
import { renderWithProviders } from '@/test/render';
import type { PublicProfile, VerifiedSkill } from '../model';
import { PublicProfileView } from './public-profile';
import { VerifiedSkillsPage } from './skills-page';
import { TalentSearch } from './talent-search';

vi.mock(
  '@/i18n/navigation',
  async () => (await import('@/test/navigation-mock')).i18nNavigationMock,
);
vi.mock('next/navigation', async () => (await import('@/test/navigation-mock')).nextNavigationMock);

const ID = '3f2b8c1e-1111-4222-8333-444455556666';
const skill = (o: Partial<VerifiedSkill> = {}): VerifiedSkill => ({
  id: 'v-1',
  skill_id: 's-1',
  name: 'Python',
  score: 88,
  level: 'advanced',
  verified_at: '2026-05-01T10:00:00Z',
  valid_until: '2027-05-01T10:00:00Z',
  is_public: false,
  is_valid: true,
  ...o,
});
const profile: PublicProfile = {
  candidate_id: 'u-9',
  full_name: 'Aziza Karimova',
  headline: 'Python dasturchi',
  country: 'UZ',
  city: 'Toshkent',
  experience_years: 4,
  skills: [
    {
      skill_id: 's-1',
      name: 'Python',
      score: 88,
      level: 'advanced',
      verified_at: '2026-05-01T10:00:00Z',
      valid_until: '2027-05-01T10:00:00Z',
    },
  ],
};

describe('VerifiedSkillsPage', () => {
  beforeEach(() => resetNav('/candidate/skills'));

  it('turns a skill public after the server confirms, then links to the public profile', async () => {
    let row = skill();
    let sent: unknown = null;
    server.use(
      http.get(`${API}/api/v1/auth/me`, () => HttpResponse.json(makeMe({ role: 'candidate' }))),
      http.get(`${API}/api/v1/candidate/verified-skills`, () => HttpResponse.json([row])),
      http.patch(`${API}/api/v1/candidate/verified-skills/v-1`, async ({ request }) => {
        sent = await request.json();
        row = { ...row, is_public: true };
        return HttpResponse.json(row);
      }),
    );
    renderWithProviders(<VerifiedSkillsPage />);
    const sw = await screen.findByRole('switch', { name: "Bu ko'nikmani ommaviy ko'rsatish" });
    expect(sw).not.toBeChecked();
    expect(screen.queryByRole('link', { name: /Ommaviy profilni ochish/ })).not.toBeInTheDocument();
    await userEvent.click(sw);
    await waitFor(() => expect(sent).toEqual({ is_public: true }));
    expect(
      await screen.findByRole('link', { name: /Ommaviy profilni ochish/ }),
    ).toBeInTheDocument();
  });

  it('shows an expired skill as expired and the empty state explains how to earn one', async () => {
    server.use(
      http.get(`${API}/api/v1/auth/me`, () => HttpResponse.json(makeMe({ role: 'candidate' }))),
      http.get(`${API}/api/v1/candidate/verified-skills`, () =>
        HttpResponse.json([skill({ is_valid: false, valid_until: '2026-01-01T00:00:00Z' })]),
      ),
    );
    const { unmount } = renderWithProviders(<VerifiedSkillsPage />);
    expect(await screen.findByText('01.01.2026 da muddati tugagan')).toBeInTheDocument();
    unmount();
    server.use(http.get(`${API}/api/v1/candidate/verified-skills`, () => HttpResponse.json([])));
    renderWithProviders(<VerifiedSkillsPage />);
    expect(await screen.findByText(/kamida 60%/)).toBeInTheDocument();
  });
});

describe('PublicProfileView', () => {
  it('shows name, headline, place, experience and badges, and no contact details', () => {
    renderWithProviders(<PublicProfileView profile={profile} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Aziza Karimova' })).toBeInTheDocument();
    expect(screen.getByText('Python dasturchi')).toBeInTheDocument();
    expect(screen.getByText('Toshkent, UZ')).toBeInTheDocument();
    expect(screen.getByText('Tajriba: 4 yil')).toBeInTheDocument();
    expect(screen.getByText('Python')).toBeInTheDocument();
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
  });
});

describe('TalentSearch', () => {
  const hr = makeMe({
    role: 'hr',
    companies: [{ id: 'c-1', name: 'Najot Soft', slug: 'najot-soft', member_role: 'owner' }],
  });
  const renderIt = () =>
    renderWithProviders(
      <ActiveCompanyProvider>
        <TalentSearch />
      </ActiveCompanyProvider>,
    );

  it('asks for a skill first and sends no request until there is one', async () => {
    const hit = vi.fn();
    server.use(
      http.get(`${API}/api/v1/auth/me`, () => HttpResponse.json(hr)),
      http.get(`${API}/api/v1/companies/c-1/talent`, () => {
        hit();
        return HttpResponse.json({ items: [], total: 0, page: 1, page_size: 12 });
      }),
    );
    resetNav('/hr/talent');
    renderIt();
    expect(await screen.findByText("Boshlash uchun ko'nikmalarni tanlang")).toBeInTheDocument();
    expect(hit).not.toHaveBeenCalled();
  });

  it('sends the skills and min score from the URL, lists cards with a profile link', async () => {
    let query = '';
    server.use(
      http.get(`${API}/api/v1/auth/me`, () => HttpResponse.json(hr)),
      http.get(`${API}/api/v1/companies/c-1/talent`, ({ request }) => {
        query = new URL(request.url).search;
        return HttpResponse.json({ items: [profile], total: 1, page: 1, page_size: 12 });
      }),
    );
    resetNav('/hr/talent', `skill=${ID}:Python&min=70`);
    renderIt();
    const card = (await screen.findByRole('heading', { name: 'Aziza Karimova' })).closest('li')!;
    expect(within(card).getByRole('link', { name: /Profilni ochish/ })).toHaveAttribute(
      'href',
      '/profiles/u-9',
    );
    expect(query).toContain(`skill_id=${ID}`);
    expect(query).toContain('min_score=70');
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('says so when nobody matches', async () => {
    server.use(
      http.get(`${API}/api/v1/auth/me`, () => HttpResponse.json(hr)),
      http.get(`${API}/api/v1/companies/c-1/talent`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, page_size: 12 }),
      ),
    );
    resetNav('/hr/talent', `skill=${ID}:Python`);
    renderIt();
    expect(await screen.findByText('Nomzod topilmadi')).toBeInTheDocument();
  });
});
