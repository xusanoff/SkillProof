import { LoaderCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** The next question is being prepared (the screen polls about every 2 s). */
export function Preparing() {
  const t = useTranslations('stage2.room');
  return (
    <p
      role="status"
      className="mx-auto flex max-w-prose items-center gap-3 rounded-xl border border-border p-5"
    >
      <LoaderCircle
        aria-hidden="true"
        className="size-5 shrink-0 animate-spin text-muted motion-reduce:animate-none"
      />
      {t('preparing')}
    </p>
  );
}
