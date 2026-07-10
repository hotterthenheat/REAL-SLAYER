import { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { TerminalLogo } from '../../../components/BrandLogo';
import { EASE_PRIMARY } from '../motion/motionTokens';

/**
 * Scene 1 — the landing preloader. A Slayer-branded cover that holds only as long
 * as needed, then WIPES apart (two masks separate vertically) to reveal the hero
 * already rendered underneath — no flash, no fake multi-second timer. The hero is
 * always mounted beneath this overlay, so the wipe genuinely reveals it and the
 * overlap reads as one continuous entrance. Under reduced motion it is a short
 * fade with no wipe or long hold.
 *
 * minimumVisibleTime ≈ 900ms · the cover never traps the visitor past the wipe.
 */
export function LandingPreloader() {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<'hold' | 'exit' | 'gone'>('hold');

  useEffect(() => {
    const minVisible = reduce ? 350 : 900;
    const t = window.setTimeout(() => setPhase('exit'), minVisible);
    return () => window.clearTimeout(t);
  }, [reduce]);

  if (phase === 'gone') return null;

  // Reduced motion: single fade, no wipe.
  if (reduce) {
    return (
      <AnimatePresence onExitComplete={() => setPhase('gone')}>
        {phase !== 'exit' && (
          <motion.div
            key="pre"
            className="fixed inset-0 z-[120] flex items-center justify-center"
            style={{ background: 'var(--background)' }}
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
          >
            <TerminalLogo expanded />
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  const wiping = phase === 'exit';
  return (
    // While the cover is opaque it must CATCH input (otherwise clicks fall through
    // to invisible UI underneath); once the wipe starts it releases the page.
    <div className={`fixed inset-0 z-[120] ${wiping ? 'pointer-events-none' : 'pointer-events-auto'}`} aria-hidden={wiping}>
      {/* two masks that separate to reveal the hero underneath */}
      <motion.div
        className="absolute inset-x-0 top-0 h-1/2 origin-top"
        style={{ background: 'var(--background)' }}
        initial={{ y: 0 }}
        animate={{ y: wiping ? '-100%' : 0 }}
        transition={{ duration: 0.62, ease: EASE_PRIMARY }}
      />
      <motion.div
        className="absolute inset-x-0 bottom-0 h-1/2 origin-bottom"
        style={{ background: 'var(--background)' }}
        initial={{ y: 0 }}
        animate={{ y: wiping ? '100%' : 0 }}
        transition={{ duration: 0.62, ease: EASE_PRIMARY }}
        onAnimationComplete={() => wiping && setPhase('gone')}
      />
      {/* brand lockup + minimal loading indicator — contracts slightly, then fades
          as the masks part (overlaps the hero reveal by ~300ms). */}
      <motion.div
        className="absolute inset-0 z-[1] flex flex-col items-center justify-center gap-8"
        animate={{ opacity: wiping ? 0 : 1, scale: wiping ? 0.94 : 1 }}
        transition={{ duration: 0.34, ease: EASE_PRIMARY }}
      >
        <TerminalLogo expanded />
      </motion.div>
      <div className="absolute inset-x-0 bottom-[14vh] z-[1] flex justify-center">
        <motion.span
          className="block h-px w-40 origin-left overflow-hidden"
          style={{ background: 'var(--border-strong)' }}
          animate={{ opacity: wiping ? 0 : 1 }}
        >
          <motion.span
            className="block h-full"
            style={{ background: 'var(--accent-color)' }}
            initial={{ width: '10%' }}
            animate={{ width: wiping ? '100%' : '82%' }}
            transition={{ duration: 0.9, ease: EASE_PRIMARY }}
          />
        </motion.span>
      </div>
    </div>
  );
}

export default LandingPreloader;
