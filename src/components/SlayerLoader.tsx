import { motion } from 'motion/react';

/**
 * SlayerLoader — the full-screen boot / loading sequence. Cinematic and
 * editorial (big wordmark, a single scanning accent line, restrained motion)
 * rather than a spinner. Pure black canvas, SF-Pro display type, the GEX
 * palette as the only accent. No glow, no gamified effects.
 */
export default function SlayerLoader({
  label = 'Loading',
  sub,
}: {
  label?: string;
  sub?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center overflow-hidden antialiased"
      style={{ background: '#000000', color: '#F5F5F5' }}
    >
      {/* restrained top wash — structure, not glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(1100px 480px at 50% -10%, rgba(68,49,153,0.14), transparent 70%)' }}
      />
      {/* faint scanning sweep across the whole frame */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 w-[40%]"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(248,248,255,0.035), transparent)' }}
        initial={{ x: '-60%' }}
        animate={{ x: '160%' }}
        transition={{ duration: 2.6, ease: 'easeInOut', repeat: Infinity }}
      />

      <div className="relative flex flex-col items-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="text-[10px] font-semibold uppercase"
          style={{ letterSpacing: '0.34em', color: 'rgba(245,245,245,0.34)' }}
        >
          Institutional Options Intelligence
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
          className="mt-4 text-center text-[42px] font-semibold leading-none sm:text-[64px]"
          style={{ color: '#F8F8FF', letterSpacing: '-0.03em' }}
        >
          SLAYER<span style={{ color: 'rgba(245,245,245,0.30)' }}> TERMINAL</span>
        </motion.h1>

        {/* scanning progress rail (indeterminate) */}
        <div
          className="relative mt-9 h-px w-[220px] overflow-hidden sm:w-[300px]"
          style={{ background: 'rgba(248,248,255,0.10)' }}
        >
          <motion.div
            className="absolute inset-y-0 w-1/3"
            style={{ background: 'linear-gradient(90deg, transparent, #443199, #792CA2, #C13383, transparent)' }}
            initial={{ x: '-120%' }}
            animate={{ x: '360%' }}
            transition={{ duration: 1.5, ease: 'easeInOut', repeat: Infinity }}
          />
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-5 flex items-center gap-2 text-[11px] uppercase"
          style={{ letterSpacing: '0.18em', color: 'rgba(245,245,245,0.6)' }}
        >
          <span className="tabular-nums">{label}</span>
          <motion.span
            aria-hidden="true"
            className="inline-block h-[9px] w-[6px]"
            style={{ background: '#C13383' }}
            animate={{ opacity: [1, 0.15, 1] }}
            transition={{ duration: 1.1, repeat: Infinity, ease: 'steps(1)' as any }}
          />
        </motion.div>

        {sub ? (
          <div className="mt-2 text-[10px] uppercase tracking-[0.16em]" style={{ color: 'rgba(245,245,245,0.3)' }}>
            {sub}
          </div>
        ) : null}
      </div>

      {/* bottom brand rule */}
      <div className="absolute bottom-6 left-0 right-0 flex justify-center">
        <span className="text-[10px] font-semibold tracking-[0.02em]" style={{ color: 'rgba(245,245,245,0.28)' }}>
          &gt;slayer<span style={{ color: 'rgba(245,245,245,0.16)' }}>_terminal</span>
        </span>
      </div>
    </div>
  );
}
