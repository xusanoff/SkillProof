import { History, Scale } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { ScoreMeter } from '@/components/common/score-meter';
import { SuspicionBadge } from '@/components/common/suspicion-badge';

/** Fixed example values for the illustration — not computed, not real data. */
const SAMPLE = { stage1: 86, stage2: 78 } as const;

/** Decorative "replay" strip: edit density over time. */
const EDIT_TICKS = [3, 5, 4, 7, 6, 8, 5, 3, 6, 9, 7, 4, 5, 8, 6, 4, 2, 5, 7, 6, 3, 4, 6, 5];

export function SampleApplication() {
  const t = useTranslations();
  const format = useFormatter();
  const pct = (v: number) => format.number(v / 100, { style: 'percent' });

  return (
    <figure>
      <div className="relative">
        {/* A second sheet behind: one application in a ranked pile. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 translate-x-3 translate-y-3 rounded-xl border border-border bg-surface-2"
        />
        <div className="relative rounded-xl border border-border-strong/60 bg-surface p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted">{t('home.sample.applicant')}</span>
            <span className="rounded-md bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
              {t('common.example')}
            </span>
          </div>
          <p className="mt-2 text-lg font-semibold">{t('home.sample.role')}</p>

          <div className="mt-5 grid gap-4">
            <ScoreMeter
              label={t('home.sample.stage1')}
              value={SAMPLE.stage1}
              tone="high"
              formatted={pct(SAMPLE.stage1)}
            />
            <ScoreMeter
              label={t('home.sample.stage2')}
              value={SAMPLE.stage2}
              tone="high"
              formatted={pct(SAMPLE.stage2)}
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
            <span className="text-sm text-muted">{t('home.sample.suspicion')}</span>
            <SuspicionBadge level="low" label={t('home.sample.suspicionLow')} />
          </div>

          <div className="mt-4 rounded-lg bg-surface-2 p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <History aria-hidden="true" className="size-4 text-accent" />
              {t('home.sample.replay')}
            </div>
            <div aria-hidden="true" className="mt-3 flex h-10 items-end gap-[3px]">
              {EDIT_TICKS.map((h, i) => (
                <span
                  key={i}
                  className="flex-1 rounded-sm bg-accent/70"
                  style={{ height: `${h * 10}%` }}
                />
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">{t('home.sample.replayHint')}</p>
          </div>
        </div>
      </div>
      <figcaption className="mt-8 flex items-start gap-2 text-sm text-muted">
        <Scale aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>
          <span className="font-medium text-fg">{t('home.sample.caption')}.</span>{' '}
          {t('home.sample.decision')}
        </span>
      </figcaption>
    </figure>
  );
}
