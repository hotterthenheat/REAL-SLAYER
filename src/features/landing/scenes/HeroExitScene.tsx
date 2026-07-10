import { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { KineticHeadline } from '../components/KineticHeadline';
import { useLandingMotion } from '../motion/LandingMotionProvider';
import { GSAP_EASE_SMOOTH, TRIGGER } from '../motion/motionTokens';

const STEEL = '#6A93B5';
const AMBER = '#C79350';
const RED = '#B23B3B';
const GREEN = '#3F9C79';

const STATEMENT = ['Trade the structure,', 'not the noise.'];

/** The three concrete things Slayer reads — each one a real market-structure
 *  concept, so the statement lands on substance rather than a slogan. */
const PILLARS: { k: string; label: string; body: string; color: string }[] = [
  {
    k: '01',
    label: 'Gamma walls',
    body: 'Where dealer hedging pins price — the call and put walls that cap and floor the move.',
    color: STEEL,
  },
  {
    k: '02',
    label: 'Flip levels',
    body: 'The gamma flip that turns dealers from stabilizing to amplifying — where trend accelerates.',
    color: AMBER,
  },
  {
    k: '03',
    label: 'Flow pressure',
    body: 'Live sweeps, blocks and dark-pool prints — the positioning that moves before the tape does.',
    color: RED,
  },
];

/**
 * Scene 2 — the thesis. After the hero terminal, a single plain-English
 * statement of what Slayer is FOR ("Trade the structure, not the noise.")
 * rises into view, followed by the three concrete structural concepts it maps.
 * This is a short scrubbed reveal — NOT pinned — so it scrolls past naturally
 * with no scroll trap and never repeats the hero card. Under reduced motion it
 * renders fully-formed and static.
 */
export function HeroExitScene() {
  const scope = useRef<HTMLDivElement | null>(null);
  const { reduced } = useLandingMotion();

  useGSAP(
    () => {
      const q = gsap.utils.selector(scope);
      const lines = q('[data-kinetic-line]');
      const sub = q('[data-sub]');
      const pillars = q('[data-pillar]');

      if (reduced) {
        gsap.set([lines, sub, pillars], { autoAlpha: 1, yPercent: 0, y: 0 });
        return;
      }

      gsap.set(lines, { yPercent: 110, autoAlpha: 0 });
      gsap.set(sub, { y: 22, autoAlpha: 0 });
      gsap.set(pillars, { y: 30, autoAlpha: 0 });

      const tl = gsap.timeline({
        scrollTrigger: {
          id: TRIGGER.heroExit,
          trigger: scope.current!,
          start: 'top 78%',
          end: 'bottom 60%',
          scrub: 0.6,
        },
        defaults: { ease: GSAP_EASE_SMOOTH },
      });

      tl.to(lines, { yPercent: 0, autoAlpha: 1, duration: 0.5, stagger: 0.1 }, 0);
      tl.to(sub, { y: 0, autoAlpha: 1, duration: 0.5 }, 0.35);
      tl.to(pillars, { y: 0, autoAlpha: 1, duration: 0.6, stagger: 0.12 }, 0.5);
    },
    { scope, dependencies: [reduced], revertOnUpdate: true },
  );

  return (
    <section
      ref={scope}
      data-scene="hero-exit"
      className="relative flex min-h-[86vh] flex-col justify-center px-5 py-24 sm:px-8 lg:px-10"
      style={{ background: '#08090A' }}
    >
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-4 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'rgba(245,245,245,0.42)' }}>
          <span className="inline-block h-1 w-1 rounded-full" style={{ background: GREEN }} />
          What Slayer reads
        </div>

        {/* the thesis — plain English, no cryptic three-word chant */}
        <KineticHeadline
          lines={STATEMENT}
          className="max-w-4xl text-[9vw] font-semibold leading-[0.98] sm:text-[7vw] lg:text-[64px]"
          color="#F4F4F5"
        />

        <p data-sub className="mt-6 max-w-2xl text-[15px] leading-relaxed sm:text-[16px]" style={{ color: 'rgba(245,245,245,0.62)' }}>
          Options dealers hedge around a handful of price levels — gamma walls, pin zones and flip points.
          That&rsquo;s the structure that actually moves the market. Slayer maps it live, then ranks the
          contracts that trade it.
        </p>

        <div className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] sm:grid-cols-3">
          {PILLARS.map((p) => (
            <div key={p.k} data-pillar className="flex flex-col gap-3 bg-[#0B0C0E] p-6">
              <div className="flex items-center gap-2.5">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
                <span className="font-mono text-[11px] tracking-[0.16em]" style={{ color: 'rgba(245,245,245,0.38)' }}>{p.k}</span>
              </div>
              <div className="text-[16px] font-semibold" style={{ color: '#F4F4F5' }}>{p.label}</div>
              <p className="text-[13.5px] leading-relaxed" style={{ color: 'rgba(245,245,245,0.56)' }}>{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default HeroExitScene;
