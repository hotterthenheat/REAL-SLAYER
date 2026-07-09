import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useScroll, useTransform, useReducedMotion, useInView } from 'motion/react';
import type { MotionValue } from 'motion/react';
import Lenis from 'lenis';
import { LogIn, Menu, X, Check, ArrowUpRight } from 'lucide-react';
// The hero backdrop is the real slayerterminal.com motif: a live code/finance
// "rain" (neutral steel/amber tints), NOT a coloured 3D field. Light, no WebGL.
import SlayerCodeRain from './SlayerCodeRain';
// The landing sidebar IS the app shell sidebar: it renders AppShell's own
// NavItem rows (same classes, flyouts, chevrons), FeedPill and brand header,
// fed by the ONE shared nav definition in src/lib/navItems.ts. Zero drift —
// clicking "Launch Terminal" produces no visual jump in either direction.
import { NavCtx, FeedPill, renderNavItem } from './AppShell';
import type { NavCtxValue } from './AppShell';
import { BrandHeader, TerminalLogo } from './BrandLogo';
import { NAV_MAIN_VIEWS, NAV_TOOLS, NAV_SETTINGS, SIDEBAR_COLLAPSED_KEY } from '../lib/navItems';

/**
 * SlayerLanding — the full-screen marketing landing page for Slayer Terminal.
 *
 * Institutional / data-first, not a SaaS template: tokenised surfaces
 * (var(--surface)) on the app canvas, thin hairline borders, tabular numerics,
 * restrained colour (colour encodes data, never decorates), fully theme-aware.
 * The hero + preview mockups read
 * REAL fields off the live store when present and fall back to an honest "—"
 * — nothing here is fabricated.
 *
 * Rendered full-bleed (its own top nav replaces the app shell); product nav
 * links call `onEnter(tab)` to cross into the terminal, and every launch CTA
 * calls `onLaunch()` (which signs the visitor in or opens the terminal). The
 * product is live — there is no waitlist.
 */

// Landing palette = the SAME neutral brand language as the terminal. Surfaces,
// text and borders now resolve to the app's design tokens (var(--surface)/-2,
// var(--text-*), var(--border)/-strong, var(--accent-color)) so the landing is
// ONE system with the terminal and follows the active user theme (dark / light /
// the 73 presets). Only the code-rain hero stays intrinsically dark (see below).
// The data accents stay literal: steel = call-side / SkyVision, amber = dealer
// flow / walls, green = bullish, red = put-side / bearish.
const PALETTE = {
  bg: 'var(--background)',      // page + footer canvas (theme-aware)
  panel: 'var(--surface)',     // primary panel surface
  panelSoft: 'var(--surface-2)', // nested / softer surface
  text: 'var(--text-primary)', // strong body text
  ghost: 'var(--text-primary)', // brightest heading text
  steel: '#6A93B5', // calls / SkyVision (matches the Dealer Positioning Map)
  amber: '#C79350', // dealer flow / GEX / walls / pins (Pinpoint)
  red: '#B23B3B',   // puts / bearish
  green: '#3F9C79', // calls / bullish
  // ordinal accent quartet for numbered/step decoration — neutral, no purple.
  accent: ['#6A93B5', '#C79350', '#3F9C79', '#B23B3B'] as const,
};

// Accent fill (buttons) + its readable text — themeable, mirrors the terminal.
const accentFill = 'var(--accent-color)';
const accentText = 'var(--primary-contrast)';
// Subtle hover wash / brighten built from the accent so it works in every theme.
const hoverWash = 'color-mix(in srgb, var(--accent-color) 8%, transparent)';
const accentBright = 'color-mix(in srgb, var(--accent-color), #ffffff 15%)';

const line = 'var(--border)';
const lineStrong = 'var(--border-strong)';
const muted = 'var(--text-secondary)';
const faint = 'var(--text-tertiary)';

// The hero renders over the code-rain, whose scrims are intrinsically dark in
// EVERY theme, so hero copy/controls stay fixed light-on-dark (they must not
// flip to the dark token values under .light-theme). Everything below the hero
// uses the theme tokens above.
const HERO_GHOST = '#F8F8FF';
const HERO_TEXT = '#F5F5F5';
const HERO_MUTED = 'rgba(245,245,245,0.62)';
const HERO_FAINT = 'rgba(245,245,245,0.42)';

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
function Eyebrow({ children, onDark = false }: { children: React.ReactNode; onDark?: boolean }) {
  return (
    <div
      className="text-[10px] font-semibold uppercase"
      style={{ letterSpacing: '0.28em', color: onDark ? HERO_FAINT : faint }}
    >
      {children}
    </div>
  );
}

// Signature ease — the landonorris.com "expo out" curve, used by every reveal.
const EASE_EXPO = [0.16, 1, 0.3, 1] as const;

/* Line-mask heading reveal — the text slides up out of an overflow-hidden clip
   the first time it scrolls into view (editorial split-line intro). Static
   under reduced motion. */
function MaskedHeading({
  as: Tag = 'h2',
  children,
  className = '',
  style,
  delay = 0,
}: {
  as?: 'h1' | 'h2' | 'h3' | 'div';
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <Tag className={className} style={style}>{children}</Tag>;
  const MotionTag = motion[Tag];
  return (
    <span className="block overflow-hidden">
      <MotionTag
        className={`${className} will-change-transform`}
        style={style}
        initial={{ y: '110%' }}
        whileInView={{ y: '0%' }}
        viewport={{ once: true, margin: '-10% 0px -6% 0px' }}
        transition={{ duration: 0.9, delay, ease: EASE_EXPO }}
      >
        {children}
      </MotionTag>
    </span>
  );
}

/* MaskedLine — span-flavoured line-mask reveal for multi-line headings (valid
   inside <h2>): each line clips in its own overflow-hidden span and slides up
   on first view. Static under reduced motion. */
function MaskedLine({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const reduce = useReducedMotion();
  if (reduce) return <span className="block">{children}</span>;
  return (
    <span className="block overflow-hidden">
      <motion.span
        className="block will-change-transform"
        initial={{ y: '110%' }}
        whileInView={{ y: '0%' }}
        viewport={{ once: true, margin: '-10% 0px -6% 0px' }}
        transition={{ duration: 0.9, delay, ease: EASE_EXPO }}
      >
        {children}
      </motion.span>
    </span>
  );
}

/* Oversized editorial index numeral (the "giant number" motif) — huge,
   low-contrast, tabular, revealing with a soft rise on first view. */
function GiantIndex({ n, color }: { n: string; color?: string }) {
  const reduce = useReducedMotion();
  const numeral = (
    <span
      aria-hidden="true"
      className="block text-[64px] font-semibold leading-[0.85] tabular-nums select-none"
      style={{
        letterSpacing: '-0.05em',
        color: color
          ? `color-mix(in srgb, ${color} 26%, transparent)`
          : 'color-mix(in srgb, var(--text-primary) 10%, transparent)',
      }}
    >
      {n}
    </span>
  );
  if (reduce) return numeral;
  return (
    <span className="block overflow-hidden">
      <motion.span
        className="block will-change-transform"
        initial={{ y: '55%', opacity: 0 }}
        whileInView={{ y: '0%', opacity: 1 }}
        viewport={{ once: true, margin: '-12% 0px -8% 0px' }}
        transition={{ duration: 0.9, ease: EASE_EXPO }}
      >
        {numeral}
      </motion.span>
    </span>
  );
}

/* Count-up — a "$39"-style price counts 0→value once, on first reveal.
   Non-numeric prices ("Custom") render untouched; reduced motion = static. */
function CountUpPrice({ price }: { price: string }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px' });
  const match = /^\$(\d+)$/.exec(price);
  const target = match ? parseInt(match[1], 10) : null;
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (target == null || reduce || !inView) return;
    let raf = 0;
    let start = 0;
    const dur = 900;
    const tick = (t: number) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / dur);
      setVal(Math.round((1 - Math.pow(1 - p, 3)) * target)); // easeOutCubic
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, reduce, inView]);
  if (target == null) return <>{price}</>;
  return <span ref={ref}>${reduce ? target : val}</span>;
}

