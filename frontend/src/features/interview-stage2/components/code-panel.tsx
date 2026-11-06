import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { codeRows, type Turn } from '../model';

/** The candidate's own code, read-only, the lines the question is about marked. Plain `<pre>`, no editor. */
export function CodePanel({ code }: { code: NonNullable<Turn['code']> }) {
  const t = useTranslations('stage2.room');
  const rows = codeRows(code.code, code.lines);
  return (
    <section aria-labelledby="own-code-h" className="grid gap-2">
      <h2 id="own-code-h" className="text-sm font-semibold">
        {t('ownCode')}
        <span className="ml-2 font-normal text-muted">{code.language}</span>
      </h2>
      <pre
        tabIndex={0}
        aria-label={t('ownCodeLabel')}
        className="max-h-72 overflow-auto rounded-lg border border-border bg-surface py-2 font-mono text-sm leading-6"
      >
        <code className="block min-w-max">
          {rows.map((r) => (
            <span
              key={r.n}
              className={cn(
                'flex border-l-4 px-3',
                r.marked ? 'border-accent bg-accent-soft' : 'border-transparent',
              )}
            >
              <span
                aria-hidden="true"
                className="w-8 shrink-0 pr-3 text-right tabular-nums text-muted select-none"
              >
                {r.n}
              </span>
              <span className="whitespace-pre">{r.text || ' '}</span>
              {r.marked ? <span className="sr-only"> ({t('markedLine')})</span> : null}
            </span>
          ))}
        </code>
      </pre>
    </section>
  );
}
