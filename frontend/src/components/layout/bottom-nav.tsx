'use client';

import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import { bottomNav, isActivePath, useMe } from '@/features/auth';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/** Phone-only bottom bar (D-016). Four destinations, labels always visible. */
export function BottomNav() {
  return (
    // No active item until the path is known (dynamic routes resolve it at request time).
    <Suspense fallback={<BottomNavBar pathname="" />}>
      <BottomNavWithPath />
    </Suspense>
  );
}

function BottomNavWithPath() {
  return <BottomNavBar pathname={usePathname()} />;
}

function BottomNavBar({ pathname }: { pathname: string }) {
  const t = useTranslations('nav');
  const { data: me } = useMe();
  const items = bottomNav(me?.role ?? null);

  return (
    <nav
      aria-label={t('bottomLabel')}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-4">
        {items.map(({ href, key, icon: Icon }) => {
          const active = isActivePath(pathname, href);
          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[0.6875rem] leading-tight font-medium',
                  active ? 'text-accent' : 'text-muted hover:text-fg',
                )}
              >
                <Icon aria-hidden="true" className="size-5" />
                <span className="max-w-full truncate">{t(`menu.${key}` as 'menu.search')}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
