'use client';

import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { formatAmount } from '@/lib/money';
import type { FacetOption } from '../model';

interface FacetGroupProps<T extends string> {
  legend: string;
  options: FacetOption<T>[];
  label: (value: T) => string;
  onToggle: (value: T) => void;
  locale: string;
  /** Collapse after this many (selected ones always stay visible). */
  limit?: number;
}

/** A fieldset of checkboxes with facet counts ("Toshkent shahri 128"), hh-style. */
export function FacetGroup<T extends string>({
  legend,
  options,
  label,
  onToggle,
  locale,
  limit,
}: FacetGroupProps<T>) {
  const t = useTranslations('vacancies.filters');
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const hidden = limit && !expanded ? options.slice(limit).filter((o) => !o.selected) : [];
  const visible = hidden.length ? options.filter((o, i) => i < limit! || o.selected) : options;

  return (
    <fieldset className="grid gap-1">
      <legend className="mb-1.5 text-sm font-semibold">{legend}</legend>
      <ul id={`${id}-list`} className="grid">
        {visible.map((o) => {
          const inputId = `${id}-${o.value}`;
          const empty = o.count === 0 && !o.selected;
          return (
            <li key={o.value}>
              <label
                htmlFor={inputId}
                className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md text-sm"
              >
                <Checkbox id={inputId} checked={o.selected} onChange={() => onToggle(o.value)} />
                <span className={empty ? 'flex-1 text-muted' : 'flex-1'}>{label(o.value)}</span>
                {o.count !== null ? (
                  <span className="tabular-nums text-xs text-muted">
                    {formatAmount(o.count, locale)}
                  </span>
                ) : null}
              </label>
            </li>
          );
        })}
      </ul>
      {limit && (expanded || hidden.length > 0) ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={`${id}-list`}
          onClick={() => setExpanded((v) => !v)}
          className="min-h-10 justify-self-start text-sm font-medium text-accent hover:underline"
        >
          {expanded ? t('showLess') : t('showMore', { count: hidden.length })}
        </button>
      ) : null}
    </fieldset>
  );
}
