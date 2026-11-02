'use client';

import { ChevronDown, LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Link, useRouter } from '@/i18n/navigation';
import { useLogout, useMe } from '../api';
import { ACCOUNT_MENU } from '../navigation';

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

/** Header right side: "Kirish" for guests, avatar menu for signed-in users. */
export function AccountMenu() {
  const t = useTranslations('nav');
  const me = useMe();
  const logout = useLogout();
  const router = useRouter();

  if (me.isPending) return <Skeleton className="h-11 w-24" aria-hidden="true" />;
  if (!me.data) {
    return (
      <Button asChild size="lg" className="min-h-11 px-4">
        <Link href="/login">{t('signIn')}</Link>
      </Button>
    );
  }

  const user = me.data;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1.5 hover:bg-surface-2"
        >
          <span
            aria-hidden="true"
            className="inline-flex size-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-fg"
          >
            {initials(user.full_name)}
          </span>
          <span className="sr-only">{t('accountMenu', { name: user.full_name })}</span>
          <ChevronDown aria-hidden="true" className="size-4 text-muted" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>
          <span className="block truncate font-medium">{user.full_name}</span>
          <span className="block truncate text-sm font-normal text-muted">{user.email}</span>
          <span className="mt-1 block text-xs font-normal text-muted">
            {t(`roles.${user.role}`)}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {ACCOUNT_MENU[user.role].map(({ href, key, icon: Icon }) => (
            <DropdownMenuItem key={key} asChild>
              <Link href={href}>
                <Icon aria-hidden="true" />
                {t(`menu.${key}` as 'menu.settings')}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={logout.isPending}
          onSelect={() => logout.mutate(undefined, { onSettled: () => router.replace('/') })}
        >
          <LogOut aria-hidden="true" />
          {t('signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
