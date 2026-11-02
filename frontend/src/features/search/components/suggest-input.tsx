'use client';

import { Briefcase, Building2, Search, Sparkles } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useState, type ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import { defaultSuggestSource, type Suggestion, type SuggestSource } from '../suggest';

const kindIcon = { vacancy: Briefcase, skill: Sparkles, company: Building2 } as const;

interface SuggestInputProps extends Omit<ComponentProps<'input'>, 'onChange' | 'value' | 'size'> {
  value: string;
  onValueChange: (value: string) => void;
  /** Picking a suggestion submits the search. */
  onPick?: (suggestion: Suggestion) => void;
  source?: SuggestSource;
  size?: 'md' | 'lg';
}

/**
 * ARIA 1.2 combobox (list autocomplete). With the empty source the listbox never opens,
 * so it behaves as a plain search input.
 */
export function SuggestInput({
  value,
  onValueChange,
  onPick,
  source = defaultSuggestSource,
  size = 'md',
  className,
  ...inputProps
}: SuggestInputProps) {
  const t = useTranslations('search');
  const locale = useLocale();
  const listId = useId();
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const query = value.trim();

  useEffect(() => {
    if (query.length < source.minLength) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      source
        .suggest(query, { locale, signal: controller.signal })
        .then((result) => {
          setItems(result);
          setActive(-1);
        })
        .catch(() => setItems([])); // Suggestions are optional; never block search.
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, locale, source]);

  const visible = open && query.length >= source.minLength && items.length > 0;

  const pick = (s: Suggestion) => {
    onValueChange(s.label);
    setOpen(false);
    onPick?.(s);
  };

  return (
    <div className="relative">
      <Search
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted',
          size === 'lg' ? 'size-5' : 'size-4',
        )}
      />
      <input
        {...inputProps}
        type="search"
        role="combobox"
        autoComplete="off"
        enterKeyHint="search"
        aria-autocomplete="list"
        aria-expanded={visible}
        aria-controls={listId}
        aria-activedescendant={visible && active >= 0 ? `${listId}-${active}` : undefined}
        value={value}
        onChange={(e) => {
          onValueChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (!visible) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => (i + 1) % items.length);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
          } else if (e.key === 'Enter' && active >= 0) {
            e.preventDefault();
            pick(items[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        className={cn(
          'w-full min-w-0 rounded-lg border border-input bg-surface pr-3 text-base text-fg outline-none placeholder:text-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30',
          size === 'lg' ? 'h-13 pl-11' : 'h-11 pl-10',
          className,
        )}
      />
      <ul
        id={listId}
        role="listbox"
        aria-label={t('suggestionsLabel')}
        hidden={!visible}
        className="absolute inset-x-0 top-full z-50 mt-1 max-h-80 overflow-auto rounded-xl border border-border bg-surface p-1.5 shadow-lg"
      >
        {items.map((s, i) => {
          const Icon = kindIcon[s.kind];
          return (
            <li
              key={`${s.kind}-${s.label}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown, not click: fires before the input's blur closes the list.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              className={cn(
                'flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm',
                i === active ? 'bg-surface-2' : 'hover:bg-surface-2',
              )}
            >
              <Icon aria-hidden="true" className="size-4 shrink-0 text-muted" />
              <span className="flex-1 truncate">{s.label}</span>
              <span className="text-xs text-muted">{t(`kinds.${s.kind}`)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
