/**
 * SlayerLanding moved to a scene-based feature module. This thin re-export keeps
 * the existing import path (`components/SlayerLanding`) stable. The composition,
 * motion system and scenes live in `src/features/landing/`; the presentational
 * sections live in `src/features/landing/content/LandingSections.tsx`.
 */
export { default } from '../features/landing/SlayerLanding';
export type { SlayerLandingProps } from '../features/landing/content/LandingSections';
