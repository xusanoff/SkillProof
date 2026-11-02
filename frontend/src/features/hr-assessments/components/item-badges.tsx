import { CircleAlert, CircleCheck, Clock, Sparkles, UserRound, Circle, Globe } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';
import { cn } from '@/lib/utils';
import { reportIssues, type ItemSource, type VerificationStatus } from '../model';

const chip =
  'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium [&>svg]:size-3.5';

const VERIFY: Record<VerificationStatus, { icon: ComponentType; tone: string }> = {
  passed: { icon: CircleCheck, tone: 'bg-success-soft text-fg [&>svg]:text-success' },
  flagged: { icon: CircleAlert, tone: 'bg-danger-soft text-fg [&>svg]:text-danger' },
  sandbox_pending: { icon: Clock, tone: 'bg-warning-soft text-fg [&>svg]:text-warning' },
  not_checked: { icon: Circle, tone: 'bg-surface-2 text-fg' },
};

/** Status = icon + text (never colour alone). */
export function VerificationBadge({ status }: { status: VerificationStatus }) {
  const t = useTranslations('hrBank.verification');
  const { icon: Icon, tone } = VERIFY[status];
  return (
    <span className={cn(chip, tone)}>
      <Icon aria-hidden="true" />
      {t(status)}
    </span>
  );
}

export function SourceBadge({ source }: { source: ItemSource }) {
  const t = useTranslations('hrBank.source');
  const Icon = source === 'ai_generated' ? Sparkles : UserRound;
  return (
    <span className={cn(chip, 'bg-surface-2 text-fg')}>
      <Icon aria-hidden="true" />
      {t(source)}
    </span>
  );
}

export function ApprovalBadge({ approved }: { approved: boolean }) {
  const t = useTranslations('hrBank');
  return (
    <span
      className={cn(
        chip,
        approved ? 'bg-success-soft text-fg [&>svg]:text-success' : 'bg-surface-2 text-fg',
      )}
    >
      {approved ? <CircleCheck aria-hidden="true" /> : <Circle aria-hidden="true" />}
      {approved ? t('approved') : t('notApproved')}
    </span>
  );
}

export function GlobalBadge() {
  const t = useTranslations('hrBank');
  return (
    <span className={cn(chip, 'bg-surface-2 text-fg')}>
      <Globe aria-hidden="true" />
      {t('global')}
    </span>
  );
}

/** Why an item was flagged (`verification_report.issues`). */
export function FlagReasons({
  status,
  report,
}: {
  status: VerificationStatus;
  report: { [key: string]: unknown };
}) {
  const t = useTranslations('hrBank.verification');
  if (status !== 'flagged') return null;
  const issues = reportIssues(report);
  return (
    <div className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm">
      <p className="font-medium">{t('flaggedWhy')}</p>
      {issues.length ? (
        <ul className="mt-1 list-disc pl-5">
          {issues.map((i, n) => (
            <li key={n}>{i}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1">{t('noReason')}</p>
      )}
    </div>
  );
}
