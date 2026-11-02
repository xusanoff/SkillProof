import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Tone = 'info' | 'success' | 'warning' | 'danger';

const toneStyle: Record<Tone, string> = {
  info: 'border-accent/25 bg-accent-soft text-fg [&>svg]:text-accent',
  success: 'border-success/30 bg-success-soft text-fg [&>svg]:text-success',
  warning: 'border-warning/30 bg-warning-soft text-fg [&>svg]:text-warning',
  danger: 'border-danger/30 bg-danger-soft text-fg [&>svg]:text-danger',
};
const icons = { info: Info, success: CircleCheck, warning: TriangleAlert, danger: CircleAlert };

/**
 * Inline message: colour + icon + text. `role` is set by the caller
 * ("alert" for errors after an action, "status" for confirmations).
 */
export function Notice({
  tone = 'info',
  title,
  children,
  role,
  className,
  action,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  role?: 'alert' | 'status';
  className?: string;
  action?: ReactNode;
}) {
  const Icon = icons[tone];
  return (
    <div
      role={role}
      className={cn('flex gap-3 rounded-lg border p-3.5 text-sm', toneStyle[tone], className)}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="grid min-w-0 flex-1 gap-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className="text-fg/85">{children}</div> : null}
        {action ? <div className="mt-1.5 flex flex-wrap gap-2">{action}</div> : null}
      </div>
    </div>
  );
}
