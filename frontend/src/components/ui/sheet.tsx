'use client';

import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Dialog surfaces (design-system §4): Radix traps focus, Esc closes, focus returns.
 * - `responsive`: bottom sheet on phones, centred modal from `sm`.
 * - `fullscreen`: full-screen panel on phones (filters), right panel from `sm`.
 */
const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetTitle = DialogPrimitive.Title;
const SheetDescription = DialogPrimitive.Description;

const variants = {
  responsive:
    'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl border p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:p-6',
  fullscreen: 'inset-0 sm:inset-y-0 sm:right-0 sm:left-auto sm:w-full sm:max-w-md sm:border-l',
} as const;

function SheetContent({
  className,
  children,
  closeLabel,
  variant = 'responsive',
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  closeLabel: string;
  variant?: keyof typeof variants;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-fg/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        className={cn(
          'fixed z-50 flex flex-col overflow-y-auto border-border bg-surface text-fg shadow-[var(--shadow-pop)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0',
          variants[variant],
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label={closeLabel}
          className={cn(
            'absolute inline-flex size-11 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg',
            variant === 'fullscreen' ? 'top-1.5 right-1.5' : 'top-2 right-2',
          )}
        >
          <X aria-hidden="true" className="size-5" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger };
