import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './msw';

MotionGlobalConfig.skipAnimations = true;

// jsdom has no IntersectionObserver (used by `whileInView`).
class IO {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
globalThis.IntersectionObserver ??= IO as unknown as typeof IntersectionObserver;

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());

// jsdom has no ResizeObserver (Radix Switch measures its thumb).
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