function SectionHead({ eyebrow, title, sub }: { eyebrow?: string; title: string; sub?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <MaskedHeading
        className="mt-3 text-[26px] font-semibold leading-tight sm:text-[32px]"
        style={{ color: PALETTE.ghost, letterSpacing: '-0.01em' }}
      >
        {title}
      </MaskedHeading>
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

function PrimaryButton({ children, onClick, onDark = false }: { children: React.ReactNode; onClick?: () => void; onDark?: boolean }) {
  // Below the hero: themeable accent fill. On the (always-dark) hero: fixed
  // light-on-dark so the CTA reads on the code-rain in every theme.
  const bg = onDark ? '#F8F8FF' : accentFill;
  const fg = onDark ? '#0A0806' : accentText;
  const bgHover = onDark ? '#ffffff' : accentBright;
  const glow = onDark ? '0 6px 20px rgba(248,248,255,0.14)' : '0 6px 20px color-mix(in srgb, var(--accent-color) 22%, transparent)';
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex cursor-pointer items-center justify-center rounded-[7px] px-5 py-2.5 text-[12.5px] font-semibold uppercase tracking-[0.1em] transition-[background,transform,box-shadow] duration-200 will-change-transform"
      style={{ background: bg, color: fg }}
      onMouseEnter={(e) => { e.currentTarget.style.background = bgHover; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = glow; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = bg; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
    >
      {children}
    </button>
  );
}

function GhostButton({ children, onClick, onDark = false }: { children: React.ReactNode; onClick?: () => void; onDark?: boolean }) {
  const fg = onDark ? HERO_TEXT : PALETTE.text;
  const bd = onDark ? 'rgba(248,248,255,0.18)' : lineStrong;
  const bdHover = onDark ? 'rgba(248,248,255,0.4)' : 'var(--border-strong)';
  const bgHover = onDark ? 'rgba(248,248,255,0.05)' : hoverWash;
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex cursor-pointer items-center justify-center rounded-[7px] px-5 py-2.5 text-[12.5px] font-semibold uppercase tracking-[0.1em] transition-[background,transform,border-color] duration-200 will-change-transform"
      style={{ background: 'transparent', color: fg, border: `1px solid ${bd}` }}
      onMouseEnter={(e) => { e.currentTarget.style.background = bgHover; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = bdHover; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = bd; }}
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

/* MiniPositioningMap — a faithful miniature of the REAL Dealer Positioning Map
   (src/components/pinpoint/DealerPositioningMap.tsx): strikes descending, a
   centre zero axis, steel CALL pressure extending right / red PUT pressure
   extending left, faint dashed rules for pin & walls, a solid SPOT rule with
   its tabular price, right-edge CALL WALL / PUT WALL zone annotations, and a
   "FRICTION ZONE lo–hi" footer. Real rows only — nothing fabricated. */
function MiniPositioningMap({ rows, metrics }: { rows: PressureRow[]; metrics: HeroMetrics }) {
  const sorted = useMemo(() => [...rows].sort((a, b) => b.strike - a.strike), [rows]);
  const W = 250;
  const labelW = 40;   // strike labels
  const zoneW = 56;    // right-edge annotation rail
  const plotL = labelW + 4;
  const plotR = W - zoneW - 4;
  const centerX = (plotL + plotR) / 2;
  const barMax = (plotR - plotL) / 2;
  const rowH = 14;
  const top = 4;
  const H = top + sorted.length * rowH + 4;
  const maxAbs = Math.max(1e-9, ...sorted.map((r) => Math.abs(r.net)));
  const yOf = (i: number) => top + i * rowH + rowH / 2;

  // Rule / annotation rows: prefer the explicit row kind tags, fall back to the
  // row nearest the real metric level.
  const idxOf = (kind: PressureRow['kind'], level?: number | null): number | null => {
    const tagged = sorted.findIndex((r) => r.kind === kind);
    if (tagged >= 0) return tagged;
    if (!isNum(level) || sorted.length === 0) return null;
    let best = 0;
    for (let i = 1; i < sorted.length; i++) {
      if (Math.abs(sorted[i].strike - level) < Math.abs(sorted[best].strike - level)) best = i;
    }
    return best;
  };
  const spotIdx = idxOf('spot', metrics.spot);
  const pinIdx = idxOf('pin', metrics.pin);
  const cwIdx = idxOf('callWall', metrics.callWall);
  const pwIdx = idxOf('putWall', metrics.putWall);

  const frictionLo = isNum(metrics.spot) && isNum(metrics.pin) ? Math.min(metrics.spot, metrics.pin) : null;
  const frictionHi = isNum(metrics.spot) && isNum(metrics.pin) ? Math.max(metrics.spot, metrics.pin) : null;
  const hasFriction = frictionLo != null && frictionHi != null && Math.round(frictionLo) !== Math.round(frictionHi);

  const zone = (idx: number | null, label: string, color: string) =>
    idx == null ? null : (
      <g>
        <path
          d={`M ${plotR + 4} ${yOf(idx) - 5} L ${plotR + 8} ${yOf(idx) - 5} L ${plotR + 8} ${yOf(idx) + 5} L ${plotR + 4} ${yOf(idx) + 5}`}
          fill="none" stroke={color} strokeOpacity="0.55" strokeWidth="0.8"
        />
        <text x={plotR + 11} y={yOf(idx) + 2.5} fontSize="6.5" fontWeight={600} fill={color} style={{ letterSpacing: '0.06em' }}>
          {label}
        </text>
      </g>
    );

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ fontVariantNumeric: 'tabular-nums' }} role="img" aria-label="Dealer positioning by strike">
        {/* centre zero axis */}
        <line x1={centerX} x2={centerX} y1={top} y2={H - 4} stroke={lineStrong} strokeWidth="1" />
        {/* dashed level rules — pin (amber), call wall (steel), put wall (red) */}
        {pinIdx != null && <line x1={plotL} x2={plotR} y1={yOf(pinIdx)} y2={yOf(pinIdx)} stroke={PALETTE.amber} strokeOpacity="0.45" strokeWidth="0.8" strokeDasharray="3 3" />}
        {cwIdx != null && <line x1={plotL} x2={plotR} y1={yOf(cwIdx)} y2={yOf(cwIdx)} stroke={PALETTE.steel} strokeOpacity="0.35" strokeWidth="0.8" strokeDasharray="3 3" />}
        {pwIdx != null && <line x1={plotL} x2={plotR} y1={yOf(pwIdx)} y2={yOf(pwIdx)} stroke={PALETTE.red} strokeOpacity="0.35" strokeWidth="0.8" strokeDasharray="3 3" />}
        {/* strike labels + diverging bars (steel calls right / red puts left) */}
        {sorted.map((r, i) => {
          const pos = r.net >= 0;
          const mag = (Math.abs(r.net) / maxAbs) * barMax;
          const isSpotRow = i === spotIdx;
          return (
            <g key={`${r.strike}-${i}`}>
              <text
                x={labelW} y={yOf(i) + 2.5} textAnchor="end"
                fontSize={isSpotRow ? 8 : 7.5} fontWeight={isSpotRow ? 700 : 400}
                fill={isSpotRow ? PALETTE.ghost : muted}
              >
                {isSpotRow && isNum(metrics.spot) ? fmtPx(metrics.spot) : fmtLvl(r.strike)}
              </text>
              <rect
                x={pos ? centerX : centerX - mag}
                y={yOf(i) - 3}
                width={Math.max(0.6, mag)}
                height={6}
                rx={1}
                fill={pos ? PALETTE.steel : PALETTE.red}
                fillOpacity={0.9}
              />
            </g>
          );
        })}
        {/* spot — solid rule + centre marker (matches the real map) */}
        {spotIdx != null && (
          <g>
            <line x1={plotL} x2={plotR} y1={yOf(spotIdx)} y2={yOf(spotIdx)} stroke={PALETTE.ghost} strokeOpacity="0.55" strokeWidth="0.8" />
            <rect x={centerX - 1} y={yOf(spotIdx) - 5} width={2} height={10} fill={PALETTE.ghost} />
          </g>
        )}
        {/* right-edge pressure-zone annotations */}
        {zone(cwIdx, 'CALL WALL', PALETTE.steel)}
        {zone(pwIdx, 'PUT WALL', PALETTE.red)}
      </svg>
      {hasFriction ? (
        <div className="mt-1.5 text-[8.5px] font-semibold uppercase tracking-[0.14em] tabular-nums" style={{ color: faint }}>
          Friction zone {fmtLvl(frictionLo)}–{fmtLvl(frictionHi)}
        </div>
      ) : null}
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
        <polyline points={pts} fill="none" stroke={PALETTE.steel} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
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
        <span className="rounded-[4px] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em]" style={{ color: PALETTE.steel, border: `1px solid ${line}` }}>
          Model preview
        </span>
      </div>

      {/* KPI strip — same labels/order as the real Pinpoint page's top strip */}
      <div className="grid grid-cols-3 sm:grid-cols-6" style={{ borderBottom: `1px solid ${line}` }}>
        <Kpi label="Net GEX" value={fmtGex(m.netGex)} tone={isNum(m.netGex) && m.netGex < 0 ? '#d9736f' : '#6fae7d'} />
        <Kpi label="Spot" value={fmtPx(m.spot)} tone={PALETTE.ghost} />
        <Kpi label="Call Wall" value={fmtLvl(m.callWall)} tone={PALETTE.steel} />
        <Kpi label="Put Wall" value={fmtLvl(m.putWall)} tone={PALETTE.red} />
        <Kpi label="Pin Level" value={fmtLvl(m.pin)} tone={PALETTE.amber} />
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
            <span style={{ color: PALETTE.steel }}>▬ Call Wall {fmtLvl(m.callWall)}</span>
            <span style={{ color: PALETTE.amber }}>▬ Pin {fmtLvl(m.pin)}</span>
            <span style={{ color: PALETTE.red }}>▬ Put Wall {fmtLvl(m.putWall)}</span>
          </div>
        </div>
        <div className="p-3" style={{ background: PALETTE.panel }}>
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-semibold uppercase tracking-[0.16em]" style={{ color: faint }}>Dealer Positioning Map</span>
            <span className="text-[8px] uppercase tracking-[0.12em]" style={{ color: faint }}>
              <span style={{ color: PALETTE.red }}>▪ put</span> <span style={{ color: PALETTE.steel }}>▪ call</span>
            </span>
          </div>
          <div className="mt-2">
            {pressure.length ? <MiniPositioningMap rows={pressure} metrics={metrics} /> : <div className="py-6 text-center text-[10px]" style={{ color: faint }}>awaiting chain</div>}
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

/* ─────────────── sidebar — the SAME sidebar as the app shell ─────────────── */
/* Renders AppShell's own NavItem rows (identical classes, flyouts, chevrons,
   collapse behavior, widths w-64 ⇄ w-16) via NavCtx, fed by the shared
   src/lib/navItems.ts definitions. The landing IS the "home" tab, so Home shows
   active and scrolls to top; every other row crosses into the terminal. */

/** Footer for visitors — same container styling as AppShell's footer
 *  (p-4, border-t var(--border), var(--surface) bg), with the logged-out
 *  affordances: FeedPill LIVE, the primary Launch CTA, and log in / sign up. */
function LandingSidebarFooter({ onLaunch, expanded }: { onLaunch: () => void; expanded: boolean }) {
  return (
    <div className={`p-4 border-t border-[var(--border)] bg-[var(--surface)] overflow-hidden whitespace-nowrap transition-[padding] duration-300 ${expanded ? 'px-4' : 'px-2'}`}>
      <div className={`flex mb-3 ${expanded ? 'justify-start px-1' : 'justify-center'}`}>
        <FeedPill status="live" compact={!expanded} />
      </div>
      <button
        type="button"
        onClick={onLaunch}
        className={`w-full px-3 py-2 font-semibold transition-all flex items-center justify-center gap-1.5 text-[13px] rounded-lg cursor-pointer active:scale-95 focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none ${expanded ? '' : 'px-0'}`}
        style={{ background: accentFill, color: accentText }}
        onMouseEnter={(e) => (e.currentTarget.style.background = accentBright)}
        onMouseLeave={(e) => (e.currentTarget.style.background = accentFill)}
        title="Launch Terminal"
      >
        {expanded ? <><LogIn className="w-4 h-4 shrink-0" /> Launch Terminal</> : <LogIn className="w-4 h-4" />}
      </button>
      {expanded && (
        <button
          type="button"
          onClick={onLaunch}
          className="w-full mt-2 cursor-pointer rounded text-center text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
        >
          Log in / Create account
        </button>
      )}
    </div>
  );
}

/** Desktop left sidebar — structurally 1:1 with AppShell's <aside> (same brand
 *  header + hamburger, same collapse widths/transitions, same group labels and
 *  NavItem rows, same bottom Settings section — no Admin for visitors). The
 *  collapse state persists under AppShell's OWN localStorage key, so crossing
 *  landing ⇄ terminal keeps the sidebar at the same width: no jump. */
function LandingSidebar({ onLaunch, onEnter, scrollTop }: { onLaunch: () => void; onEnter: (t?: string) => void; scrollTop: () => void }) {
  const [expanded, setExpanded] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) !== 'true';
  });
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(!expanded));
  }, [expanded]);

  // Home is this page: it re-scrolls to top. Everything else (incl. flyout
  // sub-tab picks, which call setActiveTab with the parent id) enters the app.
  const ctx = useMemo<NavCtxValue>(() => ({
    activeTab: 'home',
    setActiveTab: (id: any) => { if (id === 'home') scrollTop(); else onEnter(id); },
    isSidebarExpanded: expanded,
    closeMobile: () => {},
    session: null, // visitors never see the admin-gated rows
  }), [expanded, onEnter, scrollTop]);

  return (
    <NavCtx.Provider value={ctx}>
      <aside className={`bg-[var(--surface)] border-r border-[var(--border)] flex-col hidden md:flex shrink-0 z-[100] h-full relative transition-[width] duration-200 ease-out ${expanded ? 'w-64' : 'w-16'}`}>
        <div className="p-3 border-b border-[var(--border)] h-[73px] flex items-center gap-2 overflow-hidden">
          <button
            type="button"
            className="origin-left cursor-pointer rounded-md focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
            style={{ transform: expanded ? 'scale(0.9)' : 'scale(0.9) translateX(-4px)' }}
            onClick={scrollTop}
            aria-label="Go to home"
          >
            <BrandHeader expanded={expanded} />
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="ml-auto p-2 rounded-md border border-[var(--border)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
            aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
            aria-expanded={expanded}
            title={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>

        <div
          className="flex-1 overflow-y-auto px-2 py-4 flex flex-col gap-1.5 scrollbar-none scroll-smooth touch-pan-y overflow-x-hidden"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className={`text-[12px] text-[var(--text-tertiary)] font-semibold tracking-wide px-2 py-1 mb-1 whitespace-nowrap overflow-hidden transition-all duration-300 ${expanded ? 'opacity-100' : 'opacity-0 h-0 py-0 mb-0 pointer-events-none'}`}>
            Main Views
          </div>
          {NAV_MAIN_VIEWS.map((it) => renderNavItem(it))}

          <div className={`text-[12px] text-[var(--text-tertiary)] font-semibold tracking-wide px-2 py-1 mt-4 mb-1 whitespace-nowrap overflow-hidden transition-all duration-300 ${expanded ? 'opacity-100' : 'opacity-0 h-0 py-0 mb-0 mt-0 pointer-events-none'}`}>
            Tools
          </div>
          {NAV_TOOLS.map((it) => renderNavItem(it))}

          <div className="mt-auto pt-4 flex flex-col gap-1.5 border-t border-[var(--border)]">
            {renderNavItem(NAV_SETTINGS)}
          </div>
        </div>

        <LandingSidebarFooter onLaunch={onLaunch} expanded={expanded} />
      </aside>
    </NavCtx.Provider>
  );
}

