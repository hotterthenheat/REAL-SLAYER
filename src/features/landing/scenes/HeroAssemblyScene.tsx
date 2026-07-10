import { useState } from 'react';
import { motion } from 'motion/react';
import SlayerCodeRain from '../../../components/SlayerCodeRain';
import { LayeredTerminalAssembly } from '../components/LayeredTerminalAssembly';
import { usePointerParallax } from '../hooks/usePointerParallax';
import { useLandingMotion } from '../motion/LandingMotionProvider';
import { EASE_PRIMARY, DUR } from '../motion/motionTokens';

const GHOST = '#F8F8FF';
const MUTED = 'rgba(245,245,245,0.62)';
const FAINT = 'rgba(245,245,245,0.42)';

const HERO_LINES = ['Read the flow.', 'Rank the contract.'];

interface Props {
  onEnter: (tab?: string) => void;
  onLaunch: () => void;
}

/**
 * Scene 1 — the hero. Left: the Slayer statement + CTAs. Right: the layered
 * terminal assembly loop inside a pointer-parallax stage. The code-rain backdrop
 * is HIDDEN by default and fades in only while the pointer is over the hero — the
 * terminal assembly itself carries the life, the backdrop is an on-hover reveal.
 * On touch (no hover) a faint static wash keeps the hero from reading as pure
 * black. Under reduced motion the assembly holds fully-formed and copy fades in.
 */
export function HeroAssemblyScene({ onEnter, onLaunch }: Props) {
  const { reduced, coarsePointer } = useLandingMotion();
  const stageRef = usePointerParallax<HTMLDivElement>({ disabled: reduced || coarsePointer });
  const [hovered, setHovered] = useState(false);
  // hover reveal on fine pointers; a faint static wash on touch / reduced motion
  const backdropOpacity = coarsePointer || reduced ? 0.12 : hovered ? 0.5 : 0;

  return (
    <section
      className="relative overflow-hidden"
      style={{ minHeight: '92vh', background: '#08090A' }}
      data-scene="hero"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* backdrop — hidden until the pointer is over the hero (a deliberate reveal) */}
      <div
        aria-hidden="true"
        className="absolute inset-0 z-0 motion-safe:transition-opacity motion-safe:duration-[600ms]"
        style={{ opacity: backdropOpacity, transitionTimingFunction: 'cubic-bezier(0.16,1,0.3,1)' }}
      >
        <SlayerCodeRain />
      </div>

      <div className="relative z-10 mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-5 py-16 lg:grid-cols-[1.02fr_1.18fr] lg:py-24">
        {/* copy */}
        <motion.div
          initial={reduced ? false : 'hidden'}
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } } }}
        >
          <motion.div
            variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: DUR.reveal, ease: EASE_PRIMARY } } }}
            className="mb-4 inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: FAINT }}
          >
            <span className="inline-block h-1 w-1 rounded-full" style={{ background: '#3F9C79' }} />
            From Traders. For Traders.
          </motion.div>
          <h1 className="text-[36px] font-semibold leading-[1.05] sm:text-[46px]" style={{ color: GHOST, letterSpacing: '-0.02em' }}>
            {HERO_LINES.map((ln, i) => (
              <span key={ln} className="block overflow-hidden pb-[0.08em] -mb-[0.08em]">
                <motion.span
                  className="block will-change-transform"
                  initial={reduced ? false : { y: '110%' }}
                  animate={{ y: '0%' }}
                  transition={{ duration: 0.9, delay: 0.1 + i * 0.12, ease: EASE_PRIMARY }}
                >
                  {ln}
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
              className="rounded-[7px] bg-[#F4F4F5] px-5 py-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#0A0806] transition-opacity hover:opacity-90 cursor-pointer"
            >
              Launch Terminal
            </button>
            <button
              onClick={() => onEnter('pinpoint')}
              className="rounded-[7px] border border-white/15 px-5 py-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#F4F4F5] transition-colors hover:border-white/30 cursor-pointer"
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
        <div style={{ perspective: 1400 }}>
          <div ref={stageRef} style={{ transformStyle: 'preserve-3d' }}>
            <LayeredTerminalAssembly reduced={reduced} />
          </div>
        </div>
      </div>
    </section>
  );
}

export default HeroAssemblyScene;
