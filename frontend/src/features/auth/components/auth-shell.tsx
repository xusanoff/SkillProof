import { LogoMark } from '@/components/layout/logo-mark';
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
    <div className="mx-auto w-full max-w-lg px-4 py-10 sm:py-16">
      <div className="sp-card p-6 sm:p-9">
        <LogoMark className="mb-6 size-10" />
        <h1 className="sp-page-title">{title}</h1>
        {lead ? <p className="mt-2 text-muted">{lead}</p> : null}
        <div className="mt-8">{children}</div>
        {footer ? <div className="mt-8 border-t border-border pt-6 text-sm">{footer}</div> : null}
      </div>
    </div>
  );
}
