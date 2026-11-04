'use client';

import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export interface TabLink {
  key: string;
  label: string;
  href: string;
  count?: number | null;
}

/**
 * Status tabs as links (the filter lives in the URL). `aria-current` marks the active one.
 * Scrolls horizontally on phones.
 */
export function TabLinks({
  label,
  items,
  active,
  className,
}: {
  label: string;
  items: TabLink[];
  active: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn('-mx-4 min-w-0 border-b border-border sm:mx-0', className)}>
      <ul className="flex gap-1 overflow-x-auto px-4 sm:px-0">
        {items.map((item) => {
          const current = item.key === active;
          return (
            <li key={item.key} className="shrink-0">
              <Link
                href={item.href}
                scroll={false}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  '-mb-px flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium whitespace-nowrap',
                  current ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg',
                )}
              >
                {item.label}
                {typeof item.count === 'number' ? (
                  <span
                    className={cn(
                      'rounded-full px-1.5 text-xs tabular-nums',
                      current ? 'bg-fg text-bg' : 'bg-surface-2 text-muted',
                    )}
                  >
                    {item.count}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
