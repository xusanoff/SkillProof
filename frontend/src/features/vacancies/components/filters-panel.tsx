'use client';

import { X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { appConfig } from '@/config/app';
import {
  localizedName,
  SkillCombobox,
  useProfessionAreas,
  useRegionLabel,
  useRegions,
  useSkillName,
} from '@/features/catalog';
import {
  EMPLOYMENT_TYPES,
  EXPERIENCE_LEVELS,
  mergeFacets,
  REMOTE_TYPES,
  toggleValue,
  updateFilters,
  type Facets,
  type VacancyFilters,
} from '../model';
import { FacetGroup } from './facet-group';

interface FiltersPanelProps {
  filters: VacancyFilters;
  facets: Facets | null | undefined;
  onChange: (next: VacancyFilters) => void;
  /** Distinguishes ids when the sidebar and the sheet are both mounted. */
  idPrefix: string;
}

const REGION_LIMIT = 6;

/** The hh-style filter column. Every change produces new filters (the caller decides when to apply). */
export function FiltersPanel({ filters, facets, onChange, idPrefix }: FiltersPanelProps) {
  const t = useTranslations('vacancies.filters');
  const tv = useTranslations('vacancy');
  const locale = useLocale();
  const { regions } = useRegions();
  const regionLabel = useRegionLabel();
  const set = (patch: Partial<VacancyFilters>) => onChange(updateFilters(filters, patch));

  return (
    <div className="grid gap-6">
      <FacetGroup
        legend={t('region')}
        options={mergeFacets(
          regions.map((r) => r.code),
          facets?.region,
          filters.region,
          { byCount: true },
        )}
        label={(code) => regionLabel(code) ?? code}
        onToggle={(v) => set({ region: toggleValue(filters.region, v) })}
        locale={locale}
        limit={REGION_LIMIT}
      />

      <SalaryFilter filters={filters} onChange={onChange} idPrefix={idPrefix} />

      <FacetGroup
        legend={t('remoteType')}
        options={mergeFacets(REMOTE_TYPES, facets?.remote_type, filters.remote_type)}
        label={(v) => tv(`remoteType.${v}`)}
        onToggle={(v) => set({ remote_type: toggleValue(filters.remote_type, v) })}
        locale={locale}
      />
      <FacetGroup
        legend={t('employmentType')}
        options={mergeFacets(EMPLOYMENT_TYPES, facets?.employment_type, filters.employment_type)}
        label={(v) => tv(`employmentType.${v}`)}
        onToggle={(v) => set({ employment_type: toggleValue(filters.employment_type, v) })}
        locale={locale}
      />
      <FacetGroup
        legend={t('experience')}
        options={mergeFacets(EXPERIENCE_LEVELS, facets?.experience_level, filters.experience_level)}
        label={(v) => tv(`experience.${v}`)}
        onToggle={(v) => set({ experience_level: toggleValue(filters.experience_level, v) })}
        locale={locale}
      />

      <AreaFilter filters={filters} onChange={onChange} idPrefix={idPrefix} />
      <SkillsFilter filters={filters} onChange={onChange} idPrefix={idPrefix} />
    </div>
  );
}

function SalaryFilter({ filters, onChange, idPrefix }: Omit<FiltersPanelProps, 'facets'>) {
  const t = useTranslations('vacancies.filters');
  const id = `${idPrefix}-salary`;
  const [amount, setAmount] = useState(filters.salary_from ? String(filters.salary_from) : '');
  // Re-sync when the URL changes from outside (chip removed, reset).
  const [synced, setSynced] = useState(filters.salary_from);
  if (synced !== filters.salary_from) {
    setSynced(filters.salary_from);
    setAmount(filters.salary_from ? String(filters.salary_from) : '');
  }
  const apply = (currency = filters.currency) => {
    const n = Number(amount.replace(/\D/g, ''));
    onChange(updateFilters(filters, { salary_from: n > 0 ? n : null, currency }));
  };

  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1.5 text-sm font-semibold">{t('salary')}</legend>
      <form
        className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <label htmlFor={`${id}-from`} className="sr-only">
          {t('salaryFrom')}
        </label>
        <Input
          id={`${id}-from`}
          inputMode="numeric"
          enterKeyHint="done"
          placeholder={t('salaryFromPlaceholder')}
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d\s]/g, ''))}
          onBlur={() => {
            if ((Number(amount.replace(/\D/g, '')) || null) !== filters.salary_from) apply();
          }}
          className="tabular-nums"
        />
        <label htmlFor={`${id}-currency`} className="sr-only">
          {t('currency')}
        </label>
        <NativeSelect
          id={`${id}-currency`}
          value={filters.currency}
          onChange={(e) => apply(e.target.value)}
        >
          {appConfig.currencies.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </NativeSelect>
      </form>
      <label
        htmlFor={`${id}-only`}
        className="flex min-h-10 cursor-pointer items-center gap-3 text-sm"
      >
        <Checkbox
          id={`${id}-only`}
          checked={filters.only_with_salary}
          onChange={(e) => onChange(updateFilters(filters, { only_with_salary: e.target.checked }))}
        />
        {t('onlyWithSalary')}
      </label>
    </fieldset>
  );
}

function AreaFilter({ filters, onChange, idPrefix }: Omit<FiltersPanelProps, 'facets'>) {
  const t = useTranslations('vacancies.filters');
  const locale = useLocale();
  const areas = useProfessionAreas();
  const id = `${idPrefix}-area`;
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-semibold">
        {t('area')}
      </label>
      <NativeSelect
        id={id}
        value={filters.profession_area}
        onChange={(e) => onChange(updateFilters(filters, { profession_area: e.target.value }))}
      >
        <option value="">{t('anyArea')}</option>
        {(areas.data ?? []).map((a) => (
          <option key={a.slug} value={a.slug}>
            {localizedName(a.names, locale, a.slug)}
          </option>
        ))}
        {filters.profession_area && !areas.data?.some((a) => a.slug === filters.profession_area) ? (
          <option value={filters.profession_area}>{filters.profession_area}</option>
        ) : null}
      </NativeSelect>
    </div>
  );
}

function SkillsFilter({ filters, onChange, idPrefix }: Omit<FiltersPanelProps, 'facets'>) {
  const t = useTranslations('vacancies.filters');
  const id = `${idPrefix}-skills`;
  const hintId = useId();
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-semibold">
        {t('skills')}
      </label>
      <p id={hintId} className="text-xs text-muted">
        {t('skillsHint')}
      </p>
      <SkillCombobox
        id={id}
        describedBy={hintId}
        excludeSlugs={filters.skill}
        onSelect={(s) => onChange(updateFilters(filters, { skill: [...filters.skill, s.slug] }))}
      />
      {filters.skill.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {filters.skill.map((slug) => (
            <li key={slug}>
              <SkillTag
                slug={slug}
                onRemove={() =>
                  onChange(
                    updateFilters(filters, { skill: filters.skill.filter((s) => s !== slug) }),
                  )
                }
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function SkillTag({ slug, onRemove }: { slug: string; onRemove: () => void }) {
  const t = useTranslations('vacancies.chips');
  const name = useSkillName(slug);
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className="h-9 gap-1 rounded-full pr-2 pl-3"
      onClick={onRemove}
      aria-label={t('remove', { label: name })}
    >
      {name}
      <X aria-hidden="true" />
    </Button>
  );
}