/** Mobile top bar + dropdown — mirrors AppShell's mobile nav (same bar classes,
 *  same dropdown panel, same NavItem rows with descriptions) plus the visitor
 *  footer CTAs. */
function LandingMobileNav({ onLaunch, onEnter, scrollTop }: { onLaunch: () => void; onEnter: (t?: string) => void; scrollTop: () => void }) {
  const [open, setOpen] = useState(false);
  const ctx = useMemo<NavCtxValue>(() => ({
    activeTab: 'home',
    setActiveTab: (id: any) => { if (id === 'home') scrollTop(); else onEnter(id); },
    isSidebarExpanded: true,
    closeMobile: () => setOpen(false),
    session: null,
  }), [onEnter, scrollTop]);

  return (
    <NavCtx.Provider value={ctx}>
      <div className="md:hidden">
        <div className="sticky top-0 z-50 bg-[var(--surface)] border-b border-[var(--border)] px-4 py-3 flex items-center justify-between">
          <div className="cursor-pointer scale-[0.85] origin-left" onClick={() => { setOpen(false); scrollTop(); }}>
            <BrandHeader />
          </div>
          <div className="flex items-center gap-3">
            <FeedPill status="live" />
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="text-[var(--text-tertiary)] p-2 rounded focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
              aria-label={open ? 'Close menu' : 'Open menu'}
            >
              {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
        {open && (
          <div
            className="fixed inset-0 top-[57px] z-[90] bg-[var(--surface)]/95 border-t border-[var(--border)] overflow-y-auto pb-20 touch-pan-y scroll-smooth"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <div className="p-4 flex flex-col gap-2">
              <div className="text-[12px] text-[var(--text-tertiary)] font-semibold tracking-wide px-2 py-1 mb-2">
                Main Views
              </div>
              {NAV_MAIN_VIEWS.map((it) => renderNavItem(it, true))}

              <div className="text-[12px] text-[var(--text-tertiary)] font-semibold tracking-wide px-2 py-1 mt-6 mb-2">
                Tools
              </div>
              {NAV_TOOLS.map((it) => renderNavItem(it, true))}
              {renderNavItem(NAV_SETTINGS, true)}

              <button
                type="button"
                onClick={() => { setOpen(false); onLaunch(); }}
                className="w-full px-3 py-3 mt-6 font-semibold transition-all flex items-center justify-center gap-1.5 text-[13px] rounded-lg tracking-wide cursor-pointer focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
                style={{ background: accentFill, color: accentText }}
              >
                <LogIn className="w-4 h-4" /> Launch Terminal
              </button>
              <button
                type="button"
                onClick={() => { setOpen(false); onLaunch(); }}
                className="w-full px-3 py-3 border border-[var(--border)] bg-[var(--surface-2)] text-[var(--success)] font-semibold transition-all flex items-center justify-center gap-1.5 text-[13px] rounded-lg tracking-wide focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
              >
                Log in / create account
              </button>
            </div>
          </div>
        )}
      </div>
    </NavCtx.Provider>
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

const HERO_RISE = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const } },
};

