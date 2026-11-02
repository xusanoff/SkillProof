import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  title: string;
  description?: string;
  /** Extra line such as a request ID. */
  meta?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  retrying?: boolean;
  headingLevel?: 1 | 2 | 3;
  className?: string;
  children?: ReactNode;
}

/** Error = colour + icon + text (never colour alone). */
export function ErrorState({
  title,
  description,
  meta,
  onRetry,
  retryLabel,
  retrying,
  headingLevel = 2,
  className,
  children,
}: ErrorStateProps) {
  const Heading = `h${headingLevel}` as const;

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col gap-4 rounded-xl border border-danger/30 bg-danger-soft p-5 sm:flex-row sm:p-6',
        className,
      )}
    >
      <CircleAlert aria-hidden="true" className="size-6 shrink-0 text-danger" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Heading className="text-lg font-semibold text-fg">{title}</Heading>
        {description ? <p className="max-w-prose text-fg/80">{description}</p> : null}
        {meta ? <p className="text-sm text-muted">{meta}</p> : null}
        {onRetry || children ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {onRetry && retryLabel ? (
              <Button
                size="lg"
                className="min-h-11 px-4"
                onClick={onRetry}
                disabled={retrying}
                aria-busy={retrying || undefined}
              >
                {retryLabel}
              </Button>
            ) : null}
            {children}
          </div>
        ) : null}
      </div>
    </div>
  );
}
