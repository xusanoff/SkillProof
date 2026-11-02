import type { Transition, Variants } from 'motion/react';

/** Shared easing/duration (ui-motion §2). Only transform + opacity are animated. */
export const ease = [0.22, 1, 0.36, 1] as const;

export const baseTransition: Transition = { duration: 0.4, ease };

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: (index: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { ...baseTransition, delay: index * 0.06 },
  }),
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2, ease } },
};

/** Row-aware stagger delay index: `(index % columns)`. */
export function staggerIndex(index: number, columns: number): number {
  return index % Math.max(1, columns);
}
