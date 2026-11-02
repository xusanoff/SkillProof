import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  cacheComponents: true,
  partialPrefetching: true,
  // The browser calls `/api/*`. It is forwarded to the FastAPI service by the route
  // handler in src/app/api/[...path]/route.ts, which reads API_INTERNAL_URL at
  // *runtime*. A `rewrites()` entry would be frozen into the standalone build.
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default withNextIntl(nextConfig);