// The two headline lines — each gets its own overflow-hidden mask and slides
// up 110%→0 on the expo ease with a stagger (the split-line intro).
const HERO_LINES = ['Read the flow.', 'Rank the contract.'];

function Hero({ ticker, metrics, ranked, pressure, spark, onEnter, onLaunch, mockY }: Required<Omit<SlayerLandingProps, 'onEnter' | 'onLaunch'>> & Pick<SlayerLandingProps, 'onEnter' | 'onLaunch'> & { mockY: MotionValue<number> | number }) {
  const reduce = useReducedMotion();
  return (
    <section className="relative overflow-hidden" style={{ minHeight: '92vh', background: '#08090A' }}>
      {/* the real slayerterminal.com hero backdrop — a live code/finance rain
          (steel = SkyVision scanning, amber = Pinpoint dealer flow) under a
          scrim + vignette, confined to the hero and faded to solid #08090A at
          its lower edge so every section below sits on clean, legible black. */}
      <SlayerCodeRain />
      <div className="relative z-10 mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-5 py-16 lg:grid-cols-[1.05fr_1.15fr] lg:py-24">
        <motion.div
          initial={reduce ? false : 'hidden'}
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.09, delayChildren: 0.04 } } }}
        >
          <motion.div variants={HERO_RISE}><Eyebrow onDark>From Traders. For Traders.</Eyebrow></motion.div>
          {/* Line-mask headline — each line clipped by its own overflow-hidden
              wrapper, translating up from below the clip. Static when reduced. */}
          <h1 className="mt-4 text-[36px] font-semibold leading-[1.05] sm:text-[46px]" style={{ color: HERO_GHOST, letterSpacing: '-0.02em' }}>
            {HERO_LINES.map((ln, i) => (
              <span key={ln} className="block overflow-hidden pb-[0.08em] -mb-[0.08em]">
                <motion.span
                  className="block will-change-transform"
                  initial={reduce ? false : { y: '110%' }}
                  animate={{ y: '0%' }}
                  transition={{ duration: 0.95, delay: 0.12 + i * 0.13, ease: EASE_EXPO }}
                >
                  {ln}
                </motion.span>
              </span>
            ))}
          </h1>
          <motion.p variants={HERO_RISE} className="mt-5 max-w-xl text-[15px] leading-relaxed" style={{ color: HERO_MUTED }}>
            SkyVision finds the setup, Pinpoint AI reads the flow. GEX, DEX, VEX, dealer positioning,
            and volatility structure — one clean trading command center.
          </motion.p>
          <motion.div variants={HERO_RISE} className="mt-7 flex flex-wrap items-center gap-3">
            <PrimaryButton onClick={onLaunch} onDark>Launch Terminal</PrimaryButton>
            <GhostButton onClick={() => onEnter('pinpoint')} onDark>View Terminal Preview</GhostButton>
          </motion.div>
          <motion.p variants={HERO_RISE} className="mt-5 text-[11.5px]" style={{ color: HERO_FAINT }}>
            Built for traders who need levels, context, and execution clarity.
          </motion.p>
        </motion.div>
        {/* the mock drifts slightly SLOWER than the copy on scroll (parallax on
            the outer layer), and settles in with its own soft rise on load
            (inner layer — separate so the scroll-linked y never fights it). */}
        <motion.div style={{ y: mockY }} className="will-change-transform">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.0, delay: 0.28, ease: EASE_EXPO }}
          >
            <TerminalMock ticker={ticker} metrics={metrics} ranked={ranked} pressure={pressure} spark={spark} />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

