import { defineConfig, devices } from '@playwright/test';

/**
 * Run against an already running app (`pnpm build && pnpm start`, or the docker stack):
 *   pnpm test:e2e       → browser-mocked API; the app must NOT reach a backend, because public pages
 *                         render first on the server (D-031):
 *                         `API_INTERNAL_URL=http://127.0.0.1:9 PORT=3100 pnpm start` + `BASE_URL=http://localhost:3100`
 *   pnpm test:e2e:live  → real stack (`make up && make seed`, mock LLM)
 *   pnpm screenshots    → ../docs/reports/phase-<N>/img/
 */
const baseURL = process.env.BASE_URL || 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'e2e',
      testIgnore:
        /(screenshots|assessment|interview|stage2|responsive-a11y|ui-review|hiring-workflow)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'e2e-live',
      testMatch:
        /(assessment|interview|stage2|responsive-a11y|ui-review|hiring-workflow)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'e2e-mobile',
      testMatch: /smoke\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'screenshots',
      testMatch: /screenshots\.spec\.ts/,
      // Deterministic captures: no entrance animations.
      use: {
        ...devices['Desktop Chrome'],
        reducedMotion: 'reduce',
        // Phase 6: a fake microphone for the voice interview.
        launchOptions: {
          args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
        },
      },
    },
  ],
});
