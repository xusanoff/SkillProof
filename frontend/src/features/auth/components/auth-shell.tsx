import type { ReactNode } from 'react';

/** Narrow single-column frame for auth pages: one h1, one form, one primary action. */
export function AuthShell({
  title,
  lead,
  children,
  footer,
}: {
  title: string;
  lead?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 sm:py-16">
      <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
      {lead ? <p className="mt-2 text-muted">{lead}</p> : null}
      <div className="mt-8">{children}</div>
      {footer ? <div className="mt-8 border-t border-border pt-6 text-sm">{footer}</div> : null}
    </div>
  );
}
