import type { CSSProperties } from 'react';

/**
 * SceneTransition — a curved/concave handoff between two vertical scenes, drawn as
 * an SVG path so it belongs to the content flow (no giant blurred pseudo-element,
 * no per-frame paint). Use at MAJOR handoffs only — not a decorative wave between
 * every section. Variants change the silhouette; `fill` should match the colour of
 * the scene that follows so the seam reads as one surface flowing into the next.
 */
export type SceneTransitionVariant = 'concave-up' | 'concave-down' | 'center-notch' | 'panel-rise';

const PATHS: Record<SceneTransitionVariant, string> = {
  // curves up into the next (darker) scene
  'concave-up': 'M0,40 C360,0 1080,0 1440,40 L1440,120 L0,120 Z',
  // curves down away from the previous scene
  'concave-down': 'M0,0 L1440,0 L1440,80 C1080,120 360,120 0,80 Z',
  // a central aperture notch
  'center-notch': 'M0,0 L600,0 C660,0 660,48 720,48 C780,48 780,0 840,0 L1440,0 L1440,120 L0,120 Z',
  // a flat panel rising from below
  'panel-rise': 'M0,120 L0,52 C0,44 8,36 24,36 L1416,36 C1432,36 1440,44 1440,52 L1440,120 Z',
};

interface Props {
  variant?: SceneTransitionVariant;
  /** colour of the FOLLOWING scene surface. */
  fill?: string;
  height?: number;
  className?: string;
  style?: CSSProperties;
}

export function SceneTransition({ variant = 'concave-up', fill = '#08090A', height = 90, className = '', style }: Props) {
  return (
    <div aria-hidden="true" className={className} style={{ lineHeight: 0, ...style }}>
      <svg viewBox="0 0 1440 120" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height }}>
        <path d={PATHS[variant]} fill={fill} />
      </svg>
    </div>
  );
}

export default SceneTransition;
