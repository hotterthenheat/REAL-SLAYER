import { useEffect, useState } from 'react';
import { motion } from 'motion/react';

// Brand ink — same vars/defaults as BrandLogo.tsx (HTML-exact in dark themes:
// prompt #6B7177, wordmark/caret #F4F5F6; .light-theme swaps ink to near-black
// in index.css so the lockup stays legible on light surfaces).
const BRAND_PROMPT = 'var(--brand-prompt, #6B7177)';
const BRAND_INK = 'var(--brand-ink, #F4F5F6)';

/**
 * SlayerLoader — the full-screen boot sequence. Reads as a terminal coming
 * online, not a marketing splash: the brand lockup, a subsystem boot log that
 * fills as the count climbs, and one hairline progress rail. Flat token canvas,
 * system type, semantic status color only. No wash, no sweep, no glow.
 */

/** Subsystems brought online, in order. `at` = the count % they clear at. */
const BOOT_STEPS: { at: number; label: string }[] = [
  { at: 14, label: 'Market data feed' },
  { at: 32, label: 'Options chain' },
  { at: 50, label: 'GEX / DEX / VEX model' },
  { at: 68, label: 'Dealer positioning map' },
  { at: 84, label: 'Greeks engine' },
  { at: 96, label: 'Session' },
];

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

function BootRow({ label, at, idx }: { label: string; at: number; idx: number }) {
  const done = idx >= at;
  // "active" = the step currently clearing (within the last band before `at`)
  const active = !done && idx >= at - 18;
  const tag = done ? 'OK' : active ? '··' : '—';
  const tagColor = done
    ? 'var(--positive-ink, #2f9d45)'
    : active
      ? 'var(--accent-color)'
      : 'var(--text-muted, var(--text-tertiary))';
  const labelColor = done || active ? 'var(--text-secondary)' : 'var(--text-tertiary)';
  return (
    <div className="flex items-center gap-3 py-[3px]" style={{ opacity: done || active ? 1 : 0.5 }}>
      <span
        className="w-6 text-right text-[11px] font-semibold tabular-nums"
        style={{ color: tagColor, letterSpacing: '0.04em' }}
      >
        {tag}
      </span>
      <span className="text-[12px]" style={{ color: labelColor }}>
        {label}
      </span>
    </div>
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
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden antialiased"
      style={{ background: 'var(--background)', color: 'var(--text-primary)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-[300px] px-1 sm:w-[360px]"
      >
        {/* brand lockup — HTML-exact: dim ">" prompt, single-ink wordmark, blink caret (no glow) */}
        <div
          className="flex items-center text-[15px] font-bold leading-none sm:text-[17px]"
          style={{ fontFamily: 'var(--font-brand)', letterSpacing: '-0.01em' }}
          aria-label="slayer_terminal"
        >
          <span aria-hidden="true" style={{ color: BRAND_PROMPT, fontWeight: 700, fontSize: '0.84em', marginRight: '0.06em' }}>&gt;</span>
          <span style={{ color: BRAND_INK }}>slayer_terminal</span>
          <span
            aria-hidden="true"
            className="slayer-caret"
            style={{ display: 'inline-block', width: '0.5em', height: '0.92em', marginLeft: '0.12em', borderRadius: 1, background: BRAND_INK }}
          />
        </div>

        <div
          className="mt-2 text-[10px] font-semibold uppercase"
          style={{ letterSpacing: '0.16em', color: 'var(--text-tertiary)' }}
        >
          System boot
        </div>

        {/* hairline */}
        <div className="mt-4 h-px w-full" style={{ background: 'var(--border)' }} />

        {/* subsystem boot log — fills as the count climbs */}
        <div className="mt-4">
          {BOOT_STEPS.map((s) => (
            <BootRow key={s.label} label={s.label} at={s.at} idx={idx} />
          ))}
        </div>

        {/* progress — dominant count + single flat accent rail */}
        <div className="mt-5 flex items-baseline gap-2">
          <span
            className="text-[26px] font-bold leading-none tabular-nums"
            style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}
          >
            {String(idx).padStart(2, '0')}
          </span>
          <span
            className="text-[10px] font-semibold uppercase tabular-nums"
            style={{ letterSpacing: '0.16em', color: 'var(--text-tertiary)' }}
          >
            / 100
          </span>
        </div>

        <div className="relative mt-2 h-px w-full overflow-hidden" style={{ background: 'var(--border)' }}>
          <div
            className="absolute inset-y-0 left-0 transition-[width] duration-150 ease-out"
            style={{ width: `${idx}%`, background: 'var(--accent-color)' }}
          />
        </div>

        <div
          className="mt-3 flex items-center gap-2 text-[10px] font-medium uppercase"
          style={{ letterSpacing: '0.16em', color: 'var(--text-secondary)' }}
        >
          <span className="tabular-nums">{label}</span>
          {/* CSS caret blink — hard steps(1), matching the brand caret timing */}
          <span aria-hidden="true" className="slayer-caret inline-block h-[9px] w-[6px]" style={{ background: 'var(--accent-color)' }} />
          {sub ? (
            <span style={{ color: 'var(--text-tertiary)', letterSpacing: '0.16em' }}>· {sub}</span>
          ) : null}
        </div>
      </motion.div>
    </div>
  );
}
