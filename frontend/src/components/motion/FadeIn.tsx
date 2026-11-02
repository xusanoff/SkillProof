'use client';

import * as m from 'motion/react-m';
import type { ReactNode } from 'react';
import { fadeUp } from './variants';

interface FadeInProps {
  children: ReactNode;
  /** Stagger position (see `staggerIndex`). */
  index?: number;
  as?: 'div' | 'li' | 'section';
  className?: string;
}

/**
 * Section/item reveal on first scroll into view.
 * Reduced motion: <MotionConfig reducedMotion="user"> drops the `y` transform and
 * keeps only the opacity fade (ui-motion §3.4). No branching here, so SSR and
 * hydration markup always match.
 */
export function FadeIn({ children, index = 0, as = 'div', className }: FadeInProps) {
  const Component = as === 'li' ? m.li : as === 'section' ? m.section : m.div;
  return (
    <Component
      className={className}
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      custom={index}
    >
      {children}
    </Component>
  );
}
