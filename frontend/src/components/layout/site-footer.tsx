import { useTranslations } from 'next-intl';
import { appConfig } from '@/config/app';
import { Link } from '@/i18n/navigation';
import { LanguageSwitcher } from './language-switcher';
import { LogoMark } from './logo-mark';
import { ThemeToggle } from './theme-toggle';

export function SiteFooter() {
  const t = useTranslations('footer');

  return (
    <footer className="mt-auto border-t border-border">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <LogoMark className="size-6" />
          <p className="text-sm text-muted">
            <span className="font-display font-semibold text-fg">{appConfig.name}</span>{' '}
            {t('tagline')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link
            href="/status"
            className="inline-flex min-h-11 items-center text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
          >
            {t('status')}
          </Link>
          {/* The header shows these from md / xl; the footer always has them. */}
          <div className="xl:hidden">
            <LanguageSwitcher />
          </div>
          <div className="md:hidden">
            <ThemeToggle />
          </div>
        </div>
      </div>
    </footer>
  );
}
