import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // Locale-aware navigation only (i18n skill §2).
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'next/link', message: 'Use Link from @/i18n/navigation.' },
            {
              name: 'next/navigation',
              importNames: ['useRouter', 'usePathname', 'redirect'],
              message: 'Use the helpers from @/i18n/navigation.',
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    '.next/**',
    'public/monaco/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'playwright-report/**',
    'test-results/**',
    'src/lib/api/schema.d.ts',
  ]),
]);

export default eslintConfig;
