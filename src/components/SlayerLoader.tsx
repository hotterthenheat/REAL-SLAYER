import { useEffect, useState } from 'react';
import { motion } from 'motion/react';

/**
 * SlayerLoader — the full-screen boot / loading sequence. Editorial and
 * cinematic in the spirit of a high-end race-driver / studio splash: a big
 * wordmark, a climbing count index, corner meta framing, and one restrained
 * scanning accent. Pure black canvas, SF-Pro display type, the GEX palette as
 * the only accent. No glow, no spinners, no gamified effects.
 */

/** Climbs 00 → 99 on an ease-out curve, then holds. Honest "still loading" read. */
function useCountIndex(durationMs = 2200) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    let start = 0;
    const tick = (t: number) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / durationMs);
      // easeOutCubic, capped at 99 so it never claims "done"
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.min(99, Math.round(eased * 99)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [durationMs]);
  return n;
}

function CornerMeta({
  className,
  align = 'left',
  lines,
}: {
  className: string;
  align?: 'left' | 'right';
  lines: string[];
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8, delay: 0.25 }}
      className={`pointer-events-none absolute hidden flex-col gap-1 sm:flex ${className}`}
      style={{ textAlign: align }}
    >
      {lines.map((l, i) => (
        <span
          key={i}
          className="text-[9.5px] font-medium uppercase"
          style={{ letterSpacing: '0.22em', color: i === 0 ? 'rgba(245,245,245,0.42)' : 'rgba(245,245,245,0.24)' }}
        >
          {l}
        </span>
      ))}
    </motion.div>
  );
}

export default function SlayerLoader({
  label = 'Loading',
  sub,
}: {
  label?: string;
  sub?: string;
}) {
  const idx = useCountIndex();
  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center overflow-hidden antialiased"
      style={{ background: '#000000', color: '#F5F5F5' }}
    >
      {/* restrained top wash — structure, not glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(1100px 480px at 50% -12%, rgba(68,49,153,0.14), transparent 70%)' }}
      />
      {/* faint scanning sweep across the whole frame */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 w-[40%]"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(248,248,255,0.03), transparent)' }}
        initial={{ x: '-60%' }}
        animate={{ x: '160%' }}
        transition={{ duration: 2.8, ease: 'easeInOut', repeat: Infinity }}
      />

      {/* corner meta framing — editorial splash */}
      <CornerMeta className="left-6 top-6" align="left" lines={['Slayer Terminal', 'Options Intelligence']} />
      <CornerMeta className="right-6 top-6" align="right" lines={['Dealer Positioning', 'GEX · DEX · VEX']} />
      <CornerMeta className="left-6 bottom-6" align="left" lines={['Est. 2025', 'Institutional Desk']} />

      <div className="relative flex flex-col items-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="text-[10px] font-semibold uppercase"
          style={{ letterSpacing: '0.34em', color: 'rgba(245,245,245,0.34)' }}
        >
          Read the flow. Rank the contract.
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
          className="mt-4 flex items-center justify-center text-center text-[34px] font-extrabold leading-none sm:text-[56px]"
          style={{ color: '#F8F8FF', letterSpacing: '-0.02em', fontFamily: 'var(--font-brand)' }}
          aria-label="slayer_terminal"
        >
          <span aria-hidden="true" style={{ color: 'rgba(245,245,245,0.42)', fontWeight: 700, fontSize: '0.84em', marginRight: '0.04em' }}>&gt;</span>
          <span>slayer_terminal</span>
          <span
            aria-hidden="true"
            className="slayer-caret"
            style={{ display: 'inline-block', width: '0.5em', height: '0.92em', marginLeft: '0.14em', borderRadius: 2, background: '#F8F8FF', boxShadow: '0 0 18px rgba(244,245,246,0.5)' }}
          />
        </motion.h1>

        {/* climbing count index — the editorial loader signature */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.14 }}
          className="mt-8 flex items-baseline gap-3"
        >
          <span
            className="text-[34px] font-semibold leading-none tabular-nums sm:text-[42px]"
            style={{ color: '#F8F8FF', letterSpacing: '-0.02em' }}
          >
            {String(idx).padStart(2, '0')}
          </span>
          <span
            className="text-[11px] font-medium uppercase"
            style={{ letterSpacing: '0.2em', color: 'rgba(245,245,245,0.34)' }}
          >
            / 100
          </span>
        </motion.div>

        {/* determinate-feel progress rail driven by the count */}
        <div
          className="relative mt-6 h-px w-[240px] overflow-hidden sm:w-[320px]"
          style={{ background: 'rgba(248,248,255,0.10)' }}
        >
          <div
            className="absolute inset-y-0 left-0 transition-[width] duration-150 ease-out"
            style={{
              width: `${idx}%`,
              background: 'linear-gradient(90deg, #443199, #792CA2, #C13383, #E05454)',
            }}
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
          {/* CSS caret blink — hard steps(1), matching the brand caret timing */}
          <span aria-hidden="true" className="slayer-caret inline-block h-[9px] w-[6px]" style={{ background: '#C13383' }} />
        </motion.div>

        {sub ? (
          <div className="mt-2 text-[10px] uppercase tracking-[0.16em]" style={{ color: 'rgba(245,245,245,0.3)' }}>
            {sub}
          </div>
        ) : null}
      </div>

      {/* bottom brand rule */}
      <div className="absolute bottom-6 left-0 right-0 flex justify-center">
        <span className="text-[10px] font-bold tracking-[0.02em]" style={{ color: 'rgba(245,245,245,0.28)', fontFamily: 'var(--font-brand)' }}>
          &gt;slayer<span style={{ color: 'rgba(245,245,245,0.16)' }}>_terminal</span>
        </span>
      </div>
    </div>
  );
}
