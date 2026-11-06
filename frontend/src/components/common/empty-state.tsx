import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  headingLevel = 2,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  headingLevel?: 1 | 2 | 3;
  className?: string;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div
      className={cn(
        'sp-card flex flex-col items-start gap-4 p-6 sm:p-9',
        className,
      )}
    >
      {Icon ? <Icon aria-hidden="true" className="size-12 rounded-xl bg-accent-soft p-3 text-accent" /> : null}
      <Heading className={cn('font-semibold text-fg', headingLevel === 1 ? 'text-2xl' : 'text-lg')}>
        {title}
      </Heading>
      {description ? <div className="max-w-prose text-muted">{description}</div> : null}
      {children ? <div className="mt-1 flex flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}
