import { ChevronDown } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Native <select>: best on phones (OS picker), fully accessible, no JS.
 * Long option lists (countries, time zones) stay usable with type-to-jump.
 */
function NativeSelect({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <div className={cn('relative', className)}>
      <select
        data-slot="native-select"
        className="h-11 w-full appearance-none rounded-lg border border-input bg-surface py-1 pr-9 pl-3 text-base text-fg outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30"
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted"
      />
    </div>
  );
}

export { NativeSelect };
