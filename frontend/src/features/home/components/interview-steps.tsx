import { useTranslations } from 'next-intl';
import { FadeIn, staggerIndex } from '@/components/motion';

/** The real sequence of the interview (PROJECT_SPEC §6), so numbered markers are meaningful. */
const STEPS = ['rules', 'stage1', 'stage2', 'results'] as const;

export function InterviewSteps() {
  const t = useTranslations('home');

  return (
    <section
      id="how-it-works"
      aria-labelledby="steps-title"
      className="border-y border-border bg-surface"
    >
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20">
        <div className="max-w-2xl">
          <h2
            id="steps-title"
            className="font-display text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            {t('steps.title')}
          </h2>
          <p className="mt-4 text-lg text-muted">{t('steps.lead')}</p>
        </div>

        <ol className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <FadeIn
              as="li"
              key={step}
              index={staggerIndex(i, 4)}
              className="relative rounded-xl bg-surface-2 p-6"
            >
              <div className="flex items-center gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft tabular-nums font-mono text-sm font-semibold text-accent">
                  {String(i + 1).padStart(2, '0')}
                </span>
                {/* Track line to the next step (desktop row only). */}
                {i < STEPS.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className="hidden h-px flex-1 bg-border-strong lg:block"
                  />
                ) : null}
              </div>
              <h3 className="mt-5 text-lg font-semibold">{t(`steps.${step}.title`)}</h3>
              <p className="mt-2 text-muted">{t(`steps.${step}.body`)}</p>
            </FadeIn>
          ))}
        </ol>
      </div>
    </section>
  );
}
