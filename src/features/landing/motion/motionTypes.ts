/** Shared motion types for the Slayer landing scene system. */
import type { MutableRefObject } from 'react';

/** Responsive motion tiers. Each tier gets its own timeline shape. */
export type MotionMode = 'desktop' | 'tablet' | 'mobile';

/** The resolved motion capability for the current visitor. */
export interface MotionModeState {
  mode: MotionMode;
  /** prefers-reduced-motion — when true, scenes render in their final readable
   *  state with only opacity transitions; no pins, loops or pointer parallax. */
  reduced: boolean;
  /** true on coarse pointers (touch) — disables pointer-depth parallax. */
  coarsePointer: boolean;
}

/** Context exposed by LandingMotionProvider to every scene. */
export interface LandingMotionContextValue extends MotionModeState {
  /** The landing's own scroll wrapper (the ScrollTrigger scroller). */
  scrollerRef: MutableRefObject<HTMLElement | null>;
  /** dev-only motion debug flag (?motionDebug=1). */
  debug: boolean;
}
