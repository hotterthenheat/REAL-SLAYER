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
 *  1. Makes that wrapper the default ScrollTrigger scroller (mount-scoped).
 *  2. Creates a single Lenis instance in wrapper mode (reduced-motion-scoped).
 *  3. Drives Lenis from GSAP's ticker (one rAF loop for the whole page) and pushes
 *     every Lenis scroll frame into `ScrollTrigger.update`.
 *  4. Refreshes ScrollTrigger after fonts/images settle and on content resize.
 *  5. Tears down on unmount — kills every ScrollTrigger, removes the ticker
 *     callback, restores lagSmoothing, destroys Lenis — so leaving the landing
 *     never strands a scroll lock or orphaned trigger.
 *
 * The lifecycle is deliberately SPLIT into two effects: the mount-scoped effect
 * owns the scroller default + the kill-all teardown, while the `reduced`-scoped
 * effect owns only Lenis. A live prefers-reduced-motion toggle therefore swaps
 * the smooth-scroll layer WITHOUT killing the scene ScrollTriggers that scenes
 * have just rebuilt for the new mode (they manage their own triggers via
 * useGSAP revertOnUpdate).
 */
export function useLenisScrollTrigger({ wrapperRef, contentRef, reduced }: Options) {
  const lenisRef = useRef<Lenis | null>(null);
  const [ready, setReady] = useState(false);

  // ── mount-scoped: scroller default, refresh plumbing, final teardown ──
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const content = contentRef.current;
    if (!wrapper || !content) return;

    ScrollTrigger.defaults({ scroller: wrapper });

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
      ScrollTrigger.getAll().forEach((t) => t.kill());
      ScrollTrigger.defaults({ scroller: undefined as unknown as Element });
    };
  }, [wrapperRef, contentRef]);

  // ── reduced-scoped: the Lenis smooth-scroll layer only ──
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const content = contentRef.current;
    if (!wrapper || !content || reduced) return;

    const lenis = new Lenis({
      wrapper,
      content,
      duration: 1.05,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });
    lenisRef.current = lenis;
    lenis.on('scroll', ScrollTrigger.update);

    const tickerCb = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tickerCb);
    gsap.ticker.lagSmoothing(0);

    // pin/scrub measurements depend on the active scroll layer — re-measure.
    ScrollTrigger.refresh();

    return () => {
      gsap.ticker.remove(tickerCb);
      gsap.ticker.lagSmoothing(500, 33);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [wrapperRef, contentRef, reduced]);

  return { lenisRef, ready };
}
