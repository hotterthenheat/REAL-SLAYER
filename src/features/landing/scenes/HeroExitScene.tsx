import { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { KineticHeadline } from '../components/KineticHeadline';
import { useFitScale } from '../hooks/useFitScale';
import { useLandingMotion } from '../motion/LandingMotionProvider';
import { GSAP_EASE_SMOOTH, TRIGGER } from '../motion/motionTokens';

const STEEL = '#6A93B5';
const AMBER = '#C79350';
const RED = '#B23B3B';
const BORDER = 'rgba(255,255,255,0.10)';

const STATEMENT = ['READ THE FLOW', 'SEE THE PRESSURE', 'TRADE THE STRUCTURE'];

/** Terminal "aperture" content — laid out at a fixed 560×236 design and scaled
 *  uniformly to fill its (fixed-ratio) frame, so type + chart never distort. The
 *  frame chrome (bg / border / radius) lives on the animated `data-aperture` box. */
function ApertureContent() {
  const { ref, scale } = useFitScale<HTMLDivElement>(560);
  return (
    <div ref={ref} style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: 560, height: 236, transformOrigin: 'top left', transform: `scale(${scale})` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 34, padding: '0 14px', borderBottom: `1px solid ${BORDER}` }}>
          <span style={{ fontFamily: 'var(--font-brand,monospace)', fontSize: 13, fontWeight: 700 }}>
            <span style={{ color: '#6B7177' }}>&gt;</span><span style={{ color: '#F4F5F6' }}>slayer_terminal</span>
          </span>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: '#3F9C79' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', height: 56, borderBottom: `1px solid ${BORDER}` }}>
          {[['NET GEX', '−$1.84B', RED], ['SPOT', '5,993', '#E5E5E5'], ['CALL WALL', '6,050', STEEL], ['EXP MOVE', '0.61%', AMBER]].map(([l, v, c], i) => (
            <div key={i} style={{ padding: '9px 12px', borderLeft: i ? `1px solid ${BORDER}` : 'none' }}>
              <div style={{ fontFamily: 'var(--font-brand,monospace)', fontSize: 9, letterSpacing: '0.16em', color: 'rgba(245,245,245,0.42)' }}>{l}</div>
              <div style={{ marginTop: 4, fontFamily: 'var(--font-brand,monospace)', fontSize: 15, fontWeight: 700, color: c as string }}>{v}</div>
            </div>
          ))}
        </div>
        <svg width={560} height={146} viewBox="0 0 560 146" style={{ display: 'block' }}>
          <line x1="0" y1="46" x2="560" y2="46" stroke={STEEL} strokeOpacity="0.25" strokeDasharray="3 4" />
          <line x1="0" y1="104" x2="560" y2="104" stroke={RED} strokeOpacity="0.25" strokeDasharray="3 4" />
          <polyline points="0,86 56,92 112,70 168,80 224,58 280,72 336,50 392,66 448,54 504,64 560,58" fill="none" stroke={STEEL} strokeWidth="1.6" />
        </svg>
      </div>
    </div>
  );
}

/**
 * Scene 2 — hero exit → kinetic manifesto. Pins a stage and, on scrub, compresses
 * the terminal into a framed aperture while an oversized Slayer statement slides in
 * behind it (alternate lines travel in opposite directions) and dealer-style data
 * bars wipe across. Fully reversible (scrub). Under reduced motion the stage is
 * static: statement legible, terminal centred, bars filled.
 */
