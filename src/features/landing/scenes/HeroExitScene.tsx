import { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { KineticHeadline } from '../components/KineticHeadline';
import { useLandingMotion } from '../motion/LandingMotionProvider';
import { GSAP_EASE_SMOOTH, TRIGGER } from '../motion/motionTokens';

const STEEL = '#6A93B5';
const AMBER = '#C79350';
const RED = '#B23B3B';
const BORDER = 'rgba(255,255,255,0.10)';

const STATEMENT = ['READ THE FLOW', 'SEE THE PRESSURE', 'TRADE THE STRUCTURE'];

/** A small static terminal "aperture" — the shrinking foreground object. */
function ApertureTerminal() {
  return (
    <div style={{ width: '100%', height: '100%', background: '#0B0C0E', border: `1px solid rgba(255,255,255,0.14)`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 30px 80px -30px rgba(0,0,0,0.9)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 30, padding: '0 12px', borderBottom: `1px solid ${BORDER}` }}>
        <span style={{ fontFamily: 'var(--font-brand,monospace)', fontSize: 12, fontWeight: 700 }}>
          <span style={{ color: '#6B7177' }}>&gt;</span><span style={{ color: '#F4F5F6' }}>slayer_terminal</span>
        </span>
        <span style={{ width: 6, height: 6, borderRadius: 99, background: '#3F9C79' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', borderBottom: `1px solid ${BORDER}` }}>
        {[['NET GEX', '−$1.84B', RED], ['SPOT', '5,993', '#E5E5E5'], ['CALL WALL', '6,050', STEEL], ['EXP MOVE', '0.61%', AMBER]].map(([l, v, c], i) => (
          <div key={i} style={{ padding: '8px 10px', borderLeft: i ? `1px solid ${BORDER}` : 'none' }}>
            <div style={{ fontFamily: 'var(--font-brand,monospace)', fontSize: 8, letterSpacing: '0.16em', color: 'rgba(245,245,245,0.42)' }}>{l}</div>
            <div style={{ marginTop: 3, fontFamily: 'var(--font-brand,monospace)', fontSize: 13, fontWeight: 700, color: c as string }}>{v}</div>
          </div>
        ))}
      </div>
      <svg viewBox="0 0 400 150" preserveAspectRatio="none" style={{ width: '100%', height: 150 }}>
        <line x1="0" y1="48" x2="400" y2="48" stroke={STEEL} strokeOpacity="0.25" strokeDasharray="3 4" />
        <line x1="0" y1="104" x2="400" y2="104" stroke={RED} strokeOpacity="0.25" strokeDasharray="3 4" />
        <polyline points="0,86 40,92 80,70 120,80 160,58 200,72 240,50 280,66 320,54 360,64 400,58" fill="none" stroke={STEEL} strokeWidth="1.6" />
      </svg>
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
  const { reduced } = useLandingMotion();

  useGSAP(
    () => {
      const q = gsap.utils.selector(scope);
      const stage = q('[data-stage]')[0];
      const term = q('[data-aperture]')[0];
      const lines = q('[data-kinetic-line]');
      const bars = q('[data-wipe]');

      if (reduced) {
        gsap.set(term, { scale: 0.82 });
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
    { scope, dependencies: [reduced] },
  );

  return (
    <section ref={scope} data-scene="hero-exit" className="relative" style={{ background: '#08090A', overflowX: 'clip' }}>
      <div data-stage className="relative flex h-screen items-center justify-center overflow-hidden" style={{ background: '#08090A' }}>
        {/* background manifesto statement */}
        <KineticHeadline
          lines={STATEMENT}
          className="pointer-events-none absolute inset-0 z-0 flex flex-col justify-center px-6 text-[13vw] sm:text-[11vw] lg:text-[8.5vw]"
          color="rgba(244,244,245,0.10)"
        />
        {/* data-bar wipes */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/2 z-[1] flex -translate-y-1/2 flex-col gap-[7vh] px-6">
          {[STEEL, AMBER, RED].map((c, i) => (
            <span key={i} data-wipe className="block h-[3px] w-full origin-left" style={{ background: c, opacity: 0.5 }} />
          ))}
        </div>
        {/* foreground shrinking terminal aperture */}
        <div data-aperture className="relative z-10 w-[min(560px,86vw)]" style={{ aspectRatio: '560 / 236' }}>
          <ApertureTerminal />
        </div>
      </div>
    </section>
  );
}

export default HeroExitScene;
