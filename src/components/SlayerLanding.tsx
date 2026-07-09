import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'motion/react';

/**
 * SlayerLanding — the full-screen marketing landing page for Slayer Terminal.
 *
 * Institutional / data-first, not a SaaS template: pure-black canvas, deep
 * #100C08 panels, thin hairline borders, tabular numerics, restrained colour
 * (colour encodes data, never decorates). The hero + preview mockups read
 * REAL fields off the live store when present and fall back to an honest "—"
 * — nothing here is fabricated.
 *
 * Rendered full-bleed (its own top nav replaces the app shell); product nav
 * links call `onEnter(tab)` to cross into the terminal, and every launch CTA
 * calls `onLaunch()` (which signs the visitor in or opens the terminal). The
 * product is live — there is no waitlist.
 */

const PALETTE = {
  bg: '#000000',
  panel: '#100C08',
  panelSoft: '#0A0806',
  text: '#F5F5F5',
  ghost: '#F8F8FF',
  red: '#980404',
  green: '#0D4715',
  gex: ['#443199', '#792CA2', '#C13383', '#E05454'] as const,
};

const line = 'rgba(248,248,255,0.10)';
const lineStrong = 'rgba(248,248,255,0.18)';
const muted = 'rgba(245,245,245,0.52)';
const faint = 'rgba(245,245,245,0.32)';

type HeroMetrics = {
  spot?: number | null;
  netGex?: number | null;
  callWall?: number | null;
  putWall?: number | null;
  pin?: number | null;
  expectedMovePct?: number | null; // fraction, e.g. 0.0165
};

type RankedRow = { symbol: string; setup: string; bias: 'BULL' | 'BEAR'; confidence: number; expMovePct?: number | null };
type PressureRow = { strike: number; net: number; kind?: 'callWall' | 'putWall' | 'pin' | 'spot' };

export interface SlayerLandingProps {
  ticker?: string;
  metrics?: HeroMetrics;
  ranked?: RankedRow[];
  pressure?: PressureRow[];
  spark?: number[]; // real close series for the mini chart
  onEnter: (tab?: string) => void;
  onLaunch: () => void;
}

/* ─────────────────────────── formatting ─────────────────────────── */
const isNum = (v: any): v is number => typeof v === 'number' && isFinite(v);
const fmtPx = (v?: number | null) =>
  isNum(v) ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
const fmtLvl = (v?: number | null) =>
  isNum(v) ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—';
const fmtGex = (v?: number | null) => {
  if (!isNum(v)) return '—';
  const a = Math.abs(v);
  const sign = v >= 0 ? '+' : '−';
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  return `${sign}$${(a / 1e6).toFixed(1)}M`;
};
const fmtPct = (v?: number | null) => (isNum(v) ? `±${(v * 100).toFixed(2)}%` : '—');

/* ─────────────────────────── atoms ─────────────────────────── */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[10px] font-semibold uppercase"
      style={{ letterSpacing: '0.28em', color: faint }}
    >
      {children}
    </div>
  );
}

function SectionHead({ eyebrow, title, sub }: { eyebrow?: string; title: string; sub?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2
        className="mt-3 text-[26px] font-semibold leading-tight sm:text-[32px]"
        style={{ color: PALETTE.ghost, letterSpacing: '-0.01em' }}
      >
        {title}
      </h2>
      {sub ? (
        <p className="mx-auto mt-3 max-w-xl text-[13.5px] leading-relaxed" style={{ color: muted }}>
          {sub}
        </p>
      ) : null}
    </div>
  );
}

function Panel({ children, className = '', soft = false, style }: { children: React.ReactNode; className?: string; soft?: boolean; style?: React.CSSProperties }) {
  return (
    <div
      className={`rounded-[10px] ${className}`}
      style={{ background: soft ? PALETTE.panelSoft : PALETTE.panel, border: `1px solid ${line}`, ...style }}
    >
      {children}
    </div>
  );
}

function PrimaryButton({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex cursor-pointer items-center justify-center rounded-[7px] px-5 py-2.5 text-[12.5px] font-semibold uppercase tracking-[0.1em] transition-colors"
      style={{ background: PALETTE.ghost, color: '#0A0806' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = '#ffffff')}
      onMouseLeave={(e) => (e.currentTarget.style.background = PALETTE.ghost)}
    >
      {children}
    </button>
  );
}

