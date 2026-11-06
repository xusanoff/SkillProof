import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

export function AudienceSplit() {
  const t = useTranslations('home.audience');

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:py-20">
      <div className="grid gap-5 md:grid-cols-2">
        <div className="sp-card flex flex-col p-6 sm:p-9">
          <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            {t('candidates.title')}
          </h2>
          <p className="mt-4 max-w-prose text-muted">{t('candidates.body')}</p>
          <Button asChild size="lg" className="mt-8 h-12 self-start px-6 text-base">
            <Link href="/vacancies">{t('candidates.cta')}</Link>
          </Button>
        </div>
        <div
          id="employers"
          className="flex flex-col rounded-xl bg-dark-panel p-6 text-dark-text sm:p-9"
        >
          <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            {t('employers.title')}
          </h2>
          <p className="mt-4 max-w-prose text-dark-muted">{t('employers.body')}</p>
          <Button
            asChild
            variant="signal"
            size="lg"
            className="mt-8 h-12 self-start px-6 text-base"
          >
            <Link href="/register?role=hr&next=%2Fhr">{t('employers.cta')}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
