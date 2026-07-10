/**
 * Centralised motion tokens for the Slayer landing. One source of truth for
 * timing and easing so the whole page reads as one directed sequence rather than
 * a stack of ad-hoc durations. Consumed by both Motion (framer) and GSAP.
 *
 * These are NOT visual-design tokens — they carry no colour or type. They encode
 * the *timing and choreography* language only (the thing worth borrowing from a
 * cinematic reference), while Slayer keeps its own institutional identity.
 */

/** Durations, in seconds. */
export const DUR = {
  instant: 0.12,
  fast: 0.22,
  normal: 0.45,
  reveal: 0.75,
  cinematic: 1.1,
} as const;

/** Primary + secondary easings as cubic-bezier tuples (Motion) and CSS strings. */
export const EASE_PRIMARY = [0.16, 1, 0.3, 1] as const; // expo-out — entrances, reveals
export const EASE_SMOOTH = [0.65, 0, 0.35, 1] as const; // in-out — scene handoffs

export const EASE_PRIMARY_CSS = 'cubic-bezier(0.16,1,0.3,1)';
export const EASE_SMOOTH_CSS = 'cubic-bezier(0.65,0,0.35,1)';

/** GSAP ease strings (CustomEase-free equivalents of the two beziers above). */
export const GSAP_EASE_PRIMARY = 'power3.out';
export const GSAP_EASE_SMOOTH = 'power2.inOut';

/** Stagger windows (seconds) used by the layered assembly + collage reveals. */
export const STAGGER = {
  tight: 0.06,
  layer: 0.09,
  loose: 0.12,
} as const;

/**
 * Named ScrollTrigger ids — every trigger created on the landing must use one of
 * these so the debug panel and teardown can enumerate them deterministically.
 */
export const TRIGGER = {
  loaderExit: 'landing-loader-exit',
  heroAssembly: 'landing-hero-assembly',
  heroExit: 'landing-hero-exit',
  manifesto: 'landing-manifesto',
  collage: 'landing-collage',
  productGrid: 'landing-product-grid',
  terminalPin: 'landing-terminal-pin',
  platform: 'landing-platform',
  pricing: 'landing-pricing',
  closing: 'landing-closing',
} as const;

export type TriggerId = (typeof TRIGGER)[keyof typeof TRIGGER];
