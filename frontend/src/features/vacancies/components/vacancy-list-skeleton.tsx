import { Skeleton } from '@/components/ui/skeleton';

/** Card-shaped placeholders while results load (same height as a card: no layout jump). */
export function VacancyListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <ul className="grid gap-3" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="sp-card p-4 sm:p-5">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="mt-2.5 h-6 w-1/3" />
          <Skeleton className="mt-3 h-4 w-1/2" />
          <Skeleton className="mt-2 h-4 w-1/4" />
          <div className="mt-4 flex gap-1.5">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-14" />
          </div>
          <Skeleton className="mt-4 h-11 w-36" />
        </li>
      ))}
    </ul>
  );
}
