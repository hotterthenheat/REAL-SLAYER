import { motion } from 'motion/react';
import SlayerCodeRain from '../../../components/SlayerCodeRain';
import { CursorSpotlight } from '../components/CursorSpotlight';
import { LayeredTerminalAssembly } from '../components/LayeredTerminalAssembly';
import { usePointerParallax } from '../hooks/usePointerParallax';
import { useLandingMotion } from '../motion/LandingMotionProvider';
import { EASE_PRIMARY, DUR, STAGGER } from '../motion/motionTokens';
import { MarqueeTicker } from '../content/LandingSections';
import { DrawnAccent } from '../components/DrawnAccent';

const GHOST = '#F8F8FF';
const MUTED = 'rgba(245,245,245,0.62)';
const FAINT = 'rgba(245,245,245,0.42)';

// "flow." carries the drawn accent — one hand-drawn emphasis mark per viewport.
const HERO_LINES: { key: string; node: React.ReactNode }[] = [
  { key: 'l1', node: <>Read the <DrawnAccent variant="underline" delay={1.15}>flow.</DrawnAccent></> },
  { key: 'l2', node: 'Rank the contract.' },
];

interface Props {
  onEnter: (tab?: string) => void;
  onLaunch: () => void;
}

/**
 * Scene 1 — the hero. Left: the Slayer statement + CTAs. Right: the layered
 * terminal assembly (assembles once, stays alive) inside a pointer-parallax
 * stage. The code-rain backdrop is revealed ONLY around the cursor — a torch
 * moving over the dark surface — never across the whole screen. On touch it is
 * a faint static wash; under reduced motion the assembly holds fully-formed.
 */
export function HeroAssemblyScene({ onEnter, onLaunch }: Props) {
  const { reduced, coarsePointer } = useLandingMotion();
  const stageRef = usePointerParallax<HTMLDivElement>({ disabled: reduced || coarsePointer });

  return (
    <section
      className="relative flex flex-col overflow-hidden"
      style={{
        minHeight: '100vh',
        // Institutional atmosphere — a faint emerald bloom at the crown over pure black.
        background:
          'radial-gradient(56% 44% at 50% -8%, rgba(38,194,129,0.08), transparent 64%),' +
          'radial-gradient(44% 38% at 100% 110%, rgba(38,194,129,0.03), transparent 70%),' +
          '#0A0B0D',
      }}
      data-scene="hero"
    >
      {/* backdrop — a pool of light that follows the pointer, revealing the
          code-rain only where the cursor is */}
      <CursorSpotlight radius={340} strength={1} staticFallback={coarsePointer || reduced} className="z-0">
        <SlayerCodeRain />
      </CursorSpotlight>

      {/* the composition fills the viewport: copy + assembly truly centred in the
          available height, the capability strip anchored to the hero's bottom edge —
          no dead band under the fold. The flex-1 wrapper (items-center) is what
          vertically centres the grid; a grid's own `items-center` only centres the
          columns within their row, leaving the row itself pinned to the top. */}
      <div className="relative z-10 flex flex-1 items-center px-5 py-14 sm:px-8 lg:py-10">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-12 lg:grid-cols-[0.92fr_1.25fr]">
        {/* copy */}
        <motion.div
          initial={reduced ? false : 'hidden'}
          animate="show"
          variants={{ show: { transition: { staggerChildren: STAGGER.layer, delayChildren: 0.05 } } }}
        >
          <motion.div
            variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: DUR.reveal, ease: EASE_PRIMARY } } }}
            className="mb-4 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: FAINT }}
          >
            <span className="inline-block h-1 w-1 rounded-full" style={{ background: '#3F9C79' }} />
            From Traders. For Traders.
          </motion.div>
          <h1 className="text-[38px] font-semibold leading-[1.04] sm:text-[52px]" style={{ color: GHOST, letterSpacing: '-0.02em' }}>
            {HERO_LINES.map((ln, i) => (
              <span key={ln.key} className="block overflow-hidden pb-[0.14em] -mb-[0.14em]">
                <motion.span
                  className="block will-change-transform"
                  initial={reduced ? false : { y: '110%' }}
                  animate={{ y: '0%' }}
                  transition={{ duration: DUR.hero, delay: 0.1 + i * STAGGER.loose, ease: EASE_PRIMARY }}
                >
                  {ln.node}
                </motion.span>
              </span>
            ))}
          </h1>
          <motion.p
            variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: DUR.reveal, ease: EASE_PRIMARY } } }}
            className="mt-5 max-w-xl text-[15px] leading-relaxed"
            style={{ color: MUTED }}
          >
            SkyVision finds the setup, Pinpoint reads the flow. GEX, DEX, VEX, dealer positioning
            and volatility structure — one clean trading command center.
          </motion.p>
          <motion.div
            variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: DUR.reveal, ease: EASE_PRIMARY } } }}
            className="mt-7 flex flex-wrap items-center gap-3"
          >
            <button
              onClick={onLaunch}
              className="rounded-[5px] px-5 py-3 text-[12px] font-bold uppercase tracking-[0.12em] transition-all hover:brightness-110 cursor-pointer"
              style={{
                background: 'var(--accent-color)',
                color: 'var(--primary-contrast)',
                boxShadow: '0 8px 28px -10px var(--accent-glow, rgba(38,194,129,0.35))',
              }}
            >
              Launch Terminal
            </button>
            <button
              onClick={() => onEnter('pinpoint')}
              className="rounded-[5px] border border-white/15 px-5 py-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#E6E9EF] transition-colors hover:border-white/30 cursor-pointer"
            >
              View Terminal Preview
            </button>
          </motion.div>
          <motion.p
            variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: DUR.reveal, ease: EASE_PRIMARY } } }}
            className="mt-5 text-[11.5px]"
            style={{ color: FAINT }}
          >
            Built for traders who need levels, context, and execution clarity.
          </motion.p>
        </motion.div>

        {/* the assembly stage — pointer parallax owns THIS wrapper's transform */}
        <div className="flex flex-col items-center gap-4">
          <div style={{ perspective: 1400 }} className="w-full">
            <div ref={stageRef} style={{ transformStyle: 'preserve-3d' }}>
              <LayeredTerminalAssembly reduced={reduced} />
            </div>
          </div>
          {/* orienting caption — so a first-time visitor knows what the card is */}
          <motion.p
            initial={reduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DUR.reveal, delay: 0.6, ease: EASE_PRIMARY }}
            className="flex items-center gap-2 text-center text-[11.5px] font-medium tracking-[0.02em]"
            style={{ color: FAINT }}
          >
            <span className="inline-block h-1 w-1 rounded-full" style={{ background: '#3F9C79' }} />
            The Slayer desk — dealer positioning, ranked setups &amp; live flow
          </motion.p>
        </div>
        </div>
      </div>

      {/* what the desk reads — anchored to the hero's bottom edge so the fold
          closes on signal, not on empty background */}
      <div className="relative z-10" style={{ borderTop: '1px solid var(--border)' }}>
        <MarqueeTicker />
      </div>
    </section>
  );
}

export default HeroAssemblyScene;
