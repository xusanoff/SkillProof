import { Code2, History, Mic, Scale, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** Public process illustration: no personal data or invented assessment outcomes. */
export function SampleApplication() {
  const t = useTranslations();
  return (
    <figure>
      <div className="relative">
        <div
          aria-hidden="true"
          className="absolute inset-0 translate-x-3 translate-y-3 rounded-[22px] bg-primary"
        />
        <div className="relative flex flex-col gap-6 rounded-[22px] border border-border bg-surface p-6 sm:p-7">
          <div className="flex items-center gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
              <ShieldCheck aria-hidden="true" />
            </span>
            <p className="flex-1 text-lg font-bold">{t('home.sample.applicant')}</p>
            <span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-muted">
              {t('common.example')}
            </span>
          </div>
          <div className="grid gap-3">
            {(
              [
                { key: 'stage1', Icon: Code2 },
                { key: 'stage2', Icon: Mic },
              ] as const
            ).map(({ key, Icon }, index) => (
              <div key={key} className="sp-card flex items-center gap-4 p-4">
                <Icon aria-hidden="true" className="size-5 shrink-0 text-accent" />
                <span className="flex-1 font-semibold">{t(`home.sample.${key}`)}</span>
                <span className="font-mono text-sm text-muted">
                  {String(index + 1).padStart(2, '0')}
                </span>
              </div>
            ))}
          </div>
          <div className="rounded-xl bg-surface-2 p-4">
            <p className="text-xs font-semibold tracking-[.08em] text-muted uppercase">
              {t('home.steps.results.title')}
            </p>
            <p className="mt-2 text-sm leading-relaxed">{t('home.sample.decision')}</p>
          </div>
          <div className="rounded-xl bg-dark-panel p-4 text-dark-text">
            <div className="flex items-start gap-3 font-medium">
              <History aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-signal" />
              {t('home.sample.replay')}
            </div>
            <p className="mt-3 text-sm leading-relaxed text-dark-muted">
              {t('home.sample.replayHint')}
            </p>
          </div>
        </div>
      </div>
      <figcaption className="mt-7 flex items-start gap-2 text-sm text-muted">
        <Scale aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        {t('home.sample.caption')}
      </figcaption>
    </figure>
  );
}
