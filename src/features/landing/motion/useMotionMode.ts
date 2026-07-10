import { useEffect, useState } from 'react';
import type { MotionMode, MotionModeState } from './motionTypes';

/** Breakpoints (px) — desktop ≥1024, tablet ≥640, else mobile. Exported for tests. */
export function resolveMode(w: number): MotionMode {
  if (w >= 1024) return 'desktop';
  if (w >= 640) return 'tablet';
  return 'mobile';
}

function read(): MotionModeState {
  if (typeof window === 'undefined') {
    return { mode: 'desktop', reduced: false, coarsePointer: false };
  }
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  return { mode: resolveMode(window.innerWidth), reduced, coarsePointer };
}

/**
 * Resolves the responsive + accessibility motion capability, reacting to viewport
 * resizes and to the reduced-motion / pointer media queries changing live. Scenes
 * read this to build the right timeline shape (and to rebuild it on breakpoint
 * change). Debounced so a resize drag doesn't thrash timeline rebuilds.
 */
export function useMotionMode(): MotionModeState {
  const [state, setState] = useState<MotionModeState>(read);

  useEffect(() => {
    let t = 0;
    const update = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => setState(read()), 150);
    };
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)');
    const cp = window.matchMedia('(pointer: coarse)');
    window.addEventListener('resize', update);
    rm.addEventListener('change', update);
    cp.addEventListener('change', update);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('resize', update);
      rm.removeEventListener('change', update);
      cp.removeEventListener('change', update);
    };
  }, []);

  return state;
}
