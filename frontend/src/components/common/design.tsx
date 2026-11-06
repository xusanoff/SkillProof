import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cn('sp-card', className)} {...props} />;
}

export function Chip({ className, ...props }: ComponentProps<'span'>) {
  return <span className={cn('sp-chip', className)} {...props} />;
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => Array.from(part)[0])
    .join('');
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft font-semibold text-accent',
        className,
      )}
    >
      {initials}
    </span>
  );
}

export function ProgressBar({
  value,
  label,
  className,
}: {
  value: number;
  label: string;
  className?: string;
}) {
  const percent = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={cn('h-2 overflow-hidden rounded-full bg-[var(--track)]', className)}
    >
      <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
    </div>
  );
}

export function ScoreRing({
  value,
  label,
  formatted,
  className,
}: {
  value: number | null;
  label: string;
  formatted: string;
  className?: string;
}) {
  const score = value == null ? 0 : Math.min(100, Math.max(0, value));
  const circumference = 2 * Math.PI * 42;
  return (
    <div
      role="img"
      aria-label={`${label}: ${formatted}`}
      className={cn('relative grid size-36 shrink-0 place-items-center', className)}
    >
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 size-full -rotate-90"
        aria-hidden="true"
      >
        <circle cx="50" cy="50" r="42" fill="none" stroke="var(--dark-line)" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke="var(--signal)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${(circumference * score) / 100} ${circumference}`}
        />
      </svg>
      <div aria-hidden="true" className="px-3 text-center">
        <strong className="block font-mono text-3xl font-semibold">{formatted}</strong>
        <span className="mt-1 block text-xs text-dark-muted">{label}</span>
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('sp-card p-5', className)}>
      <dt className="sp-label">{label}</dt>
      <dd className="mt-2 font-mono text-3xl font-semibold tracking-tight">{value}</dd>
    </div>
  );
}

/** Four real lifecycle states supplied by the caller; colour never carries the label alone. */
export function StageStepper({
  steps,
}: {
  steps: { label: string; complete: boolean; current?: boolean }[];
}) {
  return (
    <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {steps.map((step, index) => (
        <li
          key={step.label}
          aria-current={step.current ? 'step' : undefined}
          className="grid gap-2"
        >
          <span
            aria-hidden="true"
            className={cn(
              'h-1.5 rounded-full',
              step.complete ? 'bg-primary' : step.current ? 'bg-primary/50' : 'bg-[var(--track)]',
            )}
          />
          <span
            className={cn(
              'text-xs leading-relaxed',
              step.complete || step.current ? 'font-semibold text-fg' : 'text-muted',
            )}
          >
            <span className="mr-1.5 font-mono">{String(index + 1).padStart(2, '0')}</span>
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}
