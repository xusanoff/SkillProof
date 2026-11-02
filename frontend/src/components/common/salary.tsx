import { useLocale, useTranslations } from 'next-intl';
import { formatSalary, salaryKind, type SalaryTranslator } from '@/lib/money';
import { cn } from '@/lib/utils';

/**
 * Salary line ("15 000 000 – 22 000 000 so'm", "dan 10 000 000 so'm", "Maosh ko'rsatilmagan").
 * Works in Server and Client Components. `tabular-nums` so lists align.
 */
export function Salary({
  min,
  max,
  currency,
  className,
}: {
  min: number | null | undefined;
  max: number | null | undefined;
  currency: string | null | undefined;
  className?: string;
}) {
  const t = useTranslations('salary');
  const locale = useLocale();
  const none = salaryKind(min, max) === 'none';
  return (
    <p className={cn('tabular-nums', none ? 'font-normal text-muted' : 'font-semibold', className)}>
      {formatSalary(min, max, currency ?? 'UZS', locale, t as unknown as SalaryTranslator)}
    </p>
  );
}
