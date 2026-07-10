import { createContext, useContext, useMemo, type ReactNode, type MutableRefObject } from 'react';
import type Lenis from 'lenis';
import { useMotionMode } from './useMotionMode';
import { useLenisScrollTrigger } from './useLenisScrollTrigger';
import type { LandingMotionContextValue } from './motionTypes';

interface ProviderValue extends LandingMotionContextValue {
  lenisRef: MutableRefObject<Lenis | null>;
  ready: boolean;
}

const Ctx = createContext<ProviderValue | null>(null);

/** dev-only query flag (?motionDebug=1) — never surfaced to normal visitors. */
function readDebug(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('motionDebug') === '1';
  } catch {
    return false;
  }
}

interface Props {
  scrollerRef: MutableRefObject<HTMLElement | null>;
  contentRef: MutableRefObject<HTMLElement | null>;
  children: ReactNode;
}

/**
 * Owns the landing's motion capability + the single smooth-scroll/ScrollTrigger
 * bridge, and exposes both to every scene via context. Scenes never create their
 * own Lenis or read window size directly — they read this.
 */
export function LandingMotionProvider({ scrollerRef, contentRef, children }: Props) {
  const modeState = useMotionMode();
  const debug = readDebug();
  const { lenisRef, ready } = useLenisScrollTrigger({
    wrapperRef: scrollerRef,
    contentRef,
    reduced: modeState.reduced,
  });

  const value = useMemo<ProviderValue>(
    () => ({ ...modeState, debug, scrollerRef, lenisRef, ready }),
    [modeState, debug, scrollerRef, lenisRef, ready],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Read the landing motion context. Throws if used outside the provider. */
export function useLandingMotion(): ProviderValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLandingMotion must be used within LandingMotionProvider');
  return v;
}
