import * as React from 'react';
import { cn } from '@/lib/utils';

/** Native checkbox (keyboard, forms and screen readers for free), tinted with the accent. */
function Checkbox({ className, ...props }: Omit<React.ComponentProps<'input'>, 'type'>) {
  return (
    <input
      type="checkbox"
      data-slot="checkbox"
      className={cn(
        'size-5 shrink-0 cursor-pointer rounded border-border-strong accent-accent disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Checkbox };
