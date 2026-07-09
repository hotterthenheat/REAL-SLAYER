import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'motion/react';
import Lenis from 'lenis';
import { Sparkles, Dna, Waves, RadioTower, LineChart, Database, CreditCard, LogIn, Menu, X, Check, ArrowUpRight, LayoutGrid, GraduationCap } from 'lucide-react';
// The hero backdrop is the real slayerterminal.com motif: a live code/finance
// "rain" (neutral steel/amber tints), NOT a coloured 3D field. Light, no WebGL.
import SlayerCodeRain from './SlayerCodeRain';

// Product nav — mirrors the app shell's sidebar EXACTLY (same tabs, order, and
// Main Views / Tools grouping — see AppShell.tsx) so the landing and terminal
// share one left-sidebar navigation (no top-vs-side, no two-different-navs).
// Each row carries a one-line description so visitors see what every tab is.
type NavProduct = { tab: string; label: string; desc: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> };
const MAIN_VIEWS: NavProduct[] = [
  { tab: 'skyvision', label: 'SkyVision', desc: 'Ranked trade setups', icon: Sparkles },
  { tab: 'pinpoint', label: 'Pinpoint GEX', desc: 'Dealer positioning & walls', icon: Dna },
  { tab: 'dealerflow', label: 'Dealer Flow', desc: 'Live pressure by strike', icon: Waves },
  { tab: 'liveterminal', label: 'Live Terminal', desc: 'Chart + GEX nodes', icon: RadioTower },
  { tab: 'quant', label: 'Quant Lab', desc: 'Vol surface & models', icon: LineChart },
  { tab: 'auditor', label: 'Trade History', desc: 'Tracked outcomes', icon: Database },
];
const TOOLS: NavProduct[] = [
  { tab: 'workspace', label: 'Workspace', desc: 'Saved layouts', icon: LayoutGrid },
  { tab: 'community', label: 'Community', desc: 'Learn & discuss', icon: GraduationCap },
  { tab: 'subscription', label: 'Pricing', desc: 'Plans & access', icon: CreditCard },
];
const PRODUCTS: NavProduct[] = [...MAIN_VIEWS, ...TOOLS];

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

