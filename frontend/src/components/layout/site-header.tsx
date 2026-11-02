import { useTranslations } from 'next-intl';
import { appConfig } from '@/config/app';
import { AccountMenu } from '@/features/auth';
import { Link } from '@/i18n/navigation';
import { HeaderSearchButton, HeaderSearchInline } from './header-search';
import { LanguageSwitcher } from './language-switcher';
import { LogoMark } from './logo-mark';
import { PostVacancyLink } from './post-vacancy-link';
import { ThemeToggle } from './theme-toggle';

/**
 * hh.uz-style structure (D-016): logo · search (query + region + button) · post vacancy · account.
 * < lg: logo + search icon (sheet); < md: account and sections move to the bottom bar.
 */
export function SiteHeader() {
  const t = useTranslations('nav');

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/95 backdrop-blur supports-[backdrop-filter]:bg-bg/85">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:gap-5">
        <Link
          href="/"
          aria-label={t('home', { appName: appConfig.name })}
          className="-ml-1 flex min-h-11 shrink-0 items-center gap-2.5 rounded-md px-1"
        >
          <LogoMark />
          <span className="font-display text-xl font-semibold tracking-tight">
            {appConfig.name}
          </span>
        </Link>

        <div className="hidden min-w-0 flex-1 lg:block">
          <HeaderSearchInline />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1 lg:ml-0">
          <div className="lg:hidden">
            <HeaderSearchButton />
          </div>
          <PostVacancyLink className="mr-1 hidden md:inline-flex" />
          <div className="mr-1 hidden xl:block">
            <LanguageSwitcher />
          </div>
          <div className="hidden md:block">
            <ThemeToggle />
          </div>
          <div className="hidden md:block">
            <AccountMenu />
          </div>
        </div>
      </div>
    </header>
  );
}
