import { cn } from '@/lib/utils';

/** Accessible name belongs to the surrounding link. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 28 28"
      aria-hidden="true"
      focusable="false"
      className={cn('size-[30px] shrink-0', className)}
    >
      <rect width="28" height="28" rx="8" className="fill-dark-panel" />
      <path
        d="M8 14.5l4 4 8-9"
        fill="none"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-signal"
      />
    </svg>
  );
}
