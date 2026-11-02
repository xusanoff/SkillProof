'use client';

import * as React from 'react';
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const AlertDialog = AlertDialogPrimitive.Root;
const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

function AlertDialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-fg/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <AlertDialogPrimitive.Content
        className={cn(
          // Phone: bottom sheet; desktop: centred modal (design-system §4).
          'fixed inset-x-0 bottom-0 z-50 grid gap-4 rounded-t-2xl border border-border bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-lg outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:p-6',
          className,
        )}
        {...props}
      >
        {children}
      </AlertDialogPrimitive.Content>
    </AlertDialogPrimitive.Portal>
  );
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title className={cn('text-lg font-semibold', className)} {...props} />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return <AlertDialogPrimitive.Description className={cn('text-muted', className)} {...props} />;
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

function AlertDialogCancel({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
  return (
    <AlertDialogPrimitive.Cancel
      className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'min-h-11 px-4', className)}
      {...props}
    />
  );
}

function AlertDialogAction({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action>) {
  return (
    <AlertDialogPrimitive.Action
      className={cn(
        buttonVariants({ variant: 'destructive', size: 'lg' }),
        'min-h-11 px-4',
        className,
      )}
      {...props}
    />
  );
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
};
