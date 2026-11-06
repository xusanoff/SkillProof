import { useTranslations } from 'next-intl';
import { appConfig } from '@/config/app';
import { AccountMenu } from '@/features/auth';
import { Link } from '@/i18n/navigation';
import { HeaderSearchButton } from './header-search';
import { LanguageSwitcher } from './language-switcher';
import { LogoMark } from './logo-mark';
import { PostVacancyLink } from './post-vacancy-link';
import { ThemeToggle } from './theme-toggle';

/** Public navigation with a search sheet available at every viewport. */
export function SiteHeader() {
  const t = useTranslations('nav');
  const home = useTranslations('home');
  const search = useTranslations('search');

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
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

        <nav
          aria-label={t('label')}
          className="hidden min-w-0 flex-1 items-center gap-5 text-sm font-medium text-muted lg:flex"
        >
          <Link href="/vacancies" className="inline-flex min-h-11 items-center hover:text-fg">
            {search('label')}
          </Link>
          <Link href="/#how-it-works" className="inline-flex min-h-11 items-center hover:text-fg">
            {home('steps.title')}
          </Link>
          <Link href="/#employers" className="inline-flex min-h-11 items-center hover:text-fg">
            {home('audience.employers.title')}
          </Link>
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1 lg:ml-0">
          <div>
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