function GhostButton({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex cursor-pointer items-center justify-center rounded-[7px] px-5 py-2.5 text-[12.5px] font-semibold uppercase tracking-[0.1em] transition-colors"
      style={{ background: 'transparent', color: PALETTE.text, border: `1px solid ${lineStrong}` }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(248,248,255,0.05)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {children}
    </button>
  );
}

/* KPI cell used across the mockups */
function Kpi({ label, value, tone = PALETTE.text, sub }: { label: string; value: React.ReactNode; tone?: string; sub?: string }) {
  return (
    <div className="min-w-0 px-3 py-2.5" style={{ borderLeft: `1px solid ${line}` }}>
      <div className="text-[8.5px] font-semibold uppercase" style={{ letterSpacing: '0.16em', color: faint }}>
        {label}
      </div>
      <div className="mt-1 text-[15px] font-semibold tabular-nums leading-none" style={{ color: tone }}>
        {value}
      </div>
      {sub ? <div className="mt-1 text-[9px] tabular-nums" style={{ color: muted }}>{sub}</div> : null}
    </div>
  );
}

/* Diverging dealer-pressure bars (real strikes; purple/teal positive, red negative) */
function PressureMap({ rows }: { rows: PressureRow[] }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.net)));
  return (
    <div className="space-y-[3px]">
      {rows.map((r) => {
        const w = (Math.abs(r.net) / max) * 100;
        const pos = r.net >= 0;
        const color = pos ? PALETTE.gex[1] : PALETTE.red;
        return (
          <div key={r.strike} className="flex items-center gap-2">
            <div className="w-12 shrink-0 text-right text-[9px] tabular-nums" style={{ color: r.kind === 'spot' ? PALETTE.ghost : muted }}>
              {fmtLvl(r.strike)}
            </div>
            <div className="relative h-[9px] flex-1 overflow-hidden rounded-[2px]" style={{ background: 'rgba(248,248,255,0.04)' }}>
              <div className="absolute inset-y-0" style={{ left: pos ? '50%' : `${50 - w / 2}%`, width: `${w / 2}%`, background: color, opacity: 0.85 }} />
              <div className="absolute inset-y-0 left-1/2 w-px" style={{ background: lineStrong }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* Minimal real-close sparkline (no glow, thin stroke) */
function Spark({ data, height = 96 }: { data: number[]; height?: number }) {
  const pts = useMemo(() => {
    if (!data || data.length < 2) return null;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const span = max - min || 1;
    const n = data.length;
    return data
      .map((v, i) => `${(i / (n - 1)) * 100},${height - ((v - min) / span) * height}`)
      .join(' ');
  }, [data, height]);
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="h-full w-full">
      {pts ? (
        <polyline points={pts} fill="none" stroke={PALETTE.gex[1]} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
      ) : (
        <line x1="0" y1={height / 2} x2="100" y2={height / 2} stroke={line} strokeWidth={0.6} strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  );
}

/* ─────────────────────────── the terminal mockup (real data) ─────────────────────────── */
function TerminalMock({ ticker, metrics, ranked, pressure, spark }: Required<Pick<SlayerLandingProps, 'metrics' | 'ranked' | 'pressure' | 'spark'>> & { ticker: string }) {
  const m = metrics;
  const emPts = isNum(m.expectedMovePct) && isNum(m.spot) ? m.expectedMovePct * m.spot : null;
  return (
    <Panel className="overflow-hidden" style={{ boxShadow: '0 30px 80px -40px rgba(0,0,0,0.9)' }}>
      {/* window bar */}
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: `1px solid ${line}` }}>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold tracking-[0.18em]" style={{ color: PALETTE.ghost }}>SLAYER_TERMINAL</span>
          <span className="text-[9px] tabular-nums" style={{ color: faint }}>· {ticker} · 0DTE</span>
        </div>
        <span className="rounded-[4px] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em]" style={{ color: PALETTE.gex[0], border: `1px solid ${line}` }}>
          Model preview
        </span>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 sm:grid-cols-6" style={{ borderBottom: `1px solid ${line}` }}>
        <Kpi label="Spot" value={fmtPx(m.spot)} tone={PALETTE.ghost} />
        <Kpi label="Net GEX" value={fmtGex(m.netGex)} tone={isNum(m.netGex) && m.netGex < 0 ? '#d9736f' : '#6fae7d'} />
        <Kpi label="Call Wall" value={fmtLvl(m.callWall)} tone={PALETTE.gex[1]} />
        <Kpi label="Put Wall" value={fmtLvl(m.putWall)} tone="#d9736f" />
        <Kpi label="Pin" value={fmtLvl(m.pin)} tone={PALETTE.gex[2]} />
        <Kpi label="Exp Move" value={fmtPct(m.expectedMovePct)} sub={isNum(emPts) ? `±${emPts.toFixed(1)} pts` : undefined} tone={PALETTE.text} />
      </div>

      {/* body: chart + pressure map + ranked */}
      <div className="grid grid-cols-1 gap-px lg:grid-cols-[1.5fr_1fr]" style={{ background: line }}>
        <div className="p-3" style={{ background: PALETTE.panel }}>
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-semibold uppercase tracking-[0.16em]" style={{ color: faint }}>Price · Key Levels</span>
            <span className="text-[9px] tabular-nums" style={{ color: muted }}>{fmtPx(m.spot)}</span>
          </div>
          <div className="mt-2 h-[96px] w-full">
            <Spark data={spark} />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[8.5px] uppercase tracking-[0.12em]" style={{ color: muted }}>
            <span style={{ color: PALETTE.gex[1] }}>▬ Call Wall {fmtLvl(m.callWall)}</span>
            <span style={{ color: PALETTE.gex[2] }}>▬ Pin {fmtLvl(m.pin)}</span>
            <span style={{ color: '#d9736f' }}>▬ Put Wall {fmtLvl(m.putWall)}</span>
          </div>
        </div>
        <div className="p-3" style={{ background: PALETTE.panel }}>
          <span className="text-[9px] font-semibold uppercase tracking-[0.16em]" style={{ color: faint }}>Dealer Positioning</span>
          <div className="mt-2">
            {pressure.length ? <PressureMap rows={pressure} /> : <div className="py-6 text-center text-[10px]" style={{ color: faint }}>awaiting chain</div>}
          </div>
        </div>
      </div>

      {/* ranked contracts */}
      <div className="p-3" style={{ borderTop: `1px solid ${line}` }}>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[9px] font-semibold uppercase tracking-[0.16em]" style={{ color: faint }}>Ranked Setups</span>
          <span className="text-[8.5px] uppercase tracking-[0.14em]" style={{ color: faint }}>strongest first</span>
        </div>
        <table className="w-full text-[10px]">
          <thead>
            <tr style={{ color: faint }}>
              <th className="pb-1 text-left font-medium uppercase tracking-[0.1em]">Symbol</th>
              <th className="pb-1 text-left font-medium uppercase tracking-[0.1em]">Setup</th>
              <th className="pb-1 text-left font-medium uppercase tracking-[0.1em]">Bias</th>
              <th className="pb-1 text-right font-medium uppercase tracking-[0.1em]">Conf</th>
              <th className="pb-1 text-right font-medium uppercase tracking-[0.1em]">Exp</th>
            </tr>
          </thead>
          <tbody>
            {ranked.length ? ranked.map((r, i) => (
              <tr key={i} style={{ borderTop: `1px solid ${line}` }}>
                <td className="py-1 tabular-nums" style={{ color: PALETTE.ghost }}>{r.symbol}</td>
                <td className="py-1" style={{ color: muted }}>{r.setup}</td>
                <td className="py-1 font-semibold" style={{ color: r.bias === 'BULL' ? '#6fae7d' : '#d9736f' }}>{r.bias}</td>
                <td className="py-1 text-right tabular-nums" style={{ color: PALETTE.text }}>{r.confidence}%</td>
                <td className="py-1 text-right tabular-nums" style={{ color: muted }}>{fmtPct(r.expMovePct)}</td>
              </tr>
            )) : (
              <tr><td colSpan={5} className="py-4 text-center text-[10px]" style={{ color: faint }}>awaiting ranked setups</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/* ─────────────────────────── sections ─────────────────────────── */
const NAV: { label: string; href?: string; tab?: string }[] = [
  { label: 'Product', href: '#product' },
  { label: 'Pinpoint', tab: 'pinpoint' },
  { label: 'SkyVision', tab: 'skyvision' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
];

function TopNav({ onLaunch, onEnter }: { onLaunch: () => void; onEnter: (t?: string) => void }) {
  const [open, setOpen] = useState(false);
  const navStyle = { color: muted } as const;
  return (
    <header className="sticky top-0 z-50 w-full backdrop-blur" style={{ background: 'rgba(0,0,0,0.72)', borderBottom: `1px solid ${line}` }}>
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-semibold tracking-[0.02em]" style={{ color: PALETTE.ghost }}>
            &gt;slayer<span style={{ color: muted }}>_terminal</span>
          </span>
        </div>
        <nav className="hidden items-center gap-7 md:flex">
          {NAV.map((n) => (
            n.tab ? (
              <button key={n.label} type="button" onClick={() => onEnter(n.tab)}
                className="cursor-pointer text-[12px] font-medium tracking-[0.02em] transition-colors" style={navStyle}
                onMouseEnter={(e) => (e.currentTarget.style.color = PALETTE.text)} onMouseLeave={(e) => (e.currentTarget.style.color = muted)}>
                {n.label}
              </button>
            ) : (
              <a key={n.label} href={n.href} className="text-[12px] font-medium tracking-[0.02em] transition-colors" style={navStyle}
                 onMouseEnter={(e) => (e.currentTarget.style.color = PALETTE.text)} onMouseLeave={(e) => (e.currentTarget.style.color = muted)}>
                {n.label}
              </a>
            )
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <div className="hidden sm:block"><PrimaryButton onClick={onLaunch}>Launch Terminal</PrimaryButton></div>
          <button type="button" aria-label="Menu" className="cursor-pointer p-2 md:hidden" style={{ color: PALETTE.text }} onClick={() => setOpen((o) => !o)}>
            <div className="space-y-[3px]"><span className="block h-px w-5" style={{ background: PALETTE.text }} /><span className="block h-px w-5" style={{ background: PALETTE.text }} /><span className="block h-px w-5" style={{ background: PALETTE.text }} /></div>
          </button>
        </div>
      </div>
      {open ? (
        <div className="md:hidden" style={{ borderTop: `1px solid ${line}` }}>
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-5 py-3">
            {NAV.map((n) => (
              n.tab ? (
                <button key={n.label} type="button" onClick={() => { setOpen(false); onEnter(n.tab); }} className="cursor-pointer py-2 text-left text-[13px]" style={navStyle}>{n.label}</button>
              ) : (
                <a key={n.label} href={n.href} onClick={() => setOpen(false)} className="py-2 text-[13px]" style={navStyle}>{n.label}</a>
              )
            ))}
            <div className="pt-2"><PrimaryButton onClick={onLaunch}>Launch Terminal</PrimaryButton></div>
          </div>
        </div>
      ) : null}
    </header>
  );
}

/* ── Living hero field ───────────────────────────────────────────────────────
   A dealer-pressure "spine": columns of mirrored bars driven by layered sine
   waves and rippling toward the pointer — the signature reactive hero visual.
   Colour is the GEX palette (data encoding, not decoration), motion is slow and
   editorial, and it degrades to a single static frame under reduced-motion. */
function HeroField() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const parent = canvas.parentElement as HTMLElement;
    const gexRgb = [
      [68, 49, 153],
      [121, 44, 162],
      [193, 51, 131],
      [224, 84, 84],
    ];
    let dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0, h = 0;
    // pointer in CSS px, seeded off-canvas so the field rests until hovered
    let px = -9999, py = -9999, tpx = -9999, tpy = -9999;
    const resize = () => {
      const r = parent.getBoundingClientRect();
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      tpx = e.clientX - r.left;
      tpy = e.clientY - r.top;
    };
    const onLeave = () => { tpx = -9999; tpy = -9999; };
    window.addEventListener('pointermove', onMove, { passive: true });
    parent.addEventListener('pointerleave', onLeave);

    const GAP = 20;
    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      // ease pointer toward target for a fluid ripple
      px += (tpx - px) * 0.08;
      py += (tpy - py) * 0.08;
      const cy = h * 0.52;
      const cols = Math.ceil(w / GAP) + 1;
      const sigma = Math.max(90, w * 0.11);
      for (let i = 0; i < cols; i++) {
        const x = i * GAP;
        const phase = t * 0.00042 + i * 0.26;
        const base = Math.sin(phase) * 0.5 + Math.sin(phase * 0.5 + 1.7) * 0.3 + Math.sin(phase * 0.23 + 4.1) * 0.2;
        // pointer lens: gaussian bump around the cursor column, with vertical falloff
        const dx = x - px;
        const dvy = Math.abs(cy - py) / (h * 0.5 + 1);
        const lens = Math.exp(-(dx * dx) / (2 * sigma * sigma)) * Math.max(0, 1 - dvy * 0.85);
        const amp = (0.16 + Math.abs(base) * 0.4 + lens * 0.9);
        const barH = amp * h * 0.34;
        const g = Math.min(3, (i / cols) * 3);
        const gi = Math.floor(g);
        const gf = g - gi;
        const c0 = gexRgb[gi];
        const c1 = gexRgb[Math.min(3, gi + 1)];
        const cr = Math.round(c0[0] + (c1[0] - c0[0]) * gf);
        const cg = Math.round(c0[1] + (c1[1] - c0[1]) * gf);
        const cb = Math.round(c0[2] + (c1[2] - c0[2]) * gf);
        const alpha = 0.10 + Math.abs(base) * 0.16 + lens * 0.5;
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${alpha})`;
        ctx.fillRect(x, cy - barH, 2, barH * 2);
        // bright cap dots near the pointer
        if (lens > 0.22) {
          ctx.fillStyle = `rgba(248,248,255,${(lens - 0.22) * 0.5})`;
          ctx.fillRect(x - 0.5, cy - barH - 1.5, 3, 3);
          ctx.fillRect(x - 0.5, cy + barH - 1.5, 3, 3);
        }
      }
      // centre zero-line (spot spine)
      ctx.fillStyle = 'rgba(248,248,255,0.06)';
      ctx.fillRect(0, cy, w, 1);
    };

    let raf = 0;
    if (reduce) {
      draw(6000);
    } else {
      const loop = (t: number) => { draw(t); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      parent.removeEventListener('pointerleave', onLeave);
    };
  }, [reduce]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {/* scanline veil + edge fades keep it a texture, not a chart */}
      <div className="absolute inset-0" style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.16) 0px, rgba(0,0,0,0.16) 1px, transparent 1px, transparent 3px)' }} />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 80% at 50% 40%, transparent 42%, rgba(0,0,0,0.55) 100%)' }} />
    </div>
  );
}

/* Reveal — slides + fades its children in the first time they scroll into view. */
function Reveal({ children, y = 26, delay = 0 }: { children: React.ReactNode; y?: number; delay?: number }) {
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-12% 0px -8% 0px' }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

function Hero({ ticker, metrics, ranked, pressure, spark, onEnter, onLaunch }: Required<Omit<SlayerLandingProps, 'onEnter' | 'onLaunch'>> & Pick<SlayerLandingProps, 'onEnter' | 'onLaunch'>) {
  return (
    <section className="relative overflow-hidden">
      {/* living dealer-pressure field — reacts to the pointer */}
      <HeroField />
      {/* restrained radial wash — structure, not glow */}
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(1100px 520px at 50% -10%, rgba(68,49,153,0.12), transparent 70%)' }} />
      <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-5 py-16 lg:grid-cols-[1.05fr_1.15fr] lg:py-24">
        <div>
          <Eyebrow>Institutional Options Intelligence</Eyebrow>
          <h1 className="mt-4 text-[36px] font-semibold leading-[1.05] sm:text-[46px]" style={{ color: PALETTE.ghost, letterSpacing: '-0.02em' }}>
            Read Dealer Pressure<br />Before Price Reacts
          </h1>
          <p className="mt-5 max-w-xl text-[15px] leading-relaxed" style={{ color: muted }}>
            Slayer Terminal combines GEX, DEX, VEX, dealer positioning, volatility structure, and
            contract ranking into one clean trading command center.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <PrimaryButton onClick={onLaunch}>Launch Terminal</PrimaryButton>
            <GhostButton onClick={() => onEnter('pinpoint')}>View Terminal Preview</GhostButton>
          </div>
          <p className="mt-5 text-[11.5px]" style={{ color: faint }}>
            Built for traders who need levels, context, and execution clarity.
          </p>
        </div>
        <TerminalMock ticker={ticker} metrics={metrics} ranked={ranked} pressure={pressure} spark={spark} />
      </div>
    </section>
  );
}

function ProblemSection() {
  const cards = [
    { t: 'Charts show price, not hidden positioning.', d: 'Candles tell you where price has been — not where dealers are forced to hedge next.' },
    { t: 'Options chains are too slow to read manually.', d: 'By the time you have scanned strikes by hand, the structure has already moved.' },
    { t: 'Flow without context leads to bad entries.', d: 'A print means nothing until you know the level, the regime, and the invalidation.' },
  ];
  return (
    <section className="mx-auto max-w-6xl px-5 py-16">
      <SectionHead eyebrow="The Problem" title="Most Traders Are Reacting Too Late" />
      <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
        {cards.map((c, i) => (
          <Panel key={i} className="p-5">
            <div className="text-[10px] font-semibold tabular-nums" style={{ color: PALETTE.gex[i] ?? PALETTE.gex[0] }}>0{i + 1}</div>
            <div className="mt-3 text-[14px] font-semibold leading-snug" style={{ color: PALETTE.ghost }}>{c.t}</div>
            <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: muted }}>{c.d}</p>
          </Panel>
        ))}
      </div>
    </section>
  );
}

function SolutionSection() {
  const bullets = [
    'See where dealers are trapped.',
    'Identify call walls, put walls, pin zones, and gamma flips.',
    'Rank contracts by structure, momentum, and risk.',
    'Track setups with clean invalidation levels.',
  ];
  return (
    <section className="mx-auto max-w-6xl px-5 py-16" style={{ borderTop: `1px solid ${line}` }}>
      <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
        <div>
          <Eyebrow>The Solution</Eyebrow>
          <h2 className="mt-3 text-[28px] font-semibold leading-tight sm:text-[32px]" style={{ color: PALETTE.ghost, letterSpacing: '-0.01em' }}>
            One Terminal.<br />The Levels That Matter.
          </h2>
          <p className="mt-4 max-w-md text-[13.5px] leading-relaxed" style={{ color: muted }}>
            Slayer Terminal turns dealer positioning and options structure into clear levels and
            contract ideas — the read, not the noise.
          </p>
        </div>
        <div className="space-y-2.5">
          {bullets.map((b, i) => (
            <div key={i} className="flex items-start gap-3 rounded-[8px] p-3" style={{ background: PALETTE.panel, border: `1px solid ${line}` }}>
              <span className="mt-[3px] h-3 w-3 shrink-0 rounded-[3px]" style={{ background: PALETTE.gex[i % 4] }} />
              <span className="text-[13.5px]" style={{ color: PALETTE.text }}>{b}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProductPreview({ ticker, metrics, ranked, pressure, spark, onEnter }: Required<Pick<SlayerLandingProps, 'metrics' | 'ranked' | 'pressure' | 'spark'>> & { ticker: string; onEnter: (t?: string) => void }) {
  const modules = ['Dealer Positioning Map', 'Exposure Matrix', 'SkyVision Ranked Setups', 'Contract Detail', 'Key Levels Rail', 'Market Read'];
  return (
    <section id="product" className="px-5 py-16" style={{ borderTop: `1px solid ${line}`, background: PALETTE.panelSoft }}>
      <div className="mx-auto max-w-6xl">
        <SectionHead eyebrow="Product Preview" title="Structure, Rendered" sub="A live look at the command center. Every panel below reads market structure, not decoration." />
        <div className="mt-10">
          <TerminalMock ticker={ticker} metrics={metrics} ranked={ranked} pressure={pressure} spark={spark} />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {modules.map((m) => (
            <span key={m} className="rounded-[6px] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.1em]" style={{ color: muted, border: `1px solid ${line}` }}>{m}</span>
          ))}
        </div>
        <div className="mt-8 text-center"><GhostButton onClick={() => onEnter('pinpoint')}>Open the Terminal</GhostButton></div>
      </div>
    </section>
  );
}

function FeatureSection({ metrics, onEnter }: { metrics: HeroMetrics; onEnter: (t?: string) => void }) {
  const feats: { t: string; d: string; tab?: string; visual: React.ReactNode }[] = [
    { t: 'Pinpoint GEX', tab: 'pinpoint', d: 'Dealer positioning, gamma walls, put walls, call walls, pin levels.',
      visual: <MiniKV rows={[['Call Wall', fmtLvl(metrics.callWall)], ['Put Wall', fmtLvl(metrics.putWall)], ['Pin', fmtLvl(metrics.pin)]]} /> },
    { t: 'SkyVision', tab: 'skyvision', d: 'Ranks trade setups and contracts by structure, momentum, and risk.',
      visual: <MiniBars values={[92, 84, 71, 58]} /> },
    { t: 'Dealer Flow', tab: 'dealerflow', d: 'Tracks pressure changes across strikes as the tape develops.',
      visual: <MiniKV rows={[['Net GEX', fmtGex(metrics.netGex)], ['Bias', 'Short γ'], ['Regime', 'Accel.']]} /> },
    { t: 'Quant Lab', tab: 'quant', d: 'Volatility surface, Greeks, regime, and expected move.',
      visual: <MiniKV rows={[['Exp Move', fmtPct(metrics.expectedMovePct)], ['ATM IV', '—'], ['Skew', '—']]} /> },
    { t: 'Trade History', tab: 'auditor', d: 'Tracks setups and outcomes with honest, realized results.',
      visual: <MiniBars values={[40, 62, 55, 78]} /> },
    { t: 'Live Terminal', tab: 'liveterminal', d: 'One clean workspace for market structure, start to execution.',
      visual: <MiniKV rows={[['Spot', fmtPx(metrics.spot)], ['Levels', '5'], ['Setups', 'live']]} /> },
  ];
  return (
    <section id="features" className="mx-auto max-w-6xl px-5 py-16">
      <SectionHead eyebrow="Capabilities" title="Six Modules. One Read." />
      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {feats.map((f) => (
          <button key={f.t} type="button" onClick={() => onEnter(f.tab)} className="cursor-pointer text-left transition-colors" >
            <Panel className="h-full p-5" style={{ transition: 'border-color .15s' }}>
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-semibold" style={{ color: PALETTE.ghost }}>{f.t}</span>
                <span className="text-[10px]" style={{ color: faint }}>→</span>
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: muted }}>{f.d}</p>
              <div className="mt-4">{f.visual}</div>
            </Panel>
          </button>
        ))}
      </div>
    </section>
  );
}

function MiniKV({ rows }: { rows: [string, string][] }) {
  return (
    <div className="rounded-[6px] p-2.5" style={{ background: PALETTE.panelSoft, border: `1px solid ${line}` }}>
      {rows.map(([k, v], i) => (
        <div key={i} className="flex items-center justify-between py-[3px] text-[10px]">
          <span className="uppercase tracking-[0.1em]" style={{ color: faint }}>{k}</span>
          <span className="tabular-nums" style={{ color: PALETTE.text }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

function MiniBars({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-1.5 rounded-[6px] p-2.5" style={{ background: PALETTE.panelSoft, border: `1px solid ${line}`, height: 62 }}>
      {values.map((v, i) => (
        <div key={i} className="flex-1 rounded-[2px]" style={{ height: `${(v / max) * 100}%`, background: PALETTE.gex[i % 4], opacity: 0.85 }} />
      ))}
    </div>
  );
}

function HowItWorks() {
  const steps = ['Select ticker', 'Read dealer positioning', 'Review ranked setups', 'Execute with levels and invalidation'];
  return (
    <section className="px-5 py-16" style={{ borderTop: `1px solid ${line}`, background: PALETTE.panelSoft }}>
      <div className="mx-auto max-w-6xl">
        <SectionHead eyebrow="Workflow" title="From Market Noise to Trade Structure" />
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <Panel key={i} className="p-5">
              <div className="text-[11px] font-semibold tabular-nums" style={{ color: PALETTE.gex[i] }}>STEP {i + 1}</div>
              <div className="mt-3 text-[14px] font-medium leading-snug" style={{ color: PALETTE.ghost }}>{s}</div>
            </Panel>
          ))}
        </div>
      </div>
    </section>
  );
}

function ComparisonSection() {
  const rows = [
    ['Dealer levels', false, false, true],
    ['Contract selection', false, 'signals', true],
    ['Risk context', false, false, true],
    ['Market structure', false, false, true],
    ['Live updates', false, true, true],
    ['Explanation quality', false, 'thin', true],
  ] as [string, any, any, any][];
  const cell = (v: any, strong = false) => {
    if (v === true) return <span style={{ color: strong ? '#6fae7d' : PALETTE.text }}>{strong ? '● Full' : '●'}</span>;
    if (v === false) return <span style={{ color: faint }}>—</span>;
    return <span style={{ color: muted }}>{v}</span>;
  };
  return (
    <section className="mx-auto max-w-6xl px-5 py-16">
      <SectionHead eyebrow="Comparison" title="Built for Structure, Not Signals" />
      <div className="mt-10 overflow-x-auto">
        <table className="w-full min-w-[560px] text-[12.5px]">
          <thead>
            <tr style={{ color: faint }}>
              <th className="py-2 text-left font-medium uppercase tracking-[0.1em]"> </th>
              <th className="py-2 text-center font-medium uppercase tracking-[0.1em]">Manual Trading</th>
              <th className="py-2 text-center font-medium uppercase tracking-[0.1em]">Signal Groups</th>
              <th className="py-2 text-center font-semibold uppercase tracking-[0.1em]" style={{ color: PALETTE.ghost }}>Slayer Terminal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderTop: `1px solid ${line}` }}>
                <td className="py-2.5 pr-4" style={{ color: PALETTE.text }}>{r[0]}</td>
                <td className="py-2.5 text-center tabular-nums">{cell(r[1])}</td>
                <td className="py-2.5 text-center tabular-nums">{cell(r[2])}</td>
                <td className="py-2.5 text-center tabular-nums" style={{ background: 'rgba(68,49,153,0.06)' }}>{cell(r[3], true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function GetStartedSection({ onLaunch, onEnter }: { onLaunch: () => void; onEnter: (t?: string) => void }) {
  return (
    <section id="pricing" className="px-5 py-20" style={{ borderTop: `1px solid ${line}` }}>
      <div className="mx-auto max-w-2xl text-center">
        <Eyebrow>Live Now</Eyebrow>
        <h2 className="mt-3 text-[28px] font-semibold leading-tight sm:text-[34px]" style={{ color: PALETTE.ghost, letterSpacing: '-0.01em' }}>
          Start Reading Market Structure Today
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-[14px] leading-relaxed" style={{ color: muted }}>
          Slayer Terminal is live. Create an account and open the full terminal — Pinpoint GEX,
          SkyVision ranking, Dealer Flow, and the live command center. No waitlist.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <PrimaryButton onClick={onLaunch}>Launch Terminal</PrimaryButton>
          <GhostButton onClick={() => onEnter('pinpoint')}>View Terminal Preview</GhostButton>
        </div>
        <p className="mt-4 text-[11px]" style={{ color: faint }}>Sign in to unlock full access. Pricing shown at checkout.</p>
      </div>
    </section>
  );
}

function FaqSection() {
  const faqs = [
    ['What is Slayer Terminal?', 'An options intelligence platform that reads dealer positioning, gamma exposure, flow, and volatility structure, then turns it into clear levels and ranked contract ideas.'],
    ['Is this a signal service?', 'No. It is an analytics terminal. It shows you the structure and the read — you make the trade.'],
    ['Does it choose contracts?', 'It ranks contracts by structure, momentum, and risk, and shows the reasoning. Selection stays with you.'],
    ['What data does it use?', 'Live options chains, dealer-exposure aggregates (GEX/DEX/VEX), candles, and volatility structure. When a live feed is not connected, panels are clearly labeled as model mode.'],
    ['Is it for beginners?', 'It is built for traders who already think in levels and risk. Beginners can use it, but it assumes you want structure, not tips.'],
    ['Is it available now?', 'Yes. Slayer Terminal is live — there is no waitlist. Create an account and open the full terminal immediately.'],
  ];
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="mx-auto max-w-3xl px-5 py-16" style={{ borderTop: `1px solid ${line}` }}>
      <SectionHead eyebrow="FAQ" title="Direct Answers" />
      <div className="mt-8 divide-y" style={{ borderColor: line }}>
        {faqs.map(([q, a], i) => {
          const isOpen = open === i;
          return (
            <div key={i} style={{ borderTop: i === 0 ? 'none' : `1px solid ${line}` }}>
              <button type="button" onClick={() => setOpen(isOpen ? null : i)} className="flex w-full cursor-pointer items-center justify-between gap-4 py-4 text-left">
                <span className="text-[14px] font-medium" style={{ color: PALETTE.ghost }}>{q}</span>
                <span className="text-[16px] leading-none" style={{ color: muted }}>{isOpen ? '−' : '+'}</span>
              </button>
              {isOpen ? <p className="pb-4 text-[13px] leading-relaxed" style={{ color: muted }}>{a}</p> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FinalCta({ onLaunch }: { onLaunch: () => void }) {
  return (
    <section className="relative overflow-hidden px-5 py-24" style={{ borderTop: `1px solid ${line}` }}>
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(800px 360px at 50% 120%, rgba(121,44,162,0.14), transparent 70%)' }} />
      <div className="relative mx-auto max-w-2xl text-center">
        <h2 className="text-[30px] font-semibold leading-tight sm:text-[38px]" style={{ color: PALETTE.ghost, letterSpacing: '-0.02em' }}>
          Trade With Structure, Not Noise
        </h2>
        <div className="mt-8 flex justify-center"><PrimaryButton onClick={onLaunch}>Launch Terminal</PrimaryButton></div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="px-5 py-10" style={{ borderTop: `1px solid ${line}` }}>
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 sm:flex-row">
        <span className="text-[12px] font-semibold tracking-[0.02em]" style={{ color: PALETTE.ghost }}>&gt;slayer<span style={{ color: muted }}>_terminal</span></span>
        <span className="text-[10px]" style={{ color: faint }}>For informational purposes only. Not investment advice. Analytics platform — not guaranteed profit.</span>
      </div>
    </footer>
  );
}

/* ─────────────────────────── page ─────────────────────────── */
export default function SlayerLanding({ ticker = 'SPX', metrics = {}, ranked = [], pressure = [], spark = [], onEnter, onLaunch }: SlayerLandingProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({ container: rootRef });
  // hero drifts up + dims as the page scrolls (parallax hand-off to the sections)
  const heroY = useTransform(scrollYProgress, [0, 0.16], [0, -70]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.13], [1, 0.35]);
  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[40] overflow-y-auto overflow-x-hidden font-mono antialiased slayer-scrollbar"
      style={{ background: PALETTE.bg, color: PALETTE.text }}
    >
      {/* scroll-progress rail — GEX gradient, fixed to the top of the canvas */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none fixed left-0 right-0 top-0 z-[60] h-[2px] origin-left"
        style={{ scaleX: scrollYProgress, background: `linear-gradient(90deg, ${PALETTE.gex[0]}, ${PALETTE.gex[1]}, ${PALETTE.gex[2]}, ${PALETTE.gex[3]})` }}
      />
      <TopNav onLaunch={onLaunch} onEnter={onEnter} />
      <motion.div style={{ y: heroY, opacity: heroOpacity }}>
        <Hero ticker={ticker} metrics={metrics} ranked={ranked} pressure={pressure} spark={spark} onEnter={onEnter} onLaunch={onLaunch} />
      </motion.div>
      <Reveal><ProblemSection /></Reveal>
      <Reveal><SolutionSection /></Reveal>
      <Reveal><ProductPreview ticker={ticker} metrics={metrics} ranked={ranked} pressure={pressure} spark={spark} onEnter={onEnter} /></Reveal>
      <Reveal><FeatureSection metrics={metrics} onEnter={onEnter} /></Reveal>
      <Reveal><HowItWorks /></Reveal>
      <Reveal><ComparisonSection /></Reveal>
      <Reveal><GetStartedSection onLaunch={onLaunch} onEnter={onEnter} /></Reveal>
      <Reveal><FaqSection /></Reveal>
      <Reveal><FinalCta onLaunch={onLaunch} /></Reveal>
      <Footer />
    </div>
  );
}
