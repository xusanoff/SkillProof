import { cn } from '@/lib/utils';

export type ScoreTone = 'high' | 'mid' | 'low';

const toneText: Record<ScoreTone, string> = {
  high: 'text-score-high',
  mid: 'text-score-mid',
  low: 'text-score-low',
};
const toneBar: Record<ScoreTone, string> = {
  high: 'bg-score-high',
  mid: 'bg-score-mid',
  low: 'bg-score-low',
};

interface ScoreMeterProps {
  label: string;
  /** 0–100, as computed by the server. */
  value: number;
  /** Band decided by the server (thresholds are configurable there, never on the client). */
  tone: ScoreTone;
  /** Pre-formatted, locale-aware percentage, e.g. "86%". */
  formatted: string;
  className?: string;
}

/** Percentage score: label + number + bar. The number carries the meaning, colour supports it. */
export function ScoreMeter({ label, value, tone, formatted, className }: ScoreMeterProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div className={cn('grid gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-muted">{label}</span>
        <span className={cn('text-lg font-semibold tabular-nums', toneText[tone])}>
          {formatted}
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        aria-valuetext={formatted}
        className="h-1.5 overflow-hidden rounded-full bg-surface-2"
      >
        <div
          className={cn('h-full rounded-full', toneBar[tone])}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
