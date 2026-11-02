import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

/** Server-provided application status → label + tone (text always present, not colour alone). */
const TONE: Record<string, string> = {
  applied: 'border-accent/25 bg-accent-soft text-fg',
  shortlisted: 'border-success/30 bg-success-soft text-fg',
  hired: 'border-success/30 bg-success-soft text-fg',
  rejected: 'border-danger/30 bg-danger-soft text-fg',
  withdrawn: 'border-border bg-surface-2 text-muted',
};
const DOT: Record<string, string> = {
  applied: 'bg-accent',
  shortlisted: 'bg-success',
  hired: 'bg-success',
  rejected: 'bg-danger',
  withdrawn: 'bg-border-strong',
};

export function ApplicationStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const t = useTranslations('applicationStatus');
  const key = (t.has(status as 'applied') ? status : 'other') as 'applied';
  return (
    <span
      className={cn(
        'inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap',
        TONE[status] ?? 'border-warning/30 bg-warning-soft text-fg',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn('size-1.5 rounded-full', DOT[status] ?? 'bg-warning')}
      />
      {t(key)}
    </span>
  );
}
