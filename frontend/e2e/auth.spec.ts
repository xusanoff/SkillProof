import { expect, test } from '@playwright/test';
import { envelope, expectNoSeriousA11y, me, mockApi, type MockRoute } from './utils';

const EMPTY_LIST: MockRoute = {
  method: 'GET',
  path: '/vacancies',
  body: { items: [], total: 0, page: 1, page_size: 20, facets: null },
};

/** Phase 1 flows with the API mocked in the browser (page.route) — no backend needed. */

test('anonymous user is sent to login with ?next= from a protected page', async ({ page }) => {
  await mockApi(page, []);
  await page.goto('/uz/candidate/profile');
  await expect(page).toHaveURL(/\/uz\/login\?next=%2Fcandidate%2Fprofile$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Kirish' })).toBeVisible();
});

test('login → back to next → header shows the account menu', async ({ page }) => {
  let signedIn = false;
  const user = me();
  await mockApi(page, [
    { method: 'GET', path: '/auth/me', status: 401, body: envelope('unauthorized') },
    {
      method: 'POST',
      path: '/auth/login',
      body: user,
      onRequest: () => (signedIn = true),
    },
    {
      method: 'GET',
      path: '/candidate/profile',
      body: { currency: 'UZS', open_to_work: true, resume: null, headline: null },
    },
  ]);
  await page.goto('/uz/login?next=%2Fcandidate%2Fprofile');
  await expectNoSeriousA11y(page);
  await page.getByLabel('Elektron pochta').fill('aziza@example.com');
  await page.getByLabel('Parol', { exact: true }).fill('secret-pass');
  await page.getByRole('button', { name: 'Kirish', exact: true }).click();

  await expect(page).toHaveURL(/\/uz\/candidate\/profile$/);
  expect(signedIn).toBe(true);
  await expect(page.getByRole('heading', { level: 1, name: 'Mening rezyumem' })).toBeVisible();
  await page.getByRole('button', { name: 'Hisob menyusi: Aziza Karimova' }).click();
  await expect(page.getByRole('menuitem', { name: 'Arizalarim' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Chiqish' })).toBeVisible();
});

test('wrong credentials show a message and stay on the page', async ({ page }) => {
  await mockApi(page, [
    { method: 'POST', path: '/auth/login', status: 401, body: envelope('invalid_credentials') },
  ]);
  await page.goto('/ru/login');
  await page.getByLabel('Электронная почта').fill('a@example.com');
  await page.getByLabel('Пароль', { exact: true }).fill('wrong-pass');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('form', { name: 'Вход' }).getByRole('alert')).toHaveText(
    'Неверная почта или пароль.',
  );
  await expect(page).toHaveURL(/\/ru\/login$/);
});

test('register as HR → create-company form', async ({ page }) => {
  let sent: Record<string, unknown> = {};
  const hr = me({ role: 'hr', is_email_verified: false, email: 'hr@acme.uz' });
  await mockApi(page, [
    {
      method: 'POST',
      path: '/auth/register',
      status: 201,
      body: hr,
      onRequest: (b) => (sent = b as Record<string, unknown>),
    },
  ]);
  await page.goto('/en/register');
  await expectNoSeriousA11y(page);
  await page.getByText("I'm hiring").click(); // the card is the label
  await expect(page.getByRole('radio', { name: /I'm hiring/ })).toBeChecked();
  await page.getByLabel('Full name').fill('Olim Owner');
  await page.getByLabel('Email').fill('hr@acme.uz');
  await page.getByLabel('Password', { exact: true }).fill('long-enough-1');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/en\/hr$/);
  expect(sent).toMatchObject({ role: 'hr', locale: 'en', email: 'hr@acme.uz' });
  await expect(page.getByRole('heading', { level: 1, name: 'Add your company' })).toBeVisible();
  // Unverified email → banner with resend.
  await expect(page.getByRole('region', { name: 'Email confirmation' })).toContainText(
    'hr@acme.uz',
  );
});

test('candidate opening the HR area sees a 403 state', async ({ page }) => {
  await mockApi(page, [{ method: 'GET', path: '/auth/me', body: me() }]);
  await page.goto('/uz/hr/team');
  await expect(
    page.getByRole('heading', { level: 1, name: "Bu bo'lim siz uchun emas" }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: "O'z bo'limimga o'tish" })).toHaveAttribute(
    'href',
    '/uz/candidate/profile',
  );
});

test('owner manages the team: members, invite, pending invitation', async ({ page }) => {
  const owner = me({
    id: 'u-1',
    role: 'hr',
    full_name: 'Olim Owner',
    companies: [{ id: 'c-1', name: 'Acme', slug: 'acme', member_role: 'owner' }],
  });
  let invited: unknown = null;
  await mockApi(page, [
    { method: 'GET', path: '/auth/me', body: owner },
    {
      method: 'GET',
      path: '/companies/c-1/members',
      body: [
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
      ],
    },
    { method: 'GET', path: '/companies/c-1/invitations', body: [] },
    {
      method: 'POST',
      path: '/companies/c-1/invitations',
      status: 201,
      onRequest: (b) => (invited = b),
      body: {
        id: 'i-1',
        email: 'new@acme.uz',
        member_role: 'hr',
        invited_by_name: 'Olim Owner',
        created_at: '2026-10-30T09:00:00Z',
        expires_at: '2026-11-06T09:00:00Z',
      },
    },
  ]);
  await page.goto('/uz/hr/team');
  await expect(page.getByText('Hilola HR')).toBeVisible();
  await expectNoSeriousA11y(page);

  await page.getByLabel('Elektron pochta').fill('new@acme.uz');
  await page.getByRole('button', { name: 'Taklif yuborish' }).click();
  await expect(page.getByText('new@acme.uz manziliga taklif yuborildi.')).toBeVisible();
  expect(invited).toEqual({ email: 'new@acme.uz' });

  await page.getByRole('button', { name: 'Hilola HRni jamoadan chiqarish' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Hilola HR jamoadan chiqarilsinmi?');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog')).toBeHidden();
});

test('invitation page: anonymous visitor gets login/register links that come back', async ({
  page,
}) => {
  await mockApi(page, [
    {
      method: 'GET',
      path: '/invitations/tok-123',
      body: {
        company: { name: 'Acme', slug: 'acme', logo_url: null },
        email: 'new@acme.uz',
        status: 'pending',
      },
    },
  ]);
  await page.goto('/uz/invitations/tok-123');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Acme jamoasiga taklif' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Kirish', exact: true }).last()).toHaveAttribute(
    'href',
    '/uz/login?next=%2Finvitations%2Ftok-123',
  );
  await expect(page.getByRole('link', { name: 'Hisob yaratish' })).toHaveAttribute(
    'href',
    /role=hr&email=new%40acme\.uz&next=%2Finvitations%2Ftok-123/,
  );
});

test('invitation page: signed in with another email explains the mismatch', async ({ page }) => {
  await mockApi(page, [
    { method: 'GET', path: '/auth/me', body: me({ role: 'hr', email: 'other@acme.uz' }) },
    {
      method: 'GET',
      path: '/invitations/tok-123',
      body: {
        company: { name: 'Acme', slug: 'acme', logo_url: null },
        email: 'new@acme.uz',
        status: 'pending',
      },
    },
  ]);
  await page.goto('/en/invitations/tok-123');
  await expect(page.getByText("You're signed in to another account")).toBeVisible();
  await expect(page.getByText(/other@acme\.uz.*new@acme\.uz/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept invitation' })).toHaveCount(0);
});

test('invitation page: matching HR user accepts and lands in the dashboard', async ({ page }) => {
  let accepted = false;
  const hr = me({ role: 'hr', email: 'new@acme.uz' });
  await mockApi(page, [
    { method: 'GET', path: '/auth/me', body: hr },
    {
      method: 'GET',
      path: '/invitations/tok-123',
      body: {
        company: { name: 'Acme', slug: 'acme', logo_url: null },
        email: 'new@acme.uz',
        status: 'pending',
      },
    },
    {
      method: 'POST',
      path: '/invitations/tok-123/accept',
      onRequest: () => (accepted = true),
      body: {
        id: 'c-1',
        name: 'Acme',
        slug: 'acme',
        description: null,
        website: null,
        industry: null,
        country: 'UZ',
        city: null,
        logo_url: null,
        is_verified: false,
        created_at: '2026-10-01T09:00:00Z',
        member_role: 'hr',
      },
    },
  ]);
  await page.goto('/uz/invitations/tok-123');
  await page.getByRole('button', { name: 'Taklifni qabul qilish' }).click();
  await expect(page).toHaveURL(/\/uz\/hr$/);
  expect(accepted).toBe(true);
});

test.describe('phone', () => {
  test.use({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });

  test('header collapses to logo + search icon; bottom bar navigates', async ({ page }) => {
    await mockApi(page, [EMPTY_LIST]);
    await page.goto('/uz/status');
    const bottom = page.getByRole('navigation', { name: "Tezkor bo'limlar" });
    await expect(bottom).toBeVisible();
    await expect(bottom.getByRole('link')).toHaveCount(4);
    await expect(bottom.getByRole('link', { name: 'Profil' })).toHaveAttribute('href', '/uz/login');

    await page.getByRole('button', { name: 'Qidiruvni ochish' }).click();
    const sheet = page.getByRole('dialog', { name: 'Vakansiya qidirish' });
    await sheet.locator('input[name="q"]').fill('python');
    await sheet.getByRole('button', { name: 'Qidirish' }).click();
    await expect(page).toHaveURL(/\/uz\/vacancies\?q=python&region=$/);
    await expect(
      page.getByRole('heading', { level: 1, name: "«python» bo'yicha 0 ta vakansiya" }),
    ).toBeVisible();

    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(360);
  });
});

test('home hero: search with region and quick filter chips', async ({ page }) => {
  await mockApi(page, [EMPTY_LIST]);
  await page.goto('/uz');
  const hero = page.getByRole('search', { name: 'Vakansiya qidirish' });
  await expect(hero).toHaveCount(1); // the header search is hidden on the home page
  await expect(page.getByRole('link', { name: 'Masofaviy' })).toHaveAttribute(
    'href',
    '/uz/vacancies?remote_type=remote',
  );
  await hero.locator('input[name="q"]').fill('frontend');
  await hero.getByLabel('Hudud').selectOption('UZ-SA');
  await hero.getByRole('button', { name: 'Qidirish' }).click();
  await expect(page).toHaveURL(/\/uz\/vacancies\?q=frontend&region=UZ-SA$/);
  await expect(
    page.getByRole('heading', { level: 1, name: "«frontend» bo'yicha 0 ta vakansiya" }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '«Samarqand» filtrini olib tashlash' }),
  ).toBeVisible();
});
