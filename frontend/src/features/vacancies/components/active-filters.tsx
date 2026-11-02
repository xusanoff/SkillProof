'use client';

import { X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import {
  localizedName,
  useProfessionAreas,
  useRegionLabel,
  useSkillName,
} from '@/features/catalog';
import { formatAmount, currencyUnit, type SalaryTranslator } from '@/lib/money';
import {
  activeChips,
  removeChip,
  resetFilters,
  type FilterChip,
  type VacancyFilters,
} from '../model';

/** Removable chips for the applied filters + "reset" (hh shows them above the results). */
export function ActiveFilters({
  filters,
  onChange,
}: {
  filters: VacancyFilters;
  onChange: (next: VacancyFilters) => void;
}) {
  const t = useTranslations('vacancies.chips');
  const tf = useTranslations('vacancies.filters');
  const chips = activeChips(filters);
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ul aria-label={t('label')} className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <li key={chipKey(chip)}>
            <Chip chip={chip} onRemove={() => onChange(removeChip(filters, chip))} />
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => onChange(resetFilters(filters))}
        className="min-h-9 px-2 text-sm font-medium text-accent hover:underline"
      >
        {tf('reset')}
      </button>
    </div>
  );
}

function chipKey(chip: FilterChip): string {
  return 'value' in chip ? `${chip.key}:${chip.value}` : chip.key;
}

function Chip({ chip, onRemove }: { chip: FilterChip; onRemove: () => void }) {
  const t = useTranslations('vacancies.chips');
  const label = useChipLabel(chip);
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={t('remove', { label })}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border-strong bg-surface py-1 pr-2 pl-3 text-sm text-fg hover:border-fg"
    >
      {label}
      <X aria-hidden="true" className="size-4 text-muted" />
    </button>
  );
}

function useChipLabel(chip: FilterChip): string {
  const t = useTranslations('vacancies.chips');
  const tv = useTranslations('vacancy');
  const ts = useTranslations('salary');
  const locale = useLocale();
  const regionLabel = useRegionLabel();
  const areas = useProfessionAreas();
  const skillName = useSkillName(chip.key === 'skill' ? chip.value : '');
  switch (chip.key) {
    case 'region':
      return regionLabel(chip.value) ?? chip.value;
    case 'remote_type':
      return tv(`remoteType.${chip.value}` as 'remoteType.office');
    case 'employment_type':
      return tv(`employmentType.${chip.value}` as 'employmentType.full_time');
    case 'experience_level':
      return tv(`experience.${chip.value}` as 'experience.no_experience');
    case 'salary_from':
      return t('salaryFrom', {
        amount: formatAmount(chip.value, locale),
        currency: currencyUnit(chip.currency, ts as unknown as SalaryTranslator),
      });
    case 'only_with_salary':
      return t('onlyWithSalary');
    case 'profession_area': {
      const area = areas.data?.find((a) => a.slug === chip.value);
      return area ? localizedName(area.names, locale, chip.value) : chip.value;
    }
    case 'skill':
      return skillName;
  }
}
