import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface Options {
  wrapperRef: MutableRefObject<HTMLElement | null>;
  contentRef: MutableRefObject<HTMLElement | null>;
  /** When true, skip Lenis entirely and let native scroll drive the wrapper. */
  reduced: boolean;
}

/**
 * The ONE smooth-scroll owner for the landing. Because the landing scrolls inside
 * its own `fixed inset-0` wrapper (not the window), this:
 *
 *  1. Makes that wrapper the default ScrollTrigger scroller.
 *  2. Creates a single Lenis instance in wrapper mode.
 *  3. Drives Lenis from GSAP's ticker (one rAF loop for the whole page) and pushes
 *     every Lenis scroll frame into `ScrollTrigger.update` so pins/scrubs stay
 *     glued to the smoothed scroll position.
 *  4. Refreshes ScrollTrigger after fonts + images settle and on resize.
 *  5. Tears everything down on unmount — kills every ScrollTrigger, removes the
 *     ticker callback, restores lagSmoothing, and destroys Lenis — so returning to
 *     the terminal never leaves a scroll lock or orphaned trigger behind.
 *
 * Under reduced-motion Lenis is skipped (native scroll), but the wrapper is still
 * registered as the scroller so any (non-scrubbed) triggers measure correctly.
 */
export function useLenisScrollTrigger({ wrapperRef, contentRef, reduced }: Options) {
  const lenisRef = useRef<Lenis | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const content = contentRef.current;
    if (!wrapper || !content) return;

    // The wrapper is the scroller for every trigger on the page.
    ScrollTrigger.defaults({ scroller: wrapper });

    let lenis: Lenis | null = null;
    let tickerCb: ((time: number) => void) | null = null;

    if (!reduced) {
      lenis = new Lenis({
        wrapper,
        content,
        duration: 1.05,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
      });
      lenisRef.current = lenis;

      // Smoothed scroll frame → keep ScrollTrigger in lockstep.
      lenis.on('scroll', ScrollTrigger.update);

      // Single rAF: GSAP's ticker drives Lenis (gsap.ticker is seconds → *1000).
      tickerCb = (time: number) => lenis!.raf(time * 1000);
      gsap.ticker.add(tickerCb);
      gsap.ticker.lagSmoothing(0);
    }

    // Refresh once layout is stable, and again after fonts/images resolve.
    const refresh = () => ScrollTrigger.refresh();
    const raf = requestAnimationFrame(() => {
      refresh();
      setReady(true);
    });
    if (typeof document !== 'undefined' && (document as any).fonts?.ready) {
      (document as any).fonts.ready.then(refresh).catch(() => {});
    }
    const ro = new ResizeObserver(() => ScrollTrigger.refresh());
    ro.observe(content);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (tickerCb) gsap.ticker.remove(tickerCb);
      gsap.ticker.lagSmoothing(500, 33);
      ScrollTrigger.getAll().forEach((t) => t.kill());
      lenis?.destroy();
      lenisRef.current = null;
      // Drop the wrapper default so it can't dangle after unmount.
      ScrollTrigger.defaults({ scroller: undefined as unknown as Element });
    };
  }, [wrapperRef, contentRef, reduced]);

  return { lenisRef, ready };
}
