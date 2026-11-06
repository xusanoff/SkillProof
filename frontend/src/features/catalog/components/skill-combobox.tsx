'use client';

import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useDeferredValue, useId, useState } from 'react';
import { cn } from '@/lib/utils';
import { useSkillSearch } from '../api';
import type { Skill } from '../model';

interface SkillComboboxProps {
  id?: string;
  /** Accessible name when there is no visible <label for>. */
  label?: string;
  /** Skills already picked (hidden from the list). */
  excludeIds?: readonly string[];
  excludeSlugs?: readonly string[];
  onSelect: (skill: Skill) => void;
  disabled?: boolean;
  placeholder?: string;
  describedBy?: string;
  className?: string;
}

/**
 * Skill autocomplete over `GET /api/v1/skills?q=` (ARIA 1.2 combobox, list autocomplete).
 * Picking clears the input so several skills can be added in a row.
 */
export function SkillCombobox({
  id,
  label,
  excludeIds = [],
  excludeSlugs = [],
  onSelect,
  disabled,
  placeholder,
  describedBy,
  className,
}: SkillComboboxProps) {
  const t = useTranslations('catalog');
  const listId = useId();
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const query = useDeferredValue(value.trim());
  const search = useSkillSearch(query);
  const items = (search.data ?? []).filter(
    (s) => !excludeIds.includes(s.id) && !excludeSlugs.includes(s.slug),
  );
  const visible = open && query.length > 0;

  const pick = (skill: Skill) => {
    onSelect(skill);
    setValue('');
    setActive(-1);
  };

  return (
    <div className={cn('relative', className)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
      />
      <input
        id={id}
        type="text"
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={visible}
        aria-controls={listId}
        aria-describedby={describedBy}
        aria-activedescendant={visible && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder ?? t('skillPlaceholder')}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setActive(-1);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (!visible || items.length === 0) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => (i + 1) % items.length);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            pick(items[Math.max(0, active)]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        className="h-11 w-full min-w-0 rounded-lg border border-input bg-surface pr-3 pl-9 text-base text-fg outline-none placeholder:text-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"
      />
      <ul
        id={listId}
        role="listbox"
        aria-label={t('skillSuggestions')}
        hidden={!visible}
        className="sp-card absolute inset-x-0 top-full z-50 mt-1 max-h-64 overflow-auto p-1.5 shadow-[var(--shadow-pop)]"
      >
        {items.map((skill, i) => (
          <li
            key={skill.id}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            onMouseDown={(e) => {
              e.preventDefault();
              pick(skill);
            }}
            className={cn(
              'flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 text-sm',
              i === active ? 'bg-surface-2' : 'hover:bg-surface-2',
            )}
          >
            <span className="truncate">{skill.name}</span>
            <span className="shrink-0 text-xs text-muted">{skill.category}</span>
          </li>
        ))}
        {items.length === 0 ? (
          <li role="presentation" className="px-3 py-2.5 text-sm text-muted">
            {search.isFetching ? t('searching') : t('noSkills')}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
