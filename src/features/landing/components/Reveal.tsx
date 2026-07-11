import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { useLandingMotion } from '../motion/LandingMotionProvider';
import { EASE_PRIMARY } from '../motion/motionTokens';

/**
 * Reveal — the landing's one scroll-entrance primitive for the informational
 * sections below the scroll-driven scenes. It exists to satisfy two hard rules:
 *
 *  1. You must never see a section "working" before you reach it. Content starts
 *     hidden (opacity 0, small rise) and only animates once ≥`amount` of it is
 *     actually in view — never at the extreme edge, never pre-played below the fold.
 *  2. It reverses. `once: false` means scrolling UP re-hides a section as it leaves
 *     and re-reveals it on the way back down, so the page reads the same in both
 *     directions instead of freezing after first view.
 *
 * The transition is short (0.55s expo-out) so the reveal resolves cleanly the
 * moment it's in frame rather than dragging a visible half-state across the screen.
 * Under reduced motion it renders in place with no transform.
 */
export function Reveal({
  children,
  delay = 0,
  y = 22,
  amount = 0.25,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  amount?: number;
  className?: string;
}) {
  const { reduced } = useLandingMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: false, amount }}
      transition={{ duration: 0.55, ease: EASE_PRIMARY, delay }}
    >
      {children}
    </motion.div>
  );
}

export default Reveal;
