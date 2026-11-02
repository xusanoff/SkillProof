import { useTranslations } from 'next-intl';
import { QUICK_FILTERS } from '@/data/quick-filters';
import { Link } from '@/i18n/navigation';

/** Quick filter chips → the vacancy list with one filter applied. Horizontal scroll on phones. */
export function QuickFilters() {
  const t = useTranslations('search.chips');
  return (
    <nav aria-label={t('label')} className="-mx-4 sm:mx-0">
      <ul className="flex gap-2 overflow-x-auto px-4 pb-1 sm:flex-wrap sm:overflow-visible sm:px-0">
        {QUICK_FILTERS.map(({ key, params }) => (
          <li key={key} className="shrink-0">
            <Link
              href={{ pathname: '/vacancies', query: params }}
              className="inline-flex min-h-11 items-center rounded-full border border-border-strong bg-surface px-4 text-sm font-medium text-fg transition-colors hover:border-accent hover:text-accent"
            >
              {t(key)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
