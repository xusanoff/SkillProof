'use client';

import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent, type ReactNode } from 'react';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { Pagination } from '@/components/common/pagination';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { usePathname } from '@/i18n/navigation';
import { useErrorText } from '@/lib/forms';
import { ADMIN_PAGE_SIZE, type ListQuery } from '../api';

interface PageLike<T> {
  data?: { items: T[]; total: number };
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

export function useListQuery() {
  const [query, setQuery] = useState<ListQuery>({ q: '', page: 1 });
  return { query, setQuery };
}

/** Shared frame of the admin lists: heading, search, states, pagination. */
export function AdminList<T extends { id: string }>({
  title,
  query,
  setQuery,
  list,
  renderItem,
}: {
  title: string;
  query: ListQuery;
  setQuery: (next: ListQuery) => void;
  list: PageLike<T>;
  renderItem: (item: T) => ReactNode;
}) {
  const t = useTranslations('admin.list');
  const errorText = useErrorText();
  const [draft, setDraft] = useState(query.q);
  const pathname = usePathname();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setQuery({ q: draft, page: 1 });
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <h1 className="sp-page-title">{title}</h1>
      <form role="search" onSubmit={onSubmit} className="flex gap-2">
        <Input
          aria-label={t('search')}
          placeholder={t('search')}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={200}
        />
        <Button type="submit" variant="outline" size="lg" className="min-h-11 gap-2">
          <Search aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">{t('searchButton')}</span>
        </Button>
      </form>
      {list.isError && !list.data ? (
        <ErrorState
          title={t('loadFailed')}
          description={errorText(list.error)}
          onRetry={() => void list.refetch()}
        />
      ) : !list.data ? (
        <div className="grid gap-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : list.data.items.length === 0 ? (
        <EmptyState icon={Search} title={t('empty')} />
      ) : (
        <>
          <p className="text-sm text-muted" aria-live="polite">
            {t('total', { count: list.data.total })}
          </p>
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">
            {list.data.items.map((item) => (
              <li key={item.id}>{renderItem(item)}</li>
            ))}
          </ul>
          <Pagination
            pathname={pathname}
            page={query.page}
            totalPages={Math.ceil(list.data.total / ADMIN_PAGE_SIZE)}
            onPageChange={(page) => setQuery({ ...query, page })}
          />
        </>
      )}
    </div>
  );
}

export function RowCard({ children }: { children: ReactNode }) {
  return (
    <div className="sp-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      {children}
    </div>
  );
}
