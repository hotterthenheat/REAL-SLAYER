import { useRef } from 'react';
import { LandingMotionProvider, useLandingMotion } from './motion/LandingMotionProvider';
import { LandingPreloader } from './scenes/LandingPreloader';
import { HeroAssemblyScene } from './scenes/HeroAssemblyScene';
import { HeroExitScene } from './scenes/HeroExitScene';
import { ProductCollageScene } from './scenes/ProductCollageScene';
import { PinnedTerminalScene } from './scenes/PinnedTerminalScene';
import { ProductGridScene } from './scenes/ProductGridScene';
import { MotionDebugPanel } from './components/MotionDebugPanel';
import {
  LandingSidebar,
  LandingMobileNav,
  MarqueeTicker,
  ComparisonSection,
  HowItWorks,
  FaqSection,
  FinalCta,
  PricingSection,
  Footer,
  type SlayerLandingProps,
} from './content/LandingSections';

/**
 * SlayerLanding — the composed marketing landing. This file *composes scenes*; it
 * no longer holds the page's UI + animation logic (that lives in ./scenes,
 * ./components and ./content). One smooth-scroll owner (LandingMotionProvider →
 * Lenis + ScrollTrigger); every scene owns exactly one animation.
 */
function LandingLayout({ ticker, metrics, ranked, pressure, spark, onEnter, onLaunch, scrollerRef, contentRef }: SlayerLandingProps & {
  scrollerRef: React.MutableRefObject<HTMLElement | null>;
  contentRef: React.MutableRefObject<HTMLElement | null>;
}) {
  const { lenisRef, debug, ready } = useLandingMotion();

  const scrollTo = (id: string) => {
    const root = scrollerRef.current as HTMLElement | null;
    const el = root?.querySelector<HTMLElement>(`#${id}`);
    if (!root || !el) return;
    if (lenisRef.current) lenisRef.current.scrollTo(el, { offset: -8 });
    else root.scrollTo({ top: el.offsetTop - 8, behavior: 'smooth' });
  };
  const scrollTop = () => {
    if (lenisRef.current) lenisRef.current.scrollTo(0);
    else scrollerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="fixed inset-0 z-[40] flex font-mono antialiased" style={{ background: 'var(--background)', color: 'var(--text-primary)' }}>
      <LandingSidebar onLaunch={onLaunch} onEnter={onEnter} scrollTop={scrollTop} />
      <div
        ref={scrollerRef as React.MutableRefObject<HTMLDivElement | null>}
        className="slayer-scrollbar relative flex-1 overflow-y-auto overflow-x-hidden"
      >
        <LandingMobileNav onLaunch={onLaunch} onEnter={onEnter} scrollTop={scrollTop} />
        <div ref={contentRef as React.MutableRefObject<HTMLDivElement | null>} className="relative z-10">
          {/* Scene 1 — layered terminal assembly hero (loop, no scroller needed) */}
          <HeroAssemblyScene onEnter={onEnter} onLaunch={onLaunch} />
          {/* Scroll-driven scenes mount once the Lenis↔ScrollTrigger scroller is
              wired (ready), so their triggers bind to the landing wrapper — never
              the window. The preloader covers this one-frame gate. */}
          {ready && (
            <>
              {/* Scene 2 — hero exit → kinetic manifesto (pinned, scrubbed) */}
              <HeroExitScene />
              {/* kinetic phrase strip — supports the transition into the story */}
              <MarqueeTicker />
              {/* Scene 3 — scrubbed product collage */}
              <ProductCollageScene onEnter={onEnter} />
              {/* Scene 4 — pinned terminal-window sequence (real Slayer modules) */}
              <PinnedTerminalScene onEnter={onEnter} />
              {/* Scene 5 — interactive module grid */}
              <ProductGridScene ticker={ticker} metrics={metrics} ranked={ranked} pressure={pressure} spark={spark} onEnter={onEnter} />
            </>
          )}
          {/* supporting informational sections */}
          <HowItWorks />
          <ComparisonSection />
          <FaqSection />
          <FinalCta onLaunch={onLaunch} />
          <PricingSection onLaunch={onLaunch} onEnter={onEnter} />
          <Footer onLaunch={onLaunch} onEnter={onEnter} scrollTo={scrollTo} />
        </div>
      </div>
      {debug && <MotionDebugPanel />}
      {/* Scene 1 — cinematic preloader wipe over the already-mounted hero */}
      <LandingPreloader />
    </div>
  );
}

export default function SlayerLanding(props: SlayerLandingProps) {
  const scrollerRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLElement | null>(null);
  return (
    <LandingMotionProvider scrollerRef={scrollerRef} contentRef={contentRef}>
      <LandingLayout {...props} scrollerRef={scrollerRef} contentRef={contentRef} />
    </LandingMotionProvider>
  );
}
