import type { Metadata, Viewport } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { Literata, Onest } from 'next/font/google';
import { notFound } from 'next/navigation';
import { BottomNav } from '@/components/layout/bottom-nav';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { Providers } from '@/components/providers';
import { appConfig } from '@/config/app';
import { VerifyEmailBanner } from '@/features/auth';
import { routing } from '@/i18n/routing';
import '../globals.css';

// Both families cover Latin + Cyrillic (uz / ru / en).
const onest = Onest({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-onest',
  display: 'swap',
});

const literata = Literata({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-literata',
  display: 'swap',
  weight: ['500', '600'],
});

/** Server-only namespaces (long marketing copy); everything else is needed by Client Components. */
const SERVER_ONLY_NAMESPACES = new Set(['meta', 'home', 'notFound', 'footer']);

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale: hasLocale(routing.locales, locale) ? locale : routing.defaultLocale,
    namespace: 'meta',
  });
  return {
    title: { default: t('title', { appName: appConfig.name }), template: `%s · ${appConfig.name}` },
    description: t('description'),
    applicationName: appConfig.name,
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'oklch(0.982 0.005 250)' },
    { media: '(prefers-color-scheme: dark)', color: 'oklch(0.175 0.028 264)' },
  ],
};

export default async function LocaleLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const messages = await getMessages();
  const clientMessages = Object.fromEntries(
    Object.entries(messages).filter(([ns]) => !SERVER_ONLY_NAMESPACES.has(ns)),
  );
  const t = await getTranslations('common');

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${onest.variable} ${literata.variable}`}
    >
      {/* Phone: room for the fixed bottom bar. */}
      <body className="flex min-h-dvh flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
        <NextIntlClientProvider messages={clientMessages}>
          <Providers>
            <a
              href="#main"
              className="sr-only z-50 rounded-md bg-accent px-4 py-3 text-accent-fg focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
            >
              {t('skipToContent')}
            </a>
            <div data-site-chrome className="contents">
              <SiteHeader />
              <VerifyEmailBanner />
            </div>
            <main id="main" className="flex flex-1 flex-col">
              {children}
            </main>
            <div data-site-chrome className="contents">
              <SiteFooter />
              <BottomNav />
            </div>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
