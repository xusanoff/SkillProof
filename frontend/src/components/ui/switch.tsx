'use client';

import * as React from 'react';
import { Switch as SwitchPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 data-[state=checked]:bg-accent data-[state=unchecked]:bg-border-strong',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-5 rounded-full bg-surface shadow-sm transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0.5"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