/* MarqueeTicker — full-width, slow, seamless terminal-phrase strip between the
   hero and the first section. The track renders its items twice and loops via
   the -50% translateX CSS keyframe (.slayer-marquee in index.css); reduced
   motion leaves the row static (the keyframe is also disabled in CSS). */
const MARQUEE_ITEMS = [
  'GEX', 'DEX', 'VEX', 'DEALER POSITIONING', 'CALL WALLS', 'PUT WALLS',
  '0DTE LEVELS', 'RANKED SETUPS', 'VOL SURFACE', 'GAMMA FLIP', 'PIN ZONES', 'EXPECTED MOVE',
];

function MarqueeTicker() {
  const reduce = useReducedMotion();
  const row = (ariaHidden: boolean) => (
    <div aria-hidden={ariaHidden || undefined} className="flex shrink-0 items-center">
      {MARQUEE_ITEMS.map((it, i) => (
        <React.Fragment key={i}>
          <span
            className="px-5 text-[10.5px] font-semibold uppercase"
            style={{ letterSpacing: '0.26em', color: faint }}
          >
            {it}
          </span>
          <span className="text-[10px]" style={{ color: 'color-mix(in srgb, var(--text-tertiary) 45%, transparent)' }}>·</span>
        </React.Fragment>
      ))}
    </div>
  );
  return (
    <div
      className="overflow-hidden whitespace-nowrap py-3.5"
      style={{ borderBottom: `1px solid ${line}`, background: PALETTE.bg }}
      role="presentation"
    >
      <div className={`flex w-max ${reduce ? '' : 'slayer-marquee'}`}>
        {row(false)}
        {row(true)}
      </div>
    </div>
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
          <Panel key={i} className="relative overflow-hidden p-5">
            {/* oversized editorial index — giant, low-contrast, scroll-revealed */}
            <div className="pointer-events-none absolute -top-1 right-3">
              <GiantIndex n={`0${i + 1}`} color={PALETTE.accent[i] ?? PALETTE.accent[0]} />
            </div>
            <div className="relative text-[10px] font-semibold tabular-nums" style={{ color: PALETTE.accent[i] ?? PALETTE.accent[0] }}>0{i + 1}</div>
            <div className="relative mt-3 max-w-[85%] text-[14px] font-semibold leading-snug" style={{ color: PALETTE.ghost }}>{c.t}</div>
            <p className="relative mt-2 text-[12.5px] leading-relaxed" style={{ color: muted }}>{c.d}</p>
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
            <MaskedLine>One Terminal.</MaskedLine>
            <MaskedLine delay={0.1}>The Levels That Matter.</MaskedLine>
          </h2>
          <p className="mt-4 max-w-md text-[13.5px] leading-relaxed" style={{ color: muted }}>
            Slayer Terminal turns dealer positioning and options structure into clear levels and
            contract ideas — the read, not the noise.
          </p>
        </div>
        <div className="space-y-2.5">
          {bullets.map((b, i) => (
            <div key={i} className="flex items-start gap-3 rounded-[8px] p-3" style={{ background: PALETTE.panel, border: `1px solid ${line}` }}>
              <span className="mt-[3px] h-3 w-3 shrink-0 rounded-[3px]" style={{ background: PALETTE.accent[i % 4] }} />
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

function FeatureSection({ metrics, ranked, pressure, spark, onEnter }: { metrics: HeroMetrics; ranked: RankedRow[]; pressure: PressureRow[]; spark: number[]; onEnter: (t?: string) => void }) {
  const feats: { t: string; d: string; tab?: string; visual: React.ReactNode }[] = [
    { t: 'Pinpoint GEX', tab: 'pinpoint', d: 'Dealer positioning, gamma walls, put walls, call walls, pin levels.',
      visual: <MicroPositioning rows={pressure} spot={metrics.spot} /> },
    { t: 'SkyVision', tab: 'skyvision', d: 'Ranks trade setups and contracts by structure, momentum, and risk.',
      visual: <MicroRanked rows={ranked} /> },
    { t: 'Dealer Flow', tab: 'dealerflow', d: 'Tracks pressure changes across strikes as the tape develops.',
      visual: <MicroGamma rows={pressure} spot={metrics.spot} callWall={metrics.callWall} putWall={metrics.putWall} /> },
    { t: 'Quant Lab', tab: 'quant', d: 'Volatility surface, Greeks, regime, and expected move.',
      visual: <MicroHeatmap /> },
    { t: 'Trade History', tab: 'auditor', d: 'Tracks setups and outcomes with honest, realized results.',
      visual: <MicroBlotter /> },
    { t: 'Live Terminal', tab: 'liveterminal', d: 'One clean workspace for market structure, start to execution.',
      visual: <MicroTicks data={spark} /> },
  ];
  return (
    <section id="features" className="mx-auto max-w-6xl px-5 py-16">
      <SectionHead eyebrow="Capabilities" title="Six Modules. One Read." />
      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {feats.map((f) => (
          <button
            key={f.t}
            type="button"
            onClick={() => onEnter(f.tab)}
            className="group cursor-pointer text-left transition-transform duration-200 will-change-transform hover:-translate-y-[2px]"
          >
            <Panel className="h-full p-5 transition-shadow duration-200 group-hover:shadow-[0_0_0_1px_var(--border-strong),0_10px_30px_rgba(0,0,0,0.4)]">
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

/* ── product-true micro visuals (~60–80px, SVG/divs only) ──────────────────
   Each mini is a faithful thumbnail of its real page. Real props are used
   whenever present; when a feed isn't connected they fall back to a fixed,
   clearly-decorative silhouette (no fabricated numbers are ever printed). */

const MICRO_FRAME: React.CSSProperties = { background: PALETTE.panelSoft, border: `1px solid ${line}` };
// deterministic diverging silhouette used when no live pressure rows exist
const MICRO_DIVERGE = [0.85, 0.55, 0.3, 0.12, -0.2, -0.5, -0.9];

/* Pinpoint — micro Dealer Positioning Map: diverging horizontal bars from a
   centre axis (steel calls right / red puts left) + a solid spot rule. */
function MicroPositioning({ rows, spot }: { rows: PressureRow[]; spot?: number | null }) {
  const nets = rows.length ? rows.slice(0, 7).map((r) => r.net) : MICRO_DIVERGE;
  const maxAbs = Math.max(1e-9, ...nets.map(Math.abs));
  const W = 220; const rowH = 9; const H = nets.length * rowH + 8;
  const cx = W / 2;
  // spot rule row: the tagged spot row, else the sign-flip crossover
  let spotI = rows.length ? rows.slice(0, 7).findIndex((r) => r.kind === 'spot') : -1;
  if (spotI < 0) { spotI = nets.findIndex((v, i) => i > 0 && nets[i - 1] >= 0 && v < 0); if (spotI < 0) spotI = Math.floor(nets.length / 2); }
  return (
    <div className="rounded-[6px] p-2" style={MICRO_FRAME}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[64px] w-full" role="img" aria-label="Dealer positioning preview">
        <line x1={cx} x2={cx} y1={2} y2={H - 2} stroke={lineStrong} strokeWidth="1" />
        {nets.map((v, i) => {
          const y = 4 + i * rowH + rowH / 2;
          const mag = (Math.abs(v) / maxAbs) * (W / 2 - 8);
          const pos = v >= 0;
          return <rect key={i} x={pos ? cx : cx - mag} y={y - 2.5} width={Math.max(0.6, mag)} height={5} rx={1} fill={pos ? PALETTE.steel : PALETTE.red} fillOpacity={0.9} />;
        })}
        {spotI >= 0 && (
          <g>
            <line x1={4} x2={W - 4} y1={4 + spotI * rowH + rowH / 2} y2={4 + spotI * rowH + rowH / 2} stroke={PALETTE.ghost} strokeOpacity="0.5" strokeWidth="0.8" />
            {isNum(spot) ? <text x={W - 6} y={4 + spotI * rowH + rowH / 2 - 2} textAnchor="end" fontSize="6.5" fill={PALETTE.ghost} style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtLvl(spot)}</text> : null}
          </g>
        )}
      </svg>
    </div>
  );
}

/* SkyVision — micro ranked rows: symbol + confidence bar (+ conf % when real). */
function MicroRanked({ rows }: { rows: RankedRow[] }) {
  const real = rows.slice(0, 4);
  const fallback = [88, 74, 61, 49]; // silhouette widths only — no numbers shown
  const items = real.length
    ? real.map((r) => ({ sym: r.symbol, conf: r.confidence, live: true }))
    : fallback.map((w) => ({ sym: '—', conf: w, live: false }));
  return (
    <div className="space-y-[5px] rounded-[6px] p-2.5" style={MICRO_FRAME}>
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-9 shrink-0 text-[9px] font-semibold tabular-nums" style={{ color: it.live ? PALETTE.ghost : faint }}>{it.sym}</span>
          <div className="relative h-[5px] flex-1 overflow-hidden rounded-[2px]" style={{ background: 'var(--surface-3, var(--surface-2))' }}>
            <div className="absolute inset-y-0 left-0 rounded-[2px]" style={{ width: `${Math.max(0, Math.min(100, it.conf))}%`, background: PALETTE.steel, opacity: 0.9 }} />
          </div>
          <span className="w-7 shrink-0 text-right text-[9px] tabular-nums" style={{ color: muted }}>{it.live ? `${Math.round(it.conf)}%` : '—'}</span>
        </div>
      ))}
    </div>
  );
}

/* Dealer Flow — micro net-gamma histogram: vertical bars around a zero axis,
   green (calls) above right of spot, red (puts) below left, wall markers. */
function MicroGamma({ rows, spot, callWall, putWall }: { rows: PressureRow[]; spot?: number | null; callWall?: number | null; putWall?: number | null }) {
  const src = rows.length ? [...rows].sort((a, b) => a.strike - b.strike) : null;
  const nets = src ? src.map((r) => r.net) : [...MICRO_DIVERGE].reverse();
  const maxAbs = Math.max(1e-9, ...nets.map(Math.abs));
  const W = 220; const H = 64; const mid = H / 2;
  const n = nets.length;
  const bw = Math.max(4, (W - 16) / n - 3);
  const xOf = (i: number) => 8 + (i + 0.5) * ((W - 16) / n);
  const idxNear = (level?: number | null) => {
    if (!src || !isNum(level)) return null;
    let best = 0;
    for (let i = 1; i < src.length; i++) if (Math.abs(src[i].strike - level) < Math.abs(src[best].strike - level)) best = i;
    return best;
  };
  const cwI = idxNear(callWall); const pwI = idxNear(putWall); const spotI = idxNear(spot);
  return (
    <div className="rounded-[6px] p-2" style={MICRO_FRAME}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[64px] w-full" role="img" aria-label="Net gamma by strike preview">
        <line x1={4} x2={W - 4} y1={mid} y2={mid} stroke={lineStrong} strokeWidth="1" />
        {nets.map((v, i) => {
          const h = (Math.abs(v) / maxAbs) * (mid - 6);
          const pos = v >= 0;
          return <rect key={i} x={xOf(i) - bw / 2} y={pos ? mid - h : mid} width={bw} height={Math.max(0.8, h)} rx={1} fill={pos ? PALETTE.green : PALETTE.red} fillOpacity={0.85} />;
        })}
        {cwI != null && <line x1={xOf(cwI)} x2={xOf(cwI)} y1={4} y2={H - 4} stroke={PALETTE.steel} strokeOpacity="0.5" strokeWidth="0.8" strokeDasharray="3 3" />}
        {pwI != null && <line x1={xOf(pwI)} x2={xOf(pwI)} y1={4} y2={H - 4} stroke={PALETTE.red} strokeOpacity="0.5" strokeWidth="0.8" strokeDasharray="3 3" />}
        {spotI != null && <line x1={xOf(spotI)} x2={xOf(spotI)} y1={2} y2={H - 2} stroke={PALETTE.ghost} strokeOpacity="0.55" strokeWidth="0.9" />}
      </svg>
    </div>
  );
}

/* Quant Lab — micro IV-surface heatmap: moneyness × DTE grid shading steel
   (low IV) → amber (high IV) in a smile/short-dated silhouette. */
function MicroHeatmap() {
  const cols = 10; const rowsN = 5;
  // steel #6A93B5 → amber #C79350 interpolation
  const mix = (t: number) => {
    const a = [106, 147, 181]; const b = [199, 147, 80];
    const c = a.map((av, i) => Math.round(av + (b[i] - av) * t));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  };
  return (
    <div className="rounded-[6px] p-2" style={MICRO_FRAME}>
      <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} role="img" aria-label="IV surface preview">
        {Array.from({ length: rowsN * cols }, (_, k) => {
          const r = Math.floor(k / cols); const c = k % cols;
          const m = (c / (cols - 1)) * 2 - 1;            // moneyness −1…+1
          const smile = 0.28 + 0.62 * m * m + 0.18 * Math.max(0, -m); // put-skewed smile
          const term = 1 - r / (rowsN - 1) * 0.45;        // short DTE runs hotter
          const t = Math.max(0, Math.min(1, smile * term));
          return <div key={k} className="h-[10px] rounded-[1px]" style={{ background: mix(t), opacity: 0.85 }} />;
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[8px] uppercase tracking-[0.12em]" style={{ color: faint }}>
        <span>K/F −</span><span>ATM</span><span>K/F +</span>
      </div>
    </div>
  );
}

/* Trade History — micro blotter: hairline rows, entry meta silhouette on the
   left, signed PnL ticks diverging green/red from a zero axis on the right. */
function MicroBlotter() {
  const ticks = [0.62, -0.28, 0.85, 0.4, -0.5]; // silhouette only — no numbers
  return (
    <div className="rounded-[6px] px-2.5 py-1.5" style={MICRO_FRAME}>
      {ticks.map((v, i) => (
        <div key={i} className="flex items-center gap-2 py-[3px]" style={{ borderTop: i === 0 ? 'none' : `1px solid ${line}` }}>
          <span className="h-[5px] w-9 rounded-[2px]" style={{ background: 'color-mix(in srgb, var(--text-tertiary) 28%, transparent)' }} />
          <span className="h-[5px] w-5 rounded-[2px]" style={{ background: 'color-mix(in srgb, var(--text-tertiary) 16%, transparent)' }} />
          <div className="relative h-[6px] flex-1">
            <div className="absolute inset-y-0 left-1/2 w-px" style={{ background: lineStrong }} />
            <div
              className="absolute inset-y-0 rounded-[1px]"
              style={{
                left: v >= 0 ? '50%' : `${50 - Math.abs(v) * 50}%`,
                width: `${Math.abs(v) * 50}%`,
                background: v >= 0 ? PALETTE.green : PALETTE.red,
                opacity: 0.85,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* Live Terminal — micro tick chart: the real close series with GEX node dots. */
function MicroTicks({ data }: { data: number[] }) {
  const H = 56; const W = 220;
  const pts = useMemo(() => {
    if (!data || data.length < 2) return null;
    const min = Math.min(...data); const max = Math.max(...data);
    const span = max - min || 1;
    return data.map((v, i) => [ (i / (data.length - 1)) * (W - 8) + 4, H - 8 - ((v - min) / span) * (H - 16) ] as const);
  }, [data]);
  const nodes = pts ? [0.25, 0.55, 0.85].map((f) => pts[Math.min(pts.length - 1, Math.round(f * (pts.length - 1)))]) : null;
  return (
    <div className="rounded-[6px] p-2" style={MICRO_FRAME}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[60px] w-full" role="img" aria-label="Live tick chart preview">
        {pts ? (
          <>
            <polyline points={pts.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke={PALETTE.steel} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            {nodes!.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={2} fill={PALETTE.amber} />)}
          </>
        ) : (
          <line x1={4} y1={H / 2} x2={W - 4} y2={H / 2} stroke={line} strokeWidth={0.8} strokeDasharray="3 3" />
        )}
      </svg>
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
            <Panel key={i} className="relative overflow-hidden p-5">
              {/* oversized editorial step numeral — reveals on scroll */}
              <div className="pointer-events-none absolute -top-1 right-3">
                <GiantIndex n={String(i + 1)} color={PALETTE.accent[i]} />
              </div>
              <div className="relative text-[11px] font-semibold tabular-nums" style={{ color: PALETTE.accent[i] }}>STEP {i + 1}</div>
              <div className="relative mt-3 max-w-[85%] text-[14px] font-medium leading-snug" style={{ color: PALETTE.ghost }}>{s}</div>
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
                <td className="py-2.5 text-center tabular-nums" style={{ background: 'rgba(106,147,181,0.07)' }}>{cell(r[3], true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* Real plans — mirror SubscriptionPricing (monthly $; annual saves up to 18%).
   The landing shows the actual prices so "you can't even see pricing" is gone;
   the CTA opens the live Pricing page (Stripe checkout / lifetime contact). */
const PLANS: { name: string; price: string; note: string; feats: string[]; featured?: boolean }[] = [
  { name: 'Discord', price: '$39', note: '/ mo', feats: ['Real-time Discord chat & alerts', 'Daily option discovery reports', 'Verified historic trade archive'] },
  { name: 'Pinpoint GEX', price: '$99', note: '/ mo', feats: ['Everything in Discord', 'Live dealer positioning (GEX, DEX, VEX)', 'Gamma exposure by strike', 'Zero-DTE levels & dealer dynamics'] },
  { name: 'SkyVision', price: '$499', note: '/ mo', featured: true, feats: ['Everything in Pinpoint GEX', 'Tells you which options to trade', 'Live volatility surface & expected P&L', 'Trade health score tracker', 'Quant Lab — backtester, order flow & momentum'] },
  { name: 'Lifetime', price: 'Custom', note: 'talk to us', feats: ['All features unlocked', 'Permanent platform access', 'Private 1-on-1 onboarding', 'Early beta access to tools'] },
];

function PlanCard({ p, onEnter }: { p: (typeof PLANS)[number]; onEnter: (t?: string) => void }) {
  return (
    <div
      className="relative flex flex-col rounded-[10px] p-5 transition-colors duration-200"
      style={{
        background: p.featured ? PALETTE.panel : PALETTE.panelSoft,
        border: `1px solid ${p.featured ? lineStrong : line}`,
        boxShadow: p.featured ? '0 30px 80px -50px rgba(0,0,0,0.9)' : 'none',
      }}
    >
      {p.featured ? (
        <span className="absolute -top-2.5 left-5 rounded-[5px] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.16em]" style={{ background: PALETTE.steel, color: '#0A0806' }}>
          Most Popular
        </span>
      ) : null}
      <div className="border-b pb-4" style={{ borderColor: line }}>
        <div className="text-[13px] font-semibold" style={{ color: PALETTE.ghost }}>{p.name}</div>
        <div className="mt-3 flex items-baseline gap-1.5">
          <span className="text-[30px] font-semibold leading-none tabular-nums" style={{ color: PALETTE.text }}>
            <CountUpPrice price={p.price} />
          </span>
          <span className="text-[11px]" style={{ color: faint }}>{p.note}</span>
        </div>
      </div>
      <ul className="mt-4 flex-1 space-y-2">
        {p.feats.map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-[12px] leading-snug" style={{ color: muted }}>
            <Check className="mt-[2px] h-3.5 w-3.5 shrink-0" style={{ color: PALETTE.green }} />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => onEnter('subscription')}
        className="mt-5 w-full cursor-pointer rounded-[7px] px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.1em] transition-colors"
        style={p.featured ? { background: accentFill, color: accentText } : { background: 'transparent', color: PALETTE.text, border: `1px solid ${lineStrong}` }}
        onMouseEnter={(e) => { if (p.featured) e.currentTarget.style.background = accentBright; else e.currentTarget.style.background = hoverWash; }}
        onMouseLeave={(e) => { if (p.featured) e.currentTarget.style.background = accentFill; else e.currentTarget.style.background = 'transparent'; }}
      >
        {p.name === 'Lifetime' ? 'Contact sales' : 'Select plan'}
      </button>
    </div>
  );
}

function PricingSection({ onLaunch, onEnter }: { onLaunch: () => void; onEnter: (t?: string) => void }) {
  return (
    <section id="pricing" className="px-5 py-20" style={{ borderTop: `1px solid ${line}`, background: PALETTE.panelSoft }}>
      <div className="mx-auto max-w-6xl">
        <SectionHead eyebrow="Pricing" title="Plans & Access" sub="Slayer Terminal is live — no waitlist. Pick a plan and open the full terminal. Annual billing saves up to 18%." />
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-stretch">
          {PLANS.map((p) => <PlanCard key={p.name} p={p} onEnter={onEnter} />)}
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <PrimaryButton onClick={onLaunch}>Launch Terminal</PrimaryButton>
          <GhostButton onClick={() => onEnter('subscription')}>See full pricing</GhostButton>
        </div>
        <p className="mt-4 text-center text-[11px]" style={{ color: faint }}>Prices in USD. Sign in to check out — access is granted at payment. Cancel anytime.</p>
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
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-[6px] px-2 py-4 text-left transition-colors"
                onMouseEnter={(e) => (e.currentTarget.style.background = hoverWash)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span className="text-[14px] font-medium" style={{ color: PALETTE.ghost }}>{q}</span>
                <span className="text-[16px] leading-none transition-transform" style={{ color: isOpen ? PALETTE.steel : muted, transform: isOpen ? 'rotate(0deg)' : 'none' }}>{isOpen ? '−' : '+'}</span>
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
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(800px 360px at 50% 120%, rgba(106,147,181,0.12), transparent 70%)' }} />
      <div className="relative mx-auto max-w-2xl text-center">
        <h2 className="text-[30px] font-semibold leading-tight sm:text-[38px]" style={{ color: PALETTE.ghost, letterSpacing: '-0.02em' }}>
          From Traders. For Traders.
        </h2>
        <div className="mt-8 flex justify-center"><PrimaryButton onClick={onLaunch}>Launch Terminal</PrimaryButton></div>
      </div>
    </section>
  );
}

function FootLink({ label, onClick, external }: { label: string; onClick: () => void; external?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-left text-[12px] transition-colors"
      style={{ color: muted }}
      onMouseEnter={(e) => (e.currentTarget.style.color = PALETTE.ghost)}
      onMouseLeave={(e) => (e.currentTarget.style.color = muted)}
    >
      {label}{external ? <ArrowUpRight className="h-3 w-3" /> : null}
    </button>
  );
}

function Footer({ onLaunch, onEnter, scrollTo }: { onLaunch: () => void; onEnter: (t?: string) => void; scrollTo: (id: string) => void }) {
  return (
    <footer className="px-5 pb-10 pt-14" style={{ borderTop: `1px solid ${line}`, background: PALETTE.bg }}>
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
          {/* brand + tagline + social — the ONE canonical logo (BrandLogo.tsx),
              HTML-exact: dim ">" prompt, all-one-ink wordmark, glowing caret. */}
          <div className="col-span-2 sm:col-span-4 lg:col-span-1">
            <span className="inline-block origin-left scale-[0.85]">
              <TerminalLogo expanded />
            </span>
            <p className="mt-3 max-w-xs text-[12px] leading-relaxed" style={{ color: faint }}>
              The options terminal. SkyVision finds the setup, Pinpoint AI reads the flow.
            </p>
            <a
              href="https://x.com/JoinSlayer"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 text-[12px] transition-colors"
              style={{ color: muted }}
              onMouseEnter={(e) => (e.currentTarget.style.color = PALETTE.ghost)}
              onMouseLeave={(e) => (e.currentTarget.style.color = muted)}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
              @JoinSlayer
            </a>
          </div>
          {/* products */}
          <div>
            <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: faint }}>Products</div>
            <div className="flex flex-col gap-2">
              {NAV_MAIN_VIEWS.filter((p) => p.id !== 'home').map((p) => (
                <FootLink key={p.id} label={p.label} onClick={() => onEnter(p.id)} />
              ))}
            </div>
          </div>
          {/* company */}
          <div>
            <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: faint }}>Company</div>
            <div className="flex flex-col gap-2">
              <FootLink label="Pricing" onClick={() => scrollTo('pricing')} />
              <FootLink label="Product" onClick={() => scrollTo('product')} />
              <FootLink label="FAQ" onClick={() => scrollTo('faq')} />
              <FootLink label="Contact" onClick={() => { window.location.href = 'mailto:info@slayerterminal.com'; }} external />
            </div>
          </div>
          {/* access */}
          <div>
            <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: faint }}>Access</div>
            <div className="flex flex-col gap-2">
              <FootLink label="Launch Terminal" onClick={onLaunch} />
              <FootLink label="Log in / Sign up" onClick={onLaunch} />
              <FootLink label="Plans" onClick={() => onEnter('subscription')} />
            </div>
          </div>
        </div>
        <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t pt-6 sm:flex-row sm:items-center" style={{ borderColor: line }}>
          <span className="text-[10px] font-medium uppercase tracking-[0.16em]" style={{ color: faint }}>© 2026 Slayer Terminal · SkyVision · Pinpoint AI · Arbor</span>
          <span className="max-w-lg text-[10px] leading-relaxed sm:text-right" style={{ color: faint }}>
            For informational purposes only. Not investment advice. Analytics platform — not guaranteed profit.
          </span>
        </div>
      </div>
    </footer>
  );
}

/* ─────────────────────────── page ─────────────────────────── */
export default function SlayerLanding({ ticker = 'SPX', metrics = {}, ranked = [], pressure = [], spark = [], onEnter, onLaunch }: SlayerLandingProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const lenisRef = useRef<Lenis | null>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ container: rootRef });
  // hero drifts up + dims as the page scrolls (parallax hand-off to the sections);
  // frozen entirely under prefers-reduced-motion, like every other landing motion.
  const heroYRaw = useTransform(scrollYProgress, [0, 0.16], [0, -70]);
  const heroOpacityRaw = useTransform(scrollYProgress, [0, 0.13], [1, 0.35]);
  const heroY = reduce ? 0 : heroYRaw;
  const heroOpacity = reduce ? 1 : heroOpacityRaw;
  // The TerminalMock drifts DOWN slightly against the hero's upward drift, so
  // it scrolls perceptibly slower than the copy (subtle parallax split).
  const mockYRaw = useTransform(scrollYProgress, [0, 0.16], [0, 34]);
  const mockY = reduce ? 0 : mockYRaw;

  // Smooth-scroll to a section within the landing's own scroll container
  // (footer links → pricing / product / faq). No hash nav — this scroller is
  // `fixed inset-0`, so the document never scrolls. When Lenis is driving the
  // wrapper it owns scrollTop, so route through its scrollTo; native scrollTo
  // would be reverted next frame. Falls back to native under reduced-motion.
  const scrollTo = (id: string) => {
    const root = rootRef.current;
    const el = root?.querySelector<HTMLElement>(`#${id}`);
    if (!root || !el) return;
    if (lenisRef.current) lenisRef.current.scrollTo(el, { offset: -8 });
    else root.scrollTo({ top: el.offsetTop - 8, behavior: 'smooth' });
  };

  // Sidebar "Home" / brand click — the landing IS home, so it scrolls to top.
  const scrollTop = () => {
    if (lenisRef.current) lenisRef.current.scrollTo(0);
    else rootRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Lenis smooth scroll on the landing's own scroll container (wrapper mode, so
  // it drives real scrollTop — the progress rail + reveals keep working). Off
  // under reduced-motion.
  useEffect(() => {
    if (reduce || !rootRef.current || !contentRef.current) return;
    const lenis = new Lenis({
      wrapper: rootRef.current,
      content: contentRef.current,
      duration: 1.1,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });
    lenisRef.current = lenis;
    let raf = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [reduce]);

  return (
    <div
      className="fixed inset-0 z-[40] flex font-mono antialiased"
      style={{ background: 'var(--background)', color: PALETTE.text }}
    >
      {/* SAME left sidebar as the app shell — one navigation everywhere */}
      <LandingSidebar onLaunch={onLaunch} onEnter={onEnter} scrollTop={scrollTop} />

      {/* main scroll area (its own scroller, so Lenis + progress rail + reveals work) */}
      <div ref={rootRef} className="slayer-scrollbar relative flex-1 overflow-y-auto overflow-x-hidden">
        {/* scroll-progress rail — neutral steel→amber→green→red, pinned to top */}
        <motion.div
          aria-hidden="true"
          className="pointer-events-none sticky left-0 top-0 z-[60] h-[2px] w-full origin-left"
          style={{ scaleX: scrollYProgress, background: `linear-gradient(90deg, ${PALETTE.accent[0]}, ${PALETTE.accent[1]}, ${PALETTE.accent[2]}, ${PALETTE.accent[3]})` }}
        />
        <LandingMobileNav onLaunch={onLaunch} onEnter={onEnter} scrollTop={scrollTop} />
        <div ref={contentRef} className="relative z-10">
          <motion.div style={{ y: heroY, opacity: heroOpacity }}>
            <Hero ticker={ticker} metrics={metrics} ranked={ranked} pressure={pressure} spark={spark} onEnter={onEnter} onLaunch={onLaunch} mockY={mockY} />
          </motion.div>
          {/* slow, seamless terminal-phrase marquee between hero and sections */}
          <MarqueeTicker />
          <Reveal><ProblemSection /></Reveal>
          <Reveal><SolutionSection /></Reveal>
          <Reveal><ProductPreview ticker={ticker} metrics={metrics} ranked={ranked} pressure={pressure} spark={spark} onEnter={onEnter} /></Reveal>
          <Reveal><FeatureSection metrics={metrics} ranked={ranked} pressure={pressure} spark={spark} onEnter={onEnter} /></Reveal>
          <Reveal><HowItWorks /></Reveal>
          <Reveal><ComparisonSection /></Reveal>
          <Reveal><PricingSection onLaunch={onLaunch} onEnter={onEnter} /></Reveal>
          <Reveal><FaqSection /></Reveal>
          <Reveal><FinalCta onLaunch={onLaunch} /></Reveal>
          <Footer onLaunch={onLaunch} onEnter={onEnter} scrollTo={scrollTo} />
        </div>
      </div>
    </div>
  );
}