export function HeroExitScene() {
  const scope = useRef<HTMLDivElement | null>(null);
  const { reduced, mode } = useLandingMotion();
  // Mobile gets the static composition (no pin/scrub) — pinning on a phone leaves
  // a fixed centre band with empty black above/below.
  const staticMode = reduced || mode === 'mobile';

  useGSAP(
    () => {
      const q = gsap.utils.selector(scope);
      const stage = q('[data-stage]')[0];
      const term = q('[data-aperture]')[0];
      const lines = q('[data-kinetic-line]');
      const bars = q('[data-wipe]');

      if (staticMode) {
        gsap.set(term, { scale: mode === 'mobile' ? 1 : 0.82 });
        gsap.set(lines, { xPercent: 0, yPercent: 0, autoAlpha: 1 });
        gsap.set(bars, { scaleX: 1, autoAlpha: 0.6 });
        return;
      }

      gsap.set(lines, { yPercent: 110, autoAlpha: 0 });
      gsap.set(bars, { scaleX: 0, transformOrigin: 'left center' });

      const mm = gsap.matchMedia();
      mm.add(
        {
          isDesktop: '(min-width: 1024px)',
          isTablet: '(min-width: 640px) and (max-width: 1023px)',
          isMobile: '(max-width: 639px)',
        },
        (ctx) => {
          const { isMobile, isTablet } = ctx.conditions as Record<string, boolean>;
          const travel = isMobile ? 6 : isTablet ? 12 : 22; // % opposite-direction slide
          const endScale = isMobile ? 0.74 : 0.62;
          const scrollLen = isMobile ? '+=120%' : '+=180%';

          const tl = gsap.timeline({
            scrollTrigger: {
              id: TRIGGER.heroExit,
              trigger: scope.current!,
              start: 'top top',
              end: scrollLen,
              scrub: 0.6,
              pin: stage,
              pinSpacing: true,
              anticipatePin: 1,
            },
            defaults: { ease: GSAP_EASE_SMOOTH },
          });

          // statement rises + slides in opposite directions per line
          tl.to(lines, { yPercent: 0, autoAlpha: 1, duration: 0.4, stagger: 0.06 }, 0);
          lines.forEach((ln) => {
            const dir = Number((ln as HTMLElement).dataset.dir || 1);
            tl.to(ln, { xPercent: dir * travel, duration: 0.9, ease: 'none' }, 0.1);
          });
          // terminal compresses into its aperture and lifts
          tl.to(term, { scale: endScale, borderRadius: 18, y: -24, duration: 0.9 }, 0);
          // dealer-style data bars wipe across near the end
          tl.to(bars, { scaleX: 1, autoAlpha: 0.55, duration: 0.5, stagger: 0.05 }, 0.55);
          // stage darkens so the next scene reads underneath
          tl.to(stage, { backgroundColor: '#060708', duration: 0.6 }, 0.5);
        },
      );
    },
    { scope, dependencies: [reduced, mode], revertOnUpdate: true },
  );

  return (
    <section ref={scope} data-scene="hero-exit" className="relative" style={{ background: '#08090A', overflowX: 'clip' }}>
      <div data-stage className="relative flex h-screen items-center justify-center overflow-hidden" style={{ background: '#08090A' }}>
        {/* manifesto statement — centred, legible, the editorial backdrop */}
        <KineticHeadline
          lines={STATEMENT}
          className="pointer-events-none absolute inset-0 z-0 flex flex-col justify-center px-6 text-center text-[7.5vw] leading-[0.92] sm:text-[9vw] lg:text-[6.6vw]"
          color="rgba(244,244,245,0.17)"
        />
        {/* soft vignette so the focal terminal reads above the statement */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[1]" style={{ background: 'radial-gradient(ellipse 46% 40% at 50% 50%, rgba(8,9,10,0.82) 0%, rgba(8,9,10,0.35) 55%, transparent 78%)' }} />

        {/* focal terminal + a dealer-style depth ladder tied beneath it */}
        <div className="relative z-10 flex flex-col items-center gap-4" style={{ transform: 'translateY(-1%)' }}>
          <div
            data-aperture
            className="w-[min(600px,86vw)] overflow-hidden"
            style={{ aspectRatio: '560 / 236', background: '#0B0C0E', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 12, boxShadow: '0 40px 90px -30px rgba(0,0,0,0.95)' }}
          >
            <ApertureContent />
          </div>
          <div aria-hidden="true" className="pointer-events-none flex w-[min(600px,86vw)] flex-col gap-1.5 px-1">
            {[STEEL, AMBER, RED].map((c, i) => (
              <span key={i} data-wipe className="block h-[3px] origin-left rounded-full" style={{ width: `${[72, 54, 86][i]}%`, background: c, opacity: 0.55 }} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default HeroExitScene;
