'use client';

import { Plus, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useRef, type ReactNode } from 'react';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { Notice } from '@/components/common/notice';
import { Pagination } from '@/components/common/pagination';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from '@/i18n/navigation';
import { useErrorText } from '@/lib/forms';
import { pageCount } from '@/lib/pagination';
import { cn } from '@/lib/utils';
import { BANK_PAGE_SIZE, type BankFilters } from '../api';
import { filtersToQuery, parseFilters } from '../model';
import { BankFiltersBar } from './bank-filters';

interface ListLike<T> {
  data?: { items: T[]; total: number };
  isError: boolean;
  error: unknown;
  isFetching: boolean;
  isPlaceholderData: boolean;
  refetch: () => unknown;
}

/** Shared frame of both banks: header, URL filters, list states, pagination, inline editor slot. */
export function useBankFilters(pathname: string) {
  const params = useSearchParams();
  const router = useRouter();
  const filters = parseFilters(new URLSearchParams(params.toString()));
  const setFilters = (next: BankFilters) => {
    const qs = filtersToQuery(next);
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };
  return { filters, setFilters };
}

export function BankShell<T extends { id: string }>({
  pathname,
  title,
  newLabel,
  icon,
  emptyTitle,
  list,
  filters,
  setFilters,
  editor,
  notice,
  onNew,
  renderItem,
}: {
  pathname: string;
  title: string;
  newLabel: string;
  icon: LucideIcon;
  emptyTitle: string;
  list: ListLike<T>;
  filters: BankFilters;
  setFilters: (next: BankFilters) => void;
  editor: ReactNode;
  notice: string | null;
  onNew: () => void;
  renderItem: (item: T) => ReactNode;
}) {
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const editorRef = useRef<HTMLDivElement>(null);
  const query = filtersToQuery({ ...filters, page: 1 });

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <Button
          size="lg"
          className="min-h-11 gap-2 px-4"
          onClick={() => {
            onNew();
            requestAnimationFrame(() => editorRef.current?.scrollIntoView({ block: 'start' }));
          }}
        >
          <Plus aria-hidden="true" />
          {newLabel}
        </Button>
      </div>

      <div aria-live="polite" className="empty:hidden">
        {notice ? (
          <Notice tone="success" role="status">
            {notice}
          </Notice>
        ) : null}
      </div>

      <div ref={editorRef} className="scroll-mt-4 empty:hidden">
        {editor}
      </div>

      <BankFiltersBar key={filters.q} filters={filters} onChange={setFilters} />

      {list.isError && !list.data ? (
        <ErrorState
          title={errorText(list.error)}
          onRetry={() => list.refetch()}
          retryLabel={tc('retry')}
          retrying={list.isFetching}
        />
      ) : !list.data ? (
        <div className="grid gap-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : list.data.items.length === 0 ? (
        <EmptyState icon={icon} title={emptyTitle} />
      ) : (
        <>
          <ul className={cn('grid gap-2', list.isPlaceholderData && 'opacity-60')}>
            {list.data.items.map((item) => (
              <li key={item.id}>{renderItem(item)}</li>
            ))}
          </ul>
          <Pagination
            page={filters.page}
            totalPages={pageCount(list.data.total, BANK_PAGE_SIZE)}
            pathname={pathname}
            query={query}
          />
        </>
      )}
    </div>
  );
}
