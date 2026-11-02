import { ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SuspicionLevel = 'low' | 'medium' | 'high';

const styles: Record<SuspicionLevel, string> = {
  low: 'bg-success-soft text-suspicion-low',
  medium: 'bg-warning-soft text-suspicion-medium',
  high: 'bg-danger-soft text-suspicion-high',
};
const icons = { low: ShieldCheck, medium: ShieldQuestion, high: ShieldAlert } as const;

/** Suspicion level from the server: colour + icon + text label. */
export function SuspicionBadge({
  level,
  label,
  className,
}: {
  level: SuspicionLevel;
  label: string;
  className?: string;
}) {
  const Icon = icons[level];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium',
        styles[level],
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </span>
  );
}
