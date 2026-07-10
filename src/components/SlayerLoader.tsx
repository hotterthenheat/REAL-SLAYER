import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

// Brand ink — same vars/defaults as BrandLogo.tsx (HTML-exact in dark themes:
// prompt #6B7177, wordmark/caret #F4F5F6; .light-theme swaps ink to near-black
// in index.css so the lockup stays legible on light surfaces).
const BRAND_PROMPT = 'var(--brand-prompt, #6B7177)';
const BRAND_INK = 'var(--brand-ink, #F4F5F6)';

/**
 * SlayerLoader — the global full-screen loading cover. One centered
 * `>slayer_terminal▌` lockup over a flat token canvas, with a single hairline
 * progress rail near the bottom that eases toward — but never reaches — full,
 * so it always reads as "still working" rather than claiming it's done. The
 * label/sub render as an unobtrusive micro-caption above the rail so the cover
 * stays honest about what it's waiting on without cluttering the wordmark.
 *
 * This is the same minimal lockup the landing preloader wipes away, so every
 * loading surface in the app reads as the one terminal coming online. Under
 * reduced motion the rail is static (no climb) and the entrance fade is skipped.
 */
export default function SlayerLoader({
  label = 'Loading',
  sub,
}: {
  label?: string;
  sub?: string;
}) {
  const reduce = useReducedMotion();
  const [pct, setPct] = useState(reduce ? 84 : 8);

  useEffect(() => {
    if (reduce) return;
    let raf = 0;
    let start = 0;
    const tick = (t: number) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / 2200);
      // easeOutCubic toward 92% and hold — honest "still loading", never 100%.
      const eased = 1 - Math.pow(1 - p, 3);
      setPct(8 + eased * 84);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduce]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden antialiased"
      style={{ background: 'var(--background)', color: 'var(--text-primary)' }}
    >
      {/* centered brand lockup — HTML-exact: dim ">" prompt, single-ink wordmark, blink caret */}
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-center text-[18px] font-bold leading-none sm:text-[20px]"
        style={{ fontFamily: 'var(--font-brand)', letterSpacing: '-0.02em' }}
        aria-label={`slayer_terminal — ${label}`}
      >
        <span aria-hidden="true" style={{ color: BRAND_PROMPT, fontWeight: 700, fontSize: '0.84em', marginRight: '0.06em' }}>&gt;</span>
        <span style={{ color: BRAND_INK }}>slayer_terminal</span>
        <span
          aria-hidden="true"
          className="slayer-caret"
          style={{
            display: 'inline-block',
            width: '0.5em',
            height: '0.92em',
            marginLeft: '0.14em',
            borderRadius: 2,
            background: BRAND_INK,
            boxShadow: `0 0 18px color-mix(in srgb, ${BRAND_INK} 50%, transparent)`,
          }}
        />
      </motion.div>

      {/* micro-caption + one hairline progress rail near the bottom */}
      <div className="absolute inset-x-0 bottom-[13vh] flex flex-col items-center gap-3 px-6">
        <div
          className="flex items-center gap-2 text-center text-[10px] font-semibold uppercase"
          style={{ letterSpacing: '0.18em', color: 'var(--text-tertiary)' }}
        >
          <span className="tabular-nums">{label}</span>
          {sub ? <span style={{ opacity: 0.7 }}>· {sub}</span> : null}
        </div>
        <span className="block h-px w-40 overflow-hidden" style={{ background: 'var(--border-strong, var(--border))' }}>
          <span
            className="block h-full transition-[width] duration-150 ease-out"
            style={{ width: `${pct}%`, background: 'var(--accent-color)' }}
          />
        </span>
      </div>
    </div>
  );
}
