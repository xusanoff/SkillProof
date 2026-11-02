import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

export default function NotFound() {
  const t = useTranslations();

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4 py-20 sm:px-6">
      <p
        className="font-display text-7xl font-semibold text-accent tabular-nums"
        aria-hidden="true"
      >
        404
      </p>
      <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        {t('notFound.title')}
      </h1>
      <p className="mt-3 max-w-prose text-muted">{t('notFound.body')}</p>
      <Button asChild size="lg" className="mt-8 min-h-11 self-start px-5">
        <Link href="/">{t('common.backHome')}</Link>
      </Button>
    </section>
  );
}
