import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { vi } from 'vitest';

/** Shared spies for `@/i18n/navigation` + `next/navigation` mocks in component tests. */
export const nav = {
  replace: vi.fn(),
  push: vi.fn(),
  pathname: '/',
  search: new URLSearchParams(),
};

type Href = string | { pathname: string; query?: Record<string, string> };

export function hrefToString(href: Href): string {
  if (typeof href === 'string') return href;
  const q = new URLSearchParams(href.query ?? {}).toString();
  return q ? `${href.pathname}?${q}` : href.pathname;
}

export const i18nNavigationMock = {
  Link: ({
    href,
    children,
    ...rest
  }: { href: Href; children: ReactNode } & Omit<
    AnchorHTMLAttributes<HTMLAnchorElement>,
    'href'
  >) => (
    <a href={hrefToString(href)} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ replace: nav.replace, push: nav.push }),
  usePathname: () => nav.pathname,
  getPathname: ({ href, locale }: { href: string; locale: string }) => `/${locale}${href}`,
  redirect: vi.fn(),
};

export const nextNavigationMock = {
  useSearchParams: () => nav.search,
  useParams: () => ({}),
};

export function resetNav(pathname = '/', search = '') {
  nav.replace.mockReset();
  nav.push.mockReset();
  nav.pathname = pathname;
  nav.search = new URLSearchParams(search);
}
