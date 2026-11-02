'use client';

import { useTranslations } from 'next-intl';
import { useSkillIndex } from '../api';
import { DIFFICULTIES, LANGUAGES } from '../model';

/** `<option>`s of the skills index. `empty` is the label of the "no skill" choice. */
export function SkillOptions({ empty }: { empty: string }) {
  const { data } = useSkillIndex();
  return (
    <>
      <option value="">{empty}</option>
      {(data ?? []).map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </>
  );
}

export function DifficultyOptions() {
  const t = useTranslations('hrBank');
  return (
    <>
      {DIFFICULTIES.map((d) => (
        <option key={d} value={d}>
          {t('difficultyOption', { n: d })}
        </option>
      ))}
    </>
  );
}

export function LanguageOptions() {
  const t = useTranslations('hrBank.languages');
  return (
    <>
      {LANGUAGES.map((l) => (
        <option key={l} value={l}>
          {t(l)}
        </option>
      ))}
    </>
  );
}

export function useSkillName() {
  const { data } = useSkillIndex();
  return (id: string | null | undefined) => (id ? data?.find((s) => s.id === id)?.name : undefined);
}
