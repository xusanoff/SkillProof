'use client';

import { LazyMotion, MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

const loadFeatures = () => import('./features').then((mod) => mod.default);

/**
 * LazyMotion + `m.*` keeps Motion out of the initial bundle: the animation features
 * load after hydration. reducedMotion="user" respects the OS setting.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
