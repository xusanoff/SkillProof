'use client';

import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Suspense, useState } from 'react';
import { Dialog, DialogTitle, DialogTopSheet, DialogTrigger } from '@/components/ui/dialog';
import { SearchForm } from '@/features/search';
import { usePathname } from '@/i18n/navigation';

/** The home page has its own, larger search — don't duplicate it in the header. */
function useShowHeaderSearch() {
  return usePathname() !== '/';
}

export function HeaderSearchInline() {
  return (
    <Suspense>
      <HeaderSearchInlineInner />
    </Suspense>
  );
}

function HeaderSearchInlineInner() {
  if (!useShowHeaderSearch()) return null;
  return <SearchForm idPrefix="header-search" className="w-full max-w-3xl" />;
}

/** Below `lg`: a search icon that opens the same form in a top sheet. */
export function HeaderSearchButton() {
  return (
    <Suspense>
      <HeaderSearchButtonInner />
    </Suspense>
  );
}

function HeaderSearchButtonInner() {
  const t = useTranslations('search');
  const tc = useTranslations('common');
  const [open, setOpen] = useState(false);
  const show = useShowHeaderSearch();
  if (!show) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={t('open')}
          className="inline-flex size-11 items-center justify-center rounded-lg text-fg hover:bg-surface-2"
        >
          <Search aria-hidden="true" className="size-5" />
        </button>
      </DialogTrigger>
      <DialogTopSheet closeLabel={tc('close')} aria-describedby={undefined}>
        <DialogTitle className="mb-3 pr-12 text-lg font-semibold">{t('label')}</DialogTitle>
        <MobileSearchForm />
      </DialogTopSheet>
    </Dialog>
  );
}

function MobileSearchForm() {
  return <SearchForm idPrefix="sheet-search" size="lg" />;
}
