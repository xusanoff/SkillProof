'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { Field } from '@/components/common/field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import type { BankFilters } from '../api';
import { SkillOptions } from './bank-fields';

/** Filters live in the URL (the page owner calls `onChange`); text search applies on submit. */
export function BankFiltersBar({
  showGlobalToggle = true,
  filters,
  onChange,
}: {
  showGlobalToggle?: boolean;
  filters: BankFilters;
  onChange: (next: BankFilters) => void;
}) {
  const t = useTranslations('hrBank.filters');
  const tb = useTranslations('hrBank');
  const [q, setQ] = useState(filters.q);
  const set = (patch: Partial<BankFilters>) => onChange({ ...filters, ...patch, page: 1 });

  return (
    <section aria-label={t('label')} className="sp-card grid gap-3 p-3 sm:p-4">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          set({ q });
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <Field label={t('q')} className="min-w-52 flex-1">
          {(c) => <Input {...c} type="search" value={q} onChange={(e) => setQ(e.target.value)} />}
        </Field>
        <Button type="submit" variant="outline" className="min-h-11 gap-1.5 px-4">
          <Search aria-hidden="true" />
          {t('search')}
        </Button>
      </form>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={tb('skill')}>
          {(c) => (
            <NativeSelect
              {...c}
              value={filters.skill_id}
              onChange={(e) => set({ skill_id: e.target.value })}
            >
              <SkillOptions empty={t('anySkill')} />
            </NativeSelect>
          )}
        </Field>
        <Field label={t('approved')}>
          {(c) => (
            <NativeSelect
              {...c}
              value={filters.approved}
              onChange={(e) => set({ approved: e.target.value as BankFilters['approved'] })}
            >
              <option value="all">{t('all')}</option>
              <option value="yes">{tb('approved')}</option>
              <option value="no">{tb('notApproved')}</option>
            </NativeSelect>
          )}
        </Field>
        <Field label={t('source')}>
          {(c) => (
            <NativeSelect
              {...c}
              value={filters.source}
              onChange={(e) => set({ source: e.target.value as BankFilters['source'] })}
            >
              <option value="all">{t('all')}</option>
              <option value="manual">{tb('source.manual')}</option>
              <option value="ai_generated">{tb('source.ai_generated')}</option>
            </NativeSelect>
          )}
        </Field>
      </div>
      {showGlobalToggle ? (
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <Checkbox
            checked={filters.include_global}
            onChange={(e) => set({ include_global: e.target.checked })}
          />
          {t('includeGlobal')}
        </label>
      ) : null}
    </section>
  );
}
