import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

export default function NotFound() {
  const t = useTranslations();

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4 py-20 sm:px-6">
      <p
        className="tabular-nums font-display text-7xl font-semibold text-accent"
        aria-hidden="true"
      >
        404
      </p>
      <h1 className="sp-page-title mt-4 sm:text-4xl">{t('notFound.title')}</h1>
      <p className="mt-3 max-w-prose text-muted">{t('notFound.body')}</p>
      <Button asChild size="lg" className="mt-8 min-h-11 self-start px-5">
        <Link href="/">{t('common.backHome')}</Link>
      </Button>
    </section>
  );
}
