'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { AccountMenu } from '@/features/auth';
import { Link } from '@/i18n/navigation';
import { LogoMark } from './logo-mark';
import { LanguageSwitcher } from './language-switcher';
import { ThemeToggle } from './theme-toggle';
import { HeaderSearchButton } from './header-search';
import { Button } from '@/components/ui/button';

export function WorkspaceFrame({
  sidebar,
  children,
  hr = false,
}: {
  sidebar: ReactNode;
  children: ReactNode;
  hr?: boolean;
}) {
  const t = useTranslations('nav');
  return (
    <div
      data-workspace
      className="grid min-h-dvh w-full min-w-0 lg:grid-cols-[240px_minmax(0,1fr)]"
    >
      <aside className="sp-workspace-sidebar min-w-0 bg-dark-panel p-4 text-dark-text lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto lg:p-5">
        <Link
          href="/"
          aria-label={t('home', { appName: 'SkillProof' })}
          className="mb-6 flex min-h-11 items-center gap-2.5 text-lg font-bold"
        >
          <LogoMark className="rounded-lg bg-signal [&_path]:stroke-dark-panel [&_rect]:fill-signal" />
          SkillProof
        </Link>
        {sidebar}
      </aside>
      <div className="min-w-0">
        <div className="flex min-h-20 flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3 sm:px-7">
          <HeaderSearchButton />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {hr ? (
              <Button asChild className="px-4">
                <Link href="/hr/vacancies/new">+ {t('postVacancy')}</Link>
              </Button>
            ) : null}
            <div className="hidden xl:block">
              <LanguageSwitcher />
            </div>
            <ThemeToggle />
            <AccountMenu />
          </div>
        </div>
        <div className="mx-auto grid w-full max-w-[1440px] min-w-0 content-start gap-5 p-4 sm:p-7">
          {children}
        </div>
        <div className="border-t border-border bg-surface p-4 xl:hidden">
          <LanguageSwitcher />
        </div>
      </div>
    </div>
  );
}
