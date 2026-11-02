import * as React from 'react';
import { cn } from '@/lib/utils';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'min-h-28 w-full rounded-lg border border-input bg-surface px-3 py-2.5 text-base transition-colors outline-none placeholder:text-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
