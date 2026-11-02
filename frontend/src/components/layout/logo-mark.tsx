import { cn } from '@/lib/utils';

/**
 * The "seal": a ring with a tick — a stamp of verification. Decorative only;
 * the accessible name comes from the surrounding link.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      className={cn('size-7 shrink-0', className)}
    >
      <circle cx="16" cy="16" r="14" className="fill-accent" />
      <circle
        cx="16"
        cy="16"
        r="10.5"
        fill="none"
        strokeWidth="1.25"
        strokeDasharray="2 2.2"
        className="stroke-accent-fg/60"
      />
      <path
        d="M11 16.5l3.4 3.4L21.5 12.6"
        fill="none"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-accent-fg"
      />
    </svg>
  );
}