// Landing palette = the SAME neutral brand language as the terminal + the
// slayerterminal.com backdrop. NO purple: colour here means the same thing it
// means inside the app — steel = call-side / SkyVision, amber = dealer flow /
// walls, green = bullish, red = put-side / bearish.
const PALETTE = {
  bg: '#08090A',
  panel: '#100C08',
  panelSoft: '#0A0806',
  text: '#F5F5F5',
  ghost: '#F8F8FF',
  steel: '#6A93B5', // calls / SkyVision (matches the Dealer Positioning Map)
  amber: '#C79350', // dealer flow / GEX / walls / pins (Pinpoint)
  red: '#B23B3B',   // puts / bearish
  green: '#3F9C79', // calls / bullish
  // ordinal accent quartet for numbered/step decoration — neutral, no purple.
  accent: ['#6A93B5', '#C79350', '#3F9C79', '#B23B3B'] as const,
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
      className="inline-flex cursor-pointer items-center justify-center rounded-[7px] px-5 py-2.5 text-[12.5px] font-semibold uppercase tracking-[0.1em] transition-[background,transform,box-shadow] duration-200 will-change-transform"
      style={{ background: PALETTE.ghost, color: '#0A0806' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(248,248,255,0.14)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = PALETTE.ghost; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
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
      className="inline-flex cursor-pointer items-center justify-center rounded-[7px] px-5 py-2.5 text-[12.5px] font-semibold uppercase tracking-[0.1em] transition-[background,transform,border-color] duration-200 will-change-transform"
      style={{ background: 'transparent', color: PALETTE.text, border: `1px solid ${lineStrong}` }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(248,248,255,0.05)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = 'rgba(248,248,255,0.4)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = lineStrong; }}
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

/* Diverging dealer-pressure bars (real strikes; steel = call-side / positive, red = put-side / negative) */
function PressureMap({ rows }: { rows: PressureRow[] }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.net)));
  return (
    <div className="space-y-[3px]">
      {rows.map((r) => {
        const w = (Math.abs(r.net) / max) * 100;
        const pos = r.net >= 0;
        const color = pos ? PALETTE.steel : PALETTE.red;
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

      {/* KPI strip */}
      <div className="grid grid-cols-3 sm:grid-cols-6" style={{ borderBottom: `1px solid ${line}` }}>
        <Kpi label="Spot" value={fmtPx(m.spot)} tone={PALETTE.ghost} />
        <Kpi label="Net GEX" value={fmtGex(m.netGex)} tone={isNum(m.netGex) && m.netGex < 0 ? '#d9736f' : '#6fae7d'} />
        <Kpi label="Call Wall" value={fmtLvl(m.callWall)} tone={PALETTE.steel} />
        <Kpi label="Put Wall" value={fmtLvl(m.putWall)} tone={PALETTE.red} />
        <Kpi label="Pin" value={fmtLvl(m.pin)} tone={PALETTE.amber} />
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

/* ─────────────────────────── sidebar (matches the app shell) ─────────────── */
function BrandMark() {
  return (
    <span className="inline-flex items-center text-[14px] font-bold tracking-[0.02em]" style={{ color: PALETTE.ghost, fontFamily: 'var(--font-brand)' }}>
      <span style={{ color: muted }}>&gt;</span>slayer<span style={{ color: muted }}>_terminal</span>
      <span aria-hidden="true" className="slayer-caret ml-[3px] inline-block h-[13px] w-[7px] rounded-[1px]" style={{ background: PALETTE.ghost, boxShadow: '0 0 10px rgba(244,245,246,0.45)' }} />
    </span>
  );
}

function NavRow({ p, onEnter, onClick }: { p: (typeof PRODUCTS)[number]; onEnter: (t?: string) => void; onClick?: () => void }) {
  const Icon = p.icon;
  return (
    <button
      type="button"
      onClick={() => { onEnter(p.tab); onClick?.(); }}
      className="group flex w-full items-center gap-3 rounded-[8px] px-2.5 py-2 text-left transition-colors"
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(248,248,255,0.05)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" style={{ color: muted }} />
      <span className="min-w-0">
        <span className="block text-[13px] font-medium leading-tight" style={{ color: PALETTE.text }}>{p.label}</span>
        <span className="block truncate text-[10.5px] leading-tight" style={{ color: faint }}>{p.desc}</span>
      </span>
    </button>
  );
}

function SidebarFooter({ onLaunch }: { onLaunch: () => void }) {
  return (
    <div className="space-y-2 border-t px-3 py-4" style={{ borderColor: line }}>
      <div className="flex items-center gap-2 px-2 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: muted }}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#2f9d45', boxShadow: '0 0 8px rgba(47,157,69,0.7)' }} /> Live now
      </div>
      <button
        type="button"
        onClick={onLaunch}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[7px] px-3 py-2.5 text-[12px] font-semibold uppercase tracking-[0.08em] transition-colors"
        style={{ background: PALETTE.ghost, color: '#0A0806' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#ffffff')}
        onMouseLeave={(e) => (e.currentTarget.style.background = PALETTE.ghost)}
      >
        <LogIn className="h-3.5 w-3.5" /> Launch Terminal
      </button>
      <button type="button" onClick={onLaunch} className="w-full cursor-pointer text-center text-[11px]" style={{ color: muted }}>
        Log in / Create account
      </button>
    </div>
  );
}

/** One labelled nav group (mirrors the app shell's "Main Views" / "Tools"). */
function NavGroup({ heading, items, onEnter, onClick }: { heading: string; items: NavProduct[]; onEnter: (t?: string) => void; onClick?: () => void }) {
  return (
    <div>
      <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: faint }}>{heading}</div>
      <div className="space-y-0.5">
        {items.map((p) => <NavRow key={p.tab} p={p} onEnter={onEnter} onClick={onClick} />)}
      </div>
    </div>
  );
}

/** Desktop left sidebar — the same shape, grouping and nav as the app shell. */
function LandingSidebar({ onLaunch, onEnter }: { onLaunch: () => void; onEnter: (t?: string) => void }) {
  return (
    <aside className="hidden w-[248px] shrink-0 flex-col md:flex" style={{ borderRight: `1px solid ${line}`, background: '#050505' }}>
      <div className="px-5 py-[18px]" style={{ borderBottom: `1px solid ${line}` }}><BrandMark /></div>
      <nav className="slayer-scrollbar flex-1 space-y-4 overflow-y-auto px-3 py-4">
        <NavGroup heading="Main Views" items={MAIN_VIEWS} onEnter={onEnter} />
        <NavGroup heading="Tools" items={TOOLS} onEnter={onEnter} />
      </nav>
      <SidebarFooter onLaunch={onLaunch} />
    </aside>
  );
}

/** Mobile top bar + slide-in drawer (mirrors the app's mobile nav). */
function LandingMobileNav({ onLaunch, onEnter }: { onLaunch: () => void; onEnter: (t?: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden">
      <div className="sticky top-0 z-50 flex items-center justify-between px-4 py-3 backdrop-blur" style={{ background: 'rgba(5,5,5,0.85)', borderBottom: `1px solid ${line}` }}>
        <BrandMark />
        <button type="button" aria-label="Menu" onClick={() => setOpen(true)} className="cursor-pointer p-1.5" style={{ color: PALETTE.text }}><Menu className="h-5 w-5" /></button>
      </div>
      {open ? (
        <div className="fixed inset-0 z-[70]">
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-[280px] max-w-[82vw] flex-col" style={{ background: '#050505', borderRight: `1px solid ${line}` }}>
            <div className="flex items-center justify-between px-5 py-[18px]" style={{ borderBottom: `1px solid ${line}` }}>
              <BrandMark />
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="cursor-pointer p-1" style={{ color: muted }}><X className="h-5 w-5" /></button>
            </div>
            <nav className="slayer-scrollbar flex-1 space-y-4 overflow-y-auto px-3 py-4">
              <NavGroup heading="Main Views" items={MAIN_VIEWS} onEnter={onEnter} onClick={() => setOpen(false)} />
              <NavGroup heading="Tools" items={TOOLS} onEnter={onEnter} onClick={() => setOpen(false)} />
            </nav>
            <SidebarFooter onLaunch={() => { setOpen(false); onLaunch(); }} />
          </aside>
        </div>
      ) : null}
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

const HERO_RISE = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const } },
};

function Hero({ ticker, metrics, ranked, pressure, spark, onEnter, onLaunch }: Required<Omit<SlayerLandingProps, 'onEnter' | 'onLaunch'>> & Pick<SlayerLandingProps, 'onEnter' | 'onLaunch'>) {
  const reduce = useReducedMotion();
  return (
    <section className="relative overflow-hidden" style={{ minHeight: '92vh' }}>
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
          <motion.div variants={HERO_RISE}><Eyebrow>From Traders. For Traders.</Eyebrow></motion.div>
          <motion.h1 variants={HERO_RISE} className="mt-4 text-[36px] font-semibold leading-[1.05] sm:text-[46px]" style={{ color: PALETTE.ghost, letterSpacing: '-0.02em' }}>
            Read the flow.<br />Rank the contract.
          </motion.h1>
          <motion.p variants={HERO_RISE} className="mt-5 max-w-xl text-[15px] leading-relaxed" style={{ color: muted }}>
            SkyVision finds the setup, Pinpoint AI reads the flow. GEX, DEX, VEX, dealer positioning,
            and volatility structure — one clean trading command center.
          </motion.p>
          <motion.div variants={HERO_RISE} className="mt-7 flex flex-wrap items-center gap-3">
            <PrimaryButton onClick={onLaunch}>Launch Terminal</PrimaryButton>
            <GhostButton onClick={() => onEnter('pinpoint')}>View Terminal Preview</GhostButton>
          </motion.div>
          <motion.p variants={HERO_RISE} className="mt-5 text-[11.5px]" style={{ color: faint }}>
            Built for traders who need levels, context, and execution clarity.
          </motion.p>
        </motion.div>
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
            <div className="text-[10px] font-semibold tabular-nums" style={{ color: PALETTE.accent[i] ?? PALETTE.accent[0] }}>0{i + 1}</div>
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
          <button
            key={f.t}
            type="button"
            onClick={() => onEnter(f.tab)}
            className="group cursor-pointer text-left transition-transform duration-200 will-change-transform hover:-translate-y-[2px]"
          >
            <Panel className="h-full p-5 transition-shadow duration-200 group-hover:shadow-[0_0_0_1px_rgba(248,248,255,0.22),0_10px_30px_rgba(0,0,0,0.4)]">
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
        <div key={i} className="flex-1 rounded-[2px]" style={{ height: `${(v / max) * 100}%`, background: PALETTE.accent[i % 4], opacity: 0.85 }} />
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
              <div className="text-[11px] font-semibold tabular-nums" style={{ color: PALETTE.accent[i] }}>STEP {i + 1}</div>
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
          <span className="text-[30px] font-semibold leading-none tabular-nums" style={{ color: PALETTE.text }}>{p.price}</span>
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
        style={p.featured ? { background: PALETTE.ghost, color: '#0A0806' } : { background: 'transparent', color: PALETTE.text, border: `1px solid ${lineStrong}` }}
        onMouseEnter={(e) => { if (p.featured) e.currentTarget.style.background = '#ffffff'; else e.currentTarget.style.background = 'rgba(248,248,255,0.05)'; }}
        onMouseLeave={(e) => { if (p.featured) e.currentTarget.style.background = PALETTE.ghost; else e.currentTarget.style.background = 'transparent'; }}
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
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(248,248,255,0.03)')}
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
          {/* brand + tagline + social */}
          <div className="col-span-2 sm:col-span-4 lg:col-span-1">
            <span className="text-[15px] font-bold tracking-[0.02em]" style={{ color: PALETTE.ghost, fontFamily: 'var(--font-brand)' }}>
              <span style={{ color: muted }}>&gt;</span>slayer<span style={{ color: muted }}>_terminal</span>
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
              {MAIN_VIEWS.map((p) => (
                <FootLink key={p.tab} label={p.label} onClick={() => onEnter(p.tab)} />
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
      style={{ background: '#08090A', color: PALETTE.text }}
    >
      {/* SAME left sidebar as the app shell — one navigation everywhere */}
      <LandingSidebar onLaunch={onLaunch} onEnter={onEnter} />

      {/* main scroll area (its own scroller, so Lenis + progress rail + reveals work) */}
      <div ref={rootRef} className="slayer-scrollbar relative flex-1 overflow-y-auto overflow-x-hidden">
        {/* scroll-progress rail — neutral steel→amber→green→red, pinned to top */}
        <motion.div
          aria-hidden="true"
          className="pointer-events-none sticky left-0 top-0 z-[60] h-[2px] w-full origin-left"
          style={{ scaleX: scrollYProgress, background: `linear-gradient(90deg, ${PALETTE.accent[0]}, ${PALETTE.accent[1]}, ${PALETTE.accent[2]}, ${PALETTE.accent[3]})` }}
        />
        <LandingMobileNav onLaunch={onLaunch} onEnter={onEnter} />
        <div ref={contentRef} className="relative z-10">
          <motion.div style={{ y: heroY, opacity: heroOpacity }}>
            <Hero ticker={ticker} metrics={metrics} ranked={ranked} pressure={pressure} spark={spark} onEnter={onEnter} onLaunch={onLaunch} />
          </motion.div>
          <Reveal><ProblemSection /></Reveal>
          <Reveal><SolutionSection /></Reveal>
          <Reveal><ProductPreview ticker={ticker} metrics={metrics} ranked={ranked} pressure={pressure} spark={spark} onEnter={onEnter} /></Reveal>
          <Reveal><FeatureSection metrics={metrics} onEnter={onEnter} /></Reveal>
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
