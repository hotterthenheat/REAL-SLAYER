import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';

/**
 * DrawnAccent — a hand-drawn stroke that draws itself over/under a word when it
 * enters the viewport: the one-accent-over-muted-content move from the reference
 * site (the scrawled "ON" across TRACK, the slash over the portrait), translated
 * into Slayer's palette. Exactly one per viewport — it's an emphasis mark, not a
 * texture.
 *
 *   • 'underline' — a double-back swoosh beneath the word.
 *   • 'strike'    — an expressive rising slash across the word (cross it out).
 *
 * Implementation notes:
 *   • Viewport detection lives on the HTML wrapper span (variants propagate to
 *     the path) — IntersectionObserver on SVG child elements is unreliable in
 *     Chromium, so whileInView must never sit on the <path> itself.
 *   • No vectorEffect="non-scaling-stroke": it makes stroke-dasharray compute in
 *     screen units, which breaks pathLength(0→1) normalization (frozen dot).
 *   • Under reduced motion the mark renders fully drawn, no animation.
 */
export function DrawnAccent({
  children,
  variant = 'underline',
  color = '#3F9C79',
  delay = 0.3,
}: {
  children: ReactNode;
  variant?: 'underline' | 'strike';
  color?: string;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  const underline = variant === 'underline';
  const d = underline
    ? 'M6 14 C 48 6, 132 3, 194 8 C 138 10, 66 13, 24 17'
    : 'M8 30 C 56 24, 118 12, 150 7 C 166 4, 180 3, 192 4';
  return (
    <motion.span
      className="relative inline-block"
      initial={reduce ? 'show' : 'hidden'}
      whileInView="show"
      viewport={{ once: true, amount: 0.6 }}
    >
      {children}
      <svg
        aria-hidden="true"
        className={`pointer-events-none absolute overflow-visible ${
          underline ? 'left-[-0.06em] bottom-[-0.16em] h-[0.3em] w-[calc(100%+0.12em)]' : 'inset-[-0.08em] h-[calc(100%+0.16em)] w-[calc(100%+0.16em)]'
        }`}
        viewBox={underline ? '0 0 200 22' : '0 0 200 34'}
        preserveAspectRatio="none"
      >
        <motion.path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={5}
          strokeLinecap="round"
          style={{ opacity: 0.92 }}
          variants={{
            hidden: { pathLength: 0 },
            show: { pathLength: 1, transition: { duration: 0.65, delay, ease: [0.65, 0, 0.35, 1] } },
          }}
        />
      </svg>
    </motion.span>
  );
}

export default DrawnAccent;
