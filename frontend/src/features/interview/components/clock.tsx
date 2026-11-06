'use client';

import { Timer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatClock, secondsLeft, serverClock } from '../model';

/** Monotonic ms, re-read every second. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Seconds left until `deadline` on the SERVER clock: `server_now` fixes the offset to the
 * browser's monotonic clock when the response arrives; the browser's wall clock is never used.
 */
export function useDeadlineSeconds(
  deadline: string | null | undefined,
  serverNow: string,
): number | null {
  const now = useNow();
  const [anchor, setAnchor] = useState(() => ({ serverNow, at: performance.now() }));
  if (anchor.serverNow !== serverNow) setAnchor({ serverNow, at: now });
  return secondsLeft(deadline, serverClock(anchor.serverNow, anchor.at)(now));
}

export function TimerChip({
  seconds,
  label,
  showLabel,
}: {
  seconds: number | null;
  label: string;
  /** Show the label to everyone, not only to screen readers (two clocks side by side). */
  showLabel?: boolean;
}) {
  if (seconds === null) return null;
  const low = seconds <= 60;
  return (
    <p
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 tabular-nums text-sm font-medium ${low ? 'border-danger/40 bg-danger-soft' : 'border-border bg-surface'}`}
    >
      <Timer aria-hidden="true" className="size-4" />
      <span className={showLabel ? 'font-normal text-muted' : 'sr-only'}>{label}: </span>
      {formatClock(seconds)}
    </p>
  );
}
