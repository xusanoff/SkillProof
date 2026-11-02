'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { useFieldArray, type Control, type UseFormRegister } from 'react-hook-form';
import { FieldError } from '@/components/common/field';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { SkillCombobox } from '@/features/catalog';
import { SKILLS_MAX, type VacancyValues } from '../model';

const WEIGHTS = [1, 2, 3, 4, 5] as const;

/**
 * Skills with weight (1–5) and a "required" flag, at most 20 (docs/API.md).
 * Autocomplete over the global skills dictionary.
 */
export function SkillsPicker({
  control,
  register,
  error,
}: {
  control: Control<VacancyValues>;
  register: UseFormRegister<VacancyValues>;
  error?: string;
}) {
  const t = useTranslations('vacancyForm');
  const id = useId();
  const { fields, append, remove } = useFieldArray({ control, name: 'skills', keyName: 'key' });
  const full = fields.length >= SKILLS_MAX;

  return (
    <fieldset className="grid gap-3" aria-describedby={`${id}-hint`}>
      <legend className="text-sm font-medium">{t('skills')}</legend>
      <p id={`${id}-hint`} className="-mt-1 text-sm text-muted">
        {t('skillsHint', { max: SKILLS_MAX })}
      </p>
      <Label htmlFor={`${id}-search`} className="sr-only">
        {t('addSkill')}
      </Label>
      <SkillCombobox
        id={`${id}-search`}
        excludeIds={fields.map((f) => f.skill_id)}
        disabled={full}
        placeholder={full ? t('skillsFull', { max: SKILLS_MAX }) : t('addSkill')}
        onSelect={(s) => append({ skill_id: s.id, name: s.name, weight: 3, is_required: false })}
      />
      {fields.length === 0 ? (
        <p className="text-sm text-muted">{t('noSkills')}</p>
      ) : (
        <ul className="grid gap-2">
          {fields.map((f, i) => (
            <li
              key={f.key}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-lg border border-border p-2.5 pl-3 sm:grid-cols-[minmax(0,1fr)_7.5rem_auto_auto]"
            >
              <span className="truncate font-medium">{f.name}</span>
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={t('removeSkill', { skill: f.name })}
                className="inline-flex size-11 items-center justify-center justify-self-end rounded-lg text-muted hover:bg-surface-2 hover:text-fg sm:order-last"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted">{t('weight')}</span>
                <NativeSelect
                  aria-label={t('weightOf', { skill: f.name })}
                  className="w-16"
                  {...register(`skills.${i}.weight`, { valueAsNumber: true })}
                >
                  {WEIGHTS.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-5 accent-accent"
                  aria-label={t('requiredOf', { skill: f.name })}
                  {...register(`skills.${i}.is_required`)}
                />
                <span aria-hidden="true">{t('required')}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {error ? <FieldError>{error}</FieldError> : null}
    </fieldset>
  );
}
