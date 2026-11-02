'use client';

import { SlidersHorizontal } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { formatAmount } from '@/lib/money';
import { useVacancyList } from '../api';
import { countActive, resetFilters, type VacancyFilters } from '../model';
import { FiltersPanel } from './filters-panel';

/**
 * Phones: "Filtrlar (n)" opens a full-screen sheet. Changes are a draft whose result
 * count is fetched live; "N ta vakansiyani ko'rsatish" applies them to the URL.
 */
export function FilterSheet({
  filters,
  onApply,
}: {
  filters: VacancyFilters;
  onApply: (next: VacancyFilters) => void;
}) {
  const t = useTranslations('vacancies.filters');
  const tc = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(filters);
  const active = countActive(filters);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(filters);
        setOpen(next);
      }}
    >
      <SheetTrigger asChild>
        <Button variant="outline" size="lg" className="min-h-11 gap-2 px-4">
          <SlidersHorizontal aria-hidden="true" />
          {active ? t('openCount', { count: active }) : t('open')}
        </Button>
      </SheetTrigger>
      <SheetContent variant="fullscreen" closeLabel={tc('close')} aria-describedby={undefined}>
        {open ? (
          <DraftFilters
            draft={draft}
            setDraft={setDraft}
            onApply={() => {
              onApply(draft);
              setOpen(false);
            }}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function DraftFilters({
  draft,
  setDraft,
  onApply,
}: {
  draft: VacancyFilters;
  setDraft: (f: VacancyFilters) => void;
  onApply: () => void;
}) {
  const t = useTranslations('vacancies.filters');
  const locale = useLocale();
  const list = useVacancyList(draft);
  const total = list.data?.total;

  return (
    <>
      <div className="sticky top-0 z-10 border-b border-border bg-surface px-4 py-3.5 pr-14">
        <SheetTitle className="text-lg font-semibold">{t('title')}</SheetTitle>
      </div>
      <div className="flex-1 px-4 py-5">
        <FiltersPanel
          filters={draft}
          facets={list.data?.facets}
          onChange={setDraft}
          idPrefix="sheet-filters"
        />
      </div>
      <div className="sticky bottom-0 grid grid-cols-[auto_minmax(0,1fr)] gap-2 border-t border-border bg-surface p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button
          variant="ghost"
          size="lg"
          className="min-h-12 px-3"
          onClick={() => setDraft(resetFilters(draft))}
        >
          {t('resetShort')}
        </Button>
        <Button
          size="lg"
          className="min-h-12 px-4 text-base"
          onClick={onApply}
          aria-busy={list.isFetching || undefined}
        >
          {total === undefined
            ? t('applyNoCount')
            : t('apply', { total, count: formatAmount(total, locale) })}
        </Button>
      </div>
    </>
  );
}
