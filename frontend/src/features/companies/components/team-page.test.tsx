import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { authKeys } from '@/features/auth';
import { makeMe } from '@/test/fixtures';
import { API, server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { ActiveCompanyProvider } from '../active-company';
import { TeamPage } from './team-page';

vi.mock(
  '@/i18n/navigation',
  async () => (await import('@/test/navigation-mock')).i18nNavigationMock,
);
vi.mock('next/navigation', async () => (await import('@/test/navigation-mock')).nextNavigationMock);

const CID = 'c-1';
const members = [
  {
    user_id: 'u-1',
    email: 'owner@acme.uz',
    full_name: 'Olim Owner',
    member_role: 'owner',
    joined_at: '2026-10-01T09:00:00Z',
  },
  {
    user_id: 'u-2',
    email: 'hr@acme.uz',
    full_name: 'Hilola HR',
    member_role: 'hr',
    joined_at: '2026-10-05T09:00:00Z',
  },
];
const invitations = [
  {
    id: 'i-1',
    email: 'new@acme.uz',
    member_role: 'hr',
    invited_by_name: 'Olim Owner',
    created_at: '2026-10-28T09:00:00Z',
    expires_at: '2026-11-04T09:00:00Z',
  },
];

function setup(role: 'owner' | 'hr', userId: string) {
  const invitationsCalled = vi.fn();
  server.use(
    http.get(`${API}/api/v1/companies/${CID}/members`, () => HttpResponse.json(members)),
    http.get(`${API}/api/v1/companies/${CID}/invitations`, () => {
      invitationsCalled();
      return HttpResponse.json(invitations);
    }),
  );
  const me = makeMe({
    id: userId,
    role: 'hr',
    companies: [{ id: CID, name: 'Acme', slug: 'acme', member_role: role }],
  });
  const { queryClient } = renderWithProviders(
    <ActiveCompanyProvider>
      <TeamPage />
    </ActiveCompanyProvider>,
    {},
  );
  queryClient.setQueryData(authKeys.me(), me);
  return { invitationsCalled };
}

describe('TeamPage', () => {
  it('owner sees remove (not for self), invite form and pending invitations', async () => {
    setup('owner', 'u-1');
    expect(await screen.findByText('Hilola HR')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Hilola HRni jamoadan chiqarish' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Olim Ownerni jamoadan chiqarish' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Xodimni taklif qilish' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Taklif yuborish' })).toBeInTheDocument();
    const pending = (await screen.findByText('new@acme.uz')).closest('li')!;
    expect(within(pending).getByRole('button', { name: /bekor qilish/ })).toBeInTheDocument();
  });

  it('plain HR member sees the list only and never requests invitations', async () => {
    const { invitationsCalled } = setup('hr', 'u-2');
    expect(await screen.findByText('Olim Owner')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /jamoadan chiqarish/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Taklif yuborish' })).not.toBeInTheDocument();
    expect(screen.queryByText('new@acme.uz')).not.toBeInTheDocument();
    expect(screen.getByText(/faqat kompaniya egasi/)).toBeInTheDocument();
    expect(invitationsCalled).not.toHaveBeenCalled();
  });
});
