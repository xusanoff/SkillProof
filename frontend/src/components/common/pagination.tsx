'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { MouseEvent } from 'react';
import { Link } from '@/i18n/navigation';
import { pageItems } from '@/lib/pagination';
import { cn } from '@/lib/utils';

interface PaginationProps {
  page: number;
  totalPages: number;
  /** Locale-less path, e.g. `/vacancies`. */
  pathname: string;
  /** Current query without `page` (kept on every link). */
  query?: string;
  /** Client-side paging (no navigation). Links still have real hrefs (SEO, new tab). */
  onPageChange?: (page: number) => void;
  className?: string;
}

/** Numbered pages, hh-style. Hidden when there is a single page. */
export function Pagination({
  page,
  totalPages,
  pathname,
  query = '',
  onPageChange,
  className,
}: PaginationProps) {
  const t = useTranslations('pagination');
  if (totalPages <= 1) return null;

  const href = (p: number) => {
    const params = new URLSearchParams(query);
    params.delete('page');
    if (p > 1) params.set('page', String(p));
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };
  const onClick = (p: number) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (!onPageChange || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    onPageChange(p);
  };
  const cell =
    'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-3 text-sm font-medium tabular-nums';

  return (
    <nav aria-label={t('label')} className={cn('flex justify-center', className)}>
      <ul className="flex flex-wrap items-center justify-center gap-1">
        {page > 1 ? (
          <li>
            <Link
              href={href(page - 1)}
              onClick={onClick(page - 1)}
              rel="prev"
              className={cn(cell, 'gap-1 text-fg hover:bg-surface-2')}
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
              <span className="max-sm:sr-only">{t('prev')}</span>
            </Link>
          </li>
        ) : null}
        {pageItems(page, totalPages).map((item, i) =>
          item === 'gap' ? (
            <li key={`gap-${i}`} aria-hidden="true" className="px-1 text-muted">
              …
            </li>
          ) : (
            <li key={item}>
              {item === page ? (
                <span
                  aria-current="page"
                  className={cn(cell, 'bg-fg text-bg')}
                  aria-label={t('page', { page: item })}
                >
                  {item}
                </span>
              ) : (
                <Link
                  href={href(item)}
                  onClick={onClick(item)}
                  aria-label={t('page', { page: item })}
                  className={cn(
                    cell,
                    'border border-border text-fg hover:border-border-strong hover:bg-surface-2',
                  )}
                >
                  {item}
                </Link>
              )}
            </li>
          ),
        )}
        {page < totalPages ? (
          <li>
            <Link
              href={href(page + 1)}
              onClick={onClick(page + 1)}
              rel="next"
              className={cn(cell, 'gap-1 text-fg hover:bg-surface-2')}
            >
              <span className="max-sm:sr-only">{t('next')}</span>
              <ChevronRight aria-hidden="true" className="size-4" />
            </Link>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
