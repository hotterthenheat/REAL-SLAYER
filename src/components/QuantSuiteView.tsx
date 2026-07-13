/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * QUANT LAB / QUANT SUITE — research, model, and scenario analytics.
 *
 * Hallmark · redesign (single-page, system-managed) · structure: research-sheet +
 * side section rail · theme: GLACIER tokens (locked) · pre-emit critique: P4 H5 E4 S4 R5 V5
 *
 * LAYOUT — the page is a RESEARCH SHEET: a vertical sequence of full-width,
 * numbered instrument sections (01 IV Surface hero → 02 Term Structure → 03
 * Risk-Neutral Distribution → 04 Regime & Scenarios pair → 05 Greeks & Factors →
 * 06 Model Notes → 07 Advanced Labs), indexed by a slim sticky section rail on
 * the left (scroll-spy marks the active section with the accent). The symbol /
 * expiry / model / calibrated toolbar is a sticky compact command row pinned to
 * the top of the sheet. The rail hides on small screens; sections just stack.
 *
 * Styled on the shared Slayer Terminal design system (src/styles/slayer-terminal.css
 * + GLACIER tokens in src/index.css). Color is a data encoding, never decoration,
 * and every figure is computed from real inputs:
 *
 *   · IV SURFACE / TERM STRUCTURE — the deterministic smile+term vol model the page
 *     already computes (ivSurfaceGrid), anchored on the live 1σ expected move read
 *     off the Breeden–Litzenberger RND. Model provenance is badged, never hidden.
 *   · RISK-NEUTRAL DISTRIBUTION — the real B-L solve (∂²C/∂K²) on the option chain.
 *   · REGIME DETECTION — the server's streamed quant_edge signal grid + the
 *     measurable-feature classifier over the candle series.
 *   · MONTE CARLO — deterministically seeded GBM / jump-diffusion / Heston paths.
 *   · GREEKS & FACTORS — OI-weighted aggregates over the actual chain contracts.
 *
 * The original deep-dive labs (Volatility Geometry, Dealer Mechanics, Distribution
 * & Risk, Factor Lab) remain fully reachable as chip-switched sub-views inside the
 * final sheet section — the 3D WebGL surfaces keep their ErrorBoundary/Suspense
 * wrappers.
 */

import React, { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { RefreshCw, Download } from 'lucide-react';
import { useContractStore } from '../lib/store';
import { ASSET_LIST } from '../data';
import { RiskNeutralDistribution } from './RiskNeutralDistribution';
import { ErrorBoundary } from './ErrorBoundary';
import { TailRiskMap } from './TailRiskMap';
import { IvSmile } from './IvSmile';
import { GreekExposurePanel } from './GreekExposurePanel';
import { VolConePanel } from './VolConePanel';
import { StrikeSyncProvider } from './quant/crosshairSync';
import { MonteCarloPanel } from './MonteCarloPanel';
import { RegimeDetectionPanel } from './RegimeDetectionPanel';
import { DealerHedgingPanel } from './DealerHedgingPanel';
import {
  solveImpliedRND,
  calculateRealizedVolSuite,
  calculateVolatilityCone,
  computeSkewAnalytics,
  aggregateExpiryGexCurve,
  type Candle,
  type BreedenLitzenbergerResult,
  type ProbabilityDensityNode,
  type RealizedVolSuite,
  type VolConePoint,
  type SkewMetrics,
  type ExpiryGexNode,
} from '../lib/quantSuite';
import { ChainContract } from '../lib/v11Math';

// Lazy-loaded: pulls in three.js only when a 3D surface actually renders, keeping the
// heavy 3D vendor chunk off the page's initial load.
const QuantSurface3D = lazy(() => import('./quant/QuantSurface3D'));
// Dealer Mechanics moved here from the Pinpoint GEX page — the brutalist 3D dealer
// surfaces + advanced quant panels belong with the rest of the quant tooling.
const DealerMechanicsDashboard = lazy(() => import('./DealerMechanicsDashboard').then(m => ({ default: m.DealerMechanicsDashboard })));
import { ivSurfaceGrid, ivStrikeDomain, exposureSurfaceGrid, strikeDomain, type SurfaceProfile, type StrikeRow } from './quant/dealerSurfaces';
import type { SurfaceMarker } from './quant/QuantSurface3D';
import { QuantEdgePanel } from './QuantEdgePanel';
import { RegimeMatrixPanel } from './RegimeMatrixPanel';
import { FactorLabPanel } from './FactorLabPanel';
import EChart from './ui/EChart';
import { DataTable, type DataColumn } from './ui/terminal/DataTable';

// ────────────────────────────────────────────────────────────────────────────
// Formatting + small helpers
// ────────────────────────────────────────────────────────────────────────────

/** Compact signed magnitude: +1.3B, -212M, +4.1K. */
function fmtCompact(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—';
  const sign = v < 0 ? '-' : '+';
  const a = Math.abs(v);
  if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${sign}${(a / 1e3).toFixed(1)}K`;
  return `${sign}${a.toFixed(a >= 10 ? 0 : 2)}`;
}

const fmtPct = (v: number, d = 2) => `${(v * 100).toFixed(d)}%`;

/** Linear interpolation of the RND CDF at price x (null when no density). */
function cdfAt(density: ProbabilityDensityNode[], x: number): number | null {
  if (!density.length) return null;
  if (x <= density[0].strike) return 0;
  const last = density[density.length - 1];
  if (x >= last.strike) return 1;
  for (let i = 1; i < density.length; i++) {
    const a = density[i - 1];
    const b = density[i];
    if (x <= b.strike) {
      const t = (x - a.strike) / (b.strike - a.strike || 1);
      return a.cumulativeProb + t * (b.cumulativeProb - a.cumulativeProb);
    }
  }
  return last.cumulativeProb;
}

/** Linear interpolation of the ATM model term curve at a DTE. */
function ivAtDte(curve: { d: number; v: number }[], d: number): number | null {
  if (curve.length < 2) return null;
  if (d <= curve[0].d) return curve[0].v;
  const last = curve[curve.length - 1];
  if (d >= last.d) return last.v;
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1];
    const b = curve[i];
    if (d <= b.d) {
      const t = (d - a.d) / (b.d - a.d || 1);
      return a.v + t * (b.v - a.v);
    }
  }
  return last.v;
}

// The design system's magnitude ramp (--gex-1..4) extended with a near-surface dark
// anchor — monotonic lightness, calm recedes / stress pops on the dark panel.
const IV_RAMP = ['#0F1E3A', '#2A5A8A', '#3A8A68', '#9A7830', '#A84020'];
const MODEL_TENOR_MAX_DAYS = 365; // the surface's tenor axis is a documented 0→1y model

// ────────────────────────────────────────────────────────────────────────────
// Research-sheet index — the sticky left rail's anchor targets, in sheet order.
// ────────────────────────────────────────────────────────────────────────────

const SHEET_SECTIONS = [
  { id: 'sheet-iv-surface', num: '01', label: 'IV Surface' },
  { id: 'sheet-term-structure', num: '02', label: 'Term Structure' },
  { id: 'sheet-rnd', num: '03', label: 'Risk-Neutral Dist.' },
  { id: 'sheet-regime', num: '04', label: 'Regime & Scenarios' },
  { id: 'sheet-greeks', num: '05', label: 'Greeks & Factors' },
  { id: 'sheet-notes', num: '06', label: 'Model Notes' },
  { id: 'quant-suite-sub-tabs', num: '07', label: 'Advanced Labs' },
] as const;

type SheetSectionId = (typeof SHEET_SECTIONS)[number]['id'];

// ────────────────────────────────────────────────────────────────────────────
// Presentational atoms (design-system primitives only — no glow, no decoration)
// ────────────────────────────────────────────────────────────────────────────

/** Dense stat cell used beneath / beside the analytics charts. */
function Cell({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: 'pos' | 'neg' | 'warn';
}) {
  const color =
    tone === 'pos'
      ? 'text-[var(--positive-ink)]'
      : tone === 'neg'
        ? 'text-[var(--negative-ink)]'
        : tone === 'warn'
          ? 'text-[var(--warning)]'
          : 'text-[var(--text-primary)]';
  return (
    <div className="min-w-0 rounded-[var(--radius-control,5px)] border border-[var(--border)] bg-[var(--bg-panel-soft)] px-2.5 py-2">
      <div className="truncate text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">{label}</div>
      <div className={`mt-1 truncate text-[15px] font-semibold leading-none slayer-num ${color}`}>{value}</div>
      {sub ? (
        <div className="mt-1 truncate text-[8px] uppercase tracking-[0.14em] text-[var(--text-faint)]">{sub}</div>
      ) : null}
    </div>
  );
}

/** Styled native <select> on the shared `.slayer-control` chrome. */
function ControlSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="slayer-control slayer-num cursor-pointer focus:outline-none focus-visible:border-[var(--border-strong)]"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Uppercase micro label heading a sub-block inside a sheet section. */
function LabLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between border-b border-[var(--border)] pb-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">{children}</span>
      {right}
    </div>
  );
}

/** One line of the Model Notes section — real metadata only. */
function ModelNote({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-[var(--radius-control,5px)] border border-[var(--border)] bg-[var(--bg-panel-soft)] px-3 py-2.5">
      <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">{label}</div>
      <div className="mt-1 text-[11px] leading-relaxed text-[var(--text-secondary)]">{children}</div>
    </div>
  );
}

/** Labeled loading state for the heavy lazy WebGL panels. */
function Surface3DLoading({ label, compact }: { label: string; compact?: boolean }) {
  return (
    <div
      className={`flex w-full flex-col items-center justify-center gap-3 rounded-[var(--radius-panel,8px)] border border-[var(--border)] bg-[var(--bg-panel-soft)] ${compact ? 'h-full' : 'h-[460px]'}`}
      role="status"
      aria-live="polite"
    >
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--text-secondary)]" />
      <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-tertiary)]">{label}</span>
    </div>
  );
}

/** Top vol-stat cell in the terminal header bar (label over tabular value). */
function TopStat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'pos' | 'neg' | 'warn' | 'gold' }) {
  const color =
    tone === 'pos' ? 'text-[var(--positive-ink)]'
      : tone === 'neg' ? 'text-[var(--negative-ink)]'
        : tone === 'warn' ? 'text-[var(--warning)]'
          : tone === 'gold' ? 'text-[var(--gold,#C79350)]'
            : 'text-[var(--text-primary)]';
  return (
    <div className="min-w-0 border-l border-[var(--border)] px-2.5 first:border-l-0">
      <div className="truncate text-[8px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">{label}</div>
      <div className={`slayer-num mt-0.5 truncate text-[12px] font-semibold leading-none ${color}`}>{value}</div>
    </div>
  );
}

/** One compact instrument cell of the QUANT LAB grid — numbered micro-header + body. */
function GridCell({
  num,
  title,
  controls,
  children,
  bodyClassName,
  className,
}: {
  num: string;
  title: string;
  controls?: React.ReactNode;
  children: React.ReactNode;
  bodyClassName?: string;
  className?: string;
}) {
  return (
    <section className={`slayer-panel flex min-w-0 flex-col rounded-[var(--radius-panel,8px)] border border-[var(--border)] bg-[var(--surface)] ${className ?? ''}`}>
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-2.5 py-1.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <span aria-hidden className="slayer-num text-[9px] font-bold tracking-[0.08em] text-[var(--accent-color)]">{num}</span>
          <h3 className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-primary)]">{title}</h3>
        </div>
        {controls ? <div className="flex shrink-0 items-center gap-1.5">{controls}</div> : null}
      </div>
      <div className={bodyClassName ?? 'min-w-0 p-2'}>{children}</div>
    </section>
  );
}

/** Compact KPI cell for the bottom KEY METRICS grid. */
function KpiCell({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'pos' | 'neg' | 'warn' | 'gold' }) {
  const color =
    tone === 'pos' ? 'text-[var(--positive-ink)]'
      : tone === 'neg' ? 'text-[var(--negative-ink)]'
        : tone === 'warn' ? 'text-[var(--warning)]'
          : tone === 'gold' ? 'text-[var(--gold,#C79350)]'
            : 'text-[var(--text-primary)]';
  return (
    <div className="min-w-0 rounded-[var(--radius-control,5px)] border border-[var(--border)] bg-[var(--bg-panel-soft)] px-2.5 py-2">
      <div className="truncate text-[8px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">{label}</div>
      <div className={`slayer-num mt-1 truncate text-[13px] font-semibold leading-none ${color}`}>{value}</div>
    </div>
  );
}

/**
 * One full-width instrument section of the research sheet. Numbered header on the
 * GLACIER panel chrome: var(--surface) fill, 1px var(--border), radius 8.
 */
function SheetSection({
  id,
  num,
  title,
  subtitle,
  meta,
  children,
  contentClassName,
  innerRef,
}: {
  id: string;
  num: string;
  title: string;
  subtitle?: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
  contentClassName?: string;
  innerRef?: React.Ref<HTMLElement>;
}) {
  return (
    <section
      id={id}
      ref={innerRef}
      data-sheet-section
      className="min-w-0 scroll-mt-24 rounded-[var(--radius-panel,8px)] border border-[var(--border)] bg-[var(--surface)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-[var(--border)] px-4 py-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-baseline gap-2.5">
            <span aria-hidden className="slayer-num text-[10px] font-bold tracking-[0.1em] text-[var(--accent-color)]">{num}</span>
            <h3 className="truncate text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--text-primary)]">{title}</h3>
          </div>
          {subtitle ? (
            <p className="mt-1 text-[10px] leading-snug text-[var(--text-tertiary)]">{subtitle}</p>
          ) : null}
        </div>
        {meta}
      </div>
      <div className={contentClassName ?? 'p-3'}>{children}</div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────────────────

type LabTab = 'volgeo' | 'mechanics' | 'distrib' | 'factor';

export default function QuantSuiteView() {
  const activeTicker = useContractStore(s => s.selectedAsset?.ticker || 'SPX');
  const setSelectedAsset = useContractStore(s => s.setSelectedAsset);
  const serverState = useContractStore(s => s.serverState);

  // Top-level view tabs (reference: MONITOR / ANALYZE / RESEARCH / SIMULATE). The dense
  // instrument grid is the MONITOR/ANALYZE surface; RESEARCH/SIMULATE reveal the deep-dive
  // Advanced Labs (3D dealer mechanics, tail risk, factor structure) below.
  const [activeView, setActiveView] = useState<'monitor' | 'analyze' | 'research' | 'simulate'>('analyze');

  // Advanced-labs chip control (the original four deep-dive sections, kept reachable).
  const [activeSubTab, setActiveSubTab] = useState<LabTab>('volgeo');
  const labsRef = useRef<HTMLElement | null>(null);

  // Deep-link from the sidebar flyout: apply a `quant:<sub>` intent once, then clear it.
  const subTabIntent = useContractStore((s) => s.subTabIntent);
  const setSubTabIntent = useContractStore((s) => s.setSubTabIntent);
  useEffect(() => {
    if (!subTabIntent?.startsWith('quant:')) return;
    const sub = subTabIntent.split(':')[1] as LabTab;
    const valid: LabTab[] = ['volgeo', 'mechanics', 'distrib', 'factor'];
    if (valid.includes(sub)) {
      setActiveSubTab(sub);
      // The labs are the sheet's last section — bring the requested lab into view.
      requestAnimationFrame(() => labsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
    setSubTabIntent(null);
  }, [subTabIntent, setSubTabIntent]);

  // Scroll-spy for the sticky section rail: the topmost section crossing the upper
  // band of the viewport is the "active" one the rail marks with the accent.
  const [activeSection, setActiveSection] = useState<SheetSectionId>(SHEET_SECTIONS[0].id);
  useEffect(() => {
    const els = SHEET_SECTIONS
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => !!el);
    if (!els.length || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (!visible.length) return;
        const top = visible.reduce((a, b) => (a.boundingClientRect.top < b.boundingClientRect.top ? a : b));
        setActiveSection(top.target.id as SheetSectionId);
      },
      { rootMargin: '-15% 0px -65% 0px', threshold: 0 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const scrollToSection = (id: SheetSectionId) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveSection(id);
  };

  // RND / Monte-Carlo model horizon (days). The chain is front-expiry only, so the
  // horizon is an explicit model parameter — user-selectable, never a fabricated expiry.
  const [dteD, setDteD] = useState(14);

  // Manual recalibration: bumps the calibration clock and forces the memo graph to
  // re-read the latest streamed state.
  const [refreshNonce, setRefreshNonce] = useState(0);

  // Asset defaults
  const activeAsset = useMemo(() => {
    return ASSET_LIST.find(a => a.ticker === activeTicker) || ASSET_LIST[0];
  }, [activeTicker]);

  const spotPrice = useMemo(() => {
    return serverState?.liveSpotPrices?.[activeTicker] || activeAsset.defaultPrice;
  }, [serverState, activeTicker, activeAsset]);

  // The server streams the SAME near-the-money chain its edge engine computed on
  // (real when API keys are connected, high-fidelity mock when keyless). Using it
  // makes the Lab's RND/greeks/skew match the server and go live automatically.
  const liveChain = serverState?.option_chain as ChainContract[] | undefined;
  const hasLiveChain = Array.isArray(liveChain) && liveChain.length > 0;
  const isLiveData = !!serverState?.chain_live && hasLiveChain;

  const defaultIv = useMemo(() => {
    if (hasLiveChain) {
      // ATM implied vol = the contract whose strike sits closest to spot.
      let best = Infinity;
      let iv = activeAsset.volatility;
      for (const c of liveChain!) {
        const d = Math.abs(c.strike - spotPrice);
        if (d < best && isFinite(c.iv) && c.iv > 0) { best = d; iv = c.iv; }
      }
      return iv;
    }
    return activeAsset.volatility;
  }, [hasLiveChain, liveChain, spotPrice, activeAsset]);

  // Real chain when available; otherwise a conforming high-fidelity mock chain.
  const optionChain = useMemo(() => {
    if (hasLiveChain) return liveChain!;
    const chain: ChainContract[] = [];
    const base = spotPrice;
    const spacing = activeTicker === 'SPX' ? 25 : activeTicker === 'NDX' ? 100 : 5;
    const center = Math.round(base / spacing) * spacing;

    for (let i = -10; i <= 10; i++) {
      const strike = center + i * spacing;
      if (strike <= 0) continue;
      const d1 = (Math.log(base / strike) + 0.05 * 0.08) / (defaultIv * 0.28);
      const prob = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI);

      chain.push({
        strike,
        type: 'call',
        openInterest: Math.round(14500 * prob * (i >= 0 ? 1.5 : 0.6)),
        iv: defaultIv + (i * -0.008) + (i * i * 0.002),
        bid: Math.max(0.1, (base - strike) > 0 ? (base - strike) + 1.2 : 1.2 * prob * spacing),
        ask: Math.max(0.2, ((base - strike) > 0 ? (base - strike) + 1.2 : 1.2 * prob * spacing) + 0.1),
        delta: Math.max(0.01, Math.min(0.99, 0.5 + i * 0.04)),
        gamma: Math.max(0.001, prob * 0.12),
        vega: Math.max(0.01, prob * 2.2),
        theta: -0.15 - Math.abs(i) * 0.02,
        vanna: i * -0.015,
        charm: i * -0.01,
      });

      chain.push({
        strike,
        type: 'put',
        openInterest: Math.round(14500 * prob * (i < 0 ? 1.5 : 0.6)),
        iv: defaultIv + (i * -0.012) + (i * i * 0.0025),
        bid: Math.max(0.1, (strike - base) > 0 ? (strike - base) + 0.9 : 0.9 * prob * spacing),
        ask: Math.max(0.2, ((strike - base) > 0 ? (strike - base) + 0.9 : 0.9 * prob * spacing) + 0.1),
        delta: Math.max(-0.99, Math.min(-0.01, -0.5 + i * 0.04)),
        gamma: Math.max(0.001, prob * 0.12),
        vega: Math.max(0.01, prob * 2.2),
        theta: -0.12 - Math.abs(i) * 0.018,
        vanna: i * -0.012,
        charm: i * -0.008,
      });
    }
    return chain;
  }, [hasLiveChain, liveChain, spotPrice, defaultIv, activeTicker]);

  // Real streamed candles when available (mapped from the server Candle shape);
  // otherwise a synthetic 20-bar series so the Realized Vol Suite still renders.
  const candlesLive = Array.isArray(serverState?.candles) && (serverState!.candles as unknown[]).length >= 10;
  const candles: Candle[] = useMemo(() => {
    const live = serverState?.candles as Array<{ timestamp?: number; time?: number; open: number; high: number; low: number; close: number; volume: number }> | undefined;
    if (Array.isArray(live) && live.length >= 10) {
      return live.slice(-90).map((c, i) => ({
        // Carry the real epoch ms so the realized-vol suite infers the TRUE bar
        // interval (e.g. 15-min) instead of defaulting to 5-min and over-annualizing
        // ~1.7×. Keep `time` for the chart primitives that read it.
        timestamp: c.timestamp ?? c.time ?? i + 1,
        time: c.timestamp ?? c.time ?? i + 1,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      })) as unknown as Candle[];
    }
    // Placeholder shape used only until real candles stream. Sized so the vol
    // suite reads like a real index (~12–16% annualized on 15-min bars) instead
    // of the old ±1.8% sine that produced ~120% HV. Real epoch timestamps (15-min
    // spacing) so the estimator infers the true interval and annualizes correctly.
    const list: Candle[] = [];
    const base = spotPrice;
    let curr = base * 0.985;
    const t0 = 1_700_000_000_000; // fixed epoch base (no Date.now — render-stable)
    for (let i = 0; i < 40; i++) {
      const scale = 1.0 + Math.sin(i * 0.5) * 0.0016 + Math.sin(i * 1.7) * 0.0009;
      const open = curr;
      const close = curr * scale;
      const high = Math.max(open, close) * (1.0 + Math.abs(Math.sin(i)) * 0.0011);
      const low = Math.min(open, close) * (1.0 - Math.abs(Math.cos(i)) * 0.0010);
      list.push({ timestamp: t0 + i * 15 * 60000, time: i + 1, open, high, low, close, volume: 240000 + Math.floor(Math.sin(i) * 45000) } as unknown as Candle);
      curr = close;
    }
    return list;
  }, [serverState, spotPrice]);

  // Real dealer GEX profile streamed from the server (when present).
  const gexProfile = serverState?.gex_profile;

  // Calibration clock: the moment the model graph last recomputed against the
  // streamed state (server tick or manual refresh). Real client-side model time.
  const calibratedAt = useMemo(() => new Date(), [serverState, optionChain, refreshNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  // ===================================
  // 1. RISK-NEUTRAL DENSITY & FAT TAILS
  // ===================================
  const rndResult: BreedenLitzenbergerResult = useMemo(() => {
    return solveImpliedRND(optionChain, spotPrice, defaultIv, dteD / 365, 0.051);
  }, [optionChain, spotPrice, defaultIv, dteD]);

  // ===================================
  // 2. REALIZED VOL SUITE & VRP SPREAD
  // ===================================
  const volSuite: RealizedVolSuite = useMemo(() => {
    return calculateRealizedVolSuite(candles, defaultIv, 20);
  }, [candles, defaultIv]);

  const volCone: VolConePoint[] = useMemo(() => {
    return calculateVolatilityCone(candles, volSuite.yangZhang);
  }, [candles, volSuite]);

  // ===================================
  // 3. SKEW ANALYTICS
  // ===================================
  const skewMetrics: SkewMetrics = useMemo(() => {
    return computeSkewAnalytics(optionChain, spotPrice, defaultIv);
  }, [optionChain, spotPrice, defaultIv]);

  // 1σ expected move (%) read straight off the RND dispersion.
  const expectedMovePct = (rndResult.stdDev / spotPrice) * 100;

  // ── Model IV surface (moneyness × tenor × IV), anchored on the live expected move.
  // Never blanks — with no live chain it is a clean MODEL-MODE surface; with a live
  // chain it is anchored on live dispersion. Feeds the 2D heatmap hero, the ATM term
  // structure, and the 3D surface in the Volatility Geometry lab. ──
  const ivHeroProfile: SurfaceProfile = useMemo(() => ({
    spot: spotPrice,
    expectedMovePct,
    gammaFlip: gexProfile?.gammaFlip,
    callWall: gexProfile?.callWall,
    putWall: gexProfile?.putWall,
  }), [spotPrice, expectedMovePct, gexProfile?.gammaFlip, gexProfile?.callWall, gexProfile?.putWall]);
  const ivHeroGrid = useMemo(() => ivSurfaceGrid(ivHeroProfile), [ivHeroProfile]);
  const ivHeroDomain = useMemo(() => ivStrikeDomain(ivHeroProfile), [ivHeroProfile]);
  const ivHeroMarkers: SurfaceMarker[] = useMemo(() => ([
    spotPrice ? { at: spotPrice, kind: 'spot' as const, label: 'Spot' } : null,
    gexProfile?.callWall != null ? { at: gexProfile.callWall, kind: 'callWall' as const, label: 'Call Wall' } : null,
    gexProfile?.putWall != null ? { at: gexProfile.putWall, kind: 'putWall' as const, label: 'Put Wall' } : null,
  ].filter(Boolean) as SurfaceMarker[]), [spotPrice, gexProfile?.callWall, gexProfile?.putWall]);
  const ivHeroSliceCol = useMemo(() => {
    if (!ivHeroDomain || !spotPrice || !ivHeroGrid[0]) return null;
    const cols = ivHeroGrid[0].length;
    return Math.max(0, Math.min(cols - 1, Math.round(((spotPrice - ivHeroDomain[0]) / (ivHeroDomain[1] - ivHeroDomain[0])) * (cols - 1))));
  }, [ivHeroDomain, spotPrice, ivHeroGrid]);

  // ===================================
  // 7. EXPIRY GEX ENGINE
  // ===================================
  const expiryGex: ExpiryGexNode[] = useMemo(() => {
    return aggregateExpiryGexCurve(optionChain, spotPrice);
  }, [optionChain, spotPrice]);

  // ──────────────────────────────────────────────────────────────────────────
  // Chart options (2D ECharts on the shared slayer-dark theme)
  // ──────────────────────────────────────────────────────────────────────────

  // IV SURFACE (MID) — 2D filled heatmap of the model IV grid over moneyness × DTE.
  const heatmap = useMemo(() => {
    const grid = ivHeroGrid;
    if (!grid.length || !grid[0]?.length) return null;
    const rows = grid.length;
    const cols = grid[0].length;
    const xLabels = Array.from({ length: cols }, (_, c) => (0.8 + 0.4 * (c / (cols - 1))).toFixed(2));
    const yLabels = Array.from({ length: rows }, (_, r) => `${Math.round((r / (rows - 1)) * MODEL_TENOR_MAX_DAYS)}`);
    const data: [number, number, number][] = [];
    let min = Infinity;
    let max = -Infinity;
    grid.forEach((row, r) => row.forEach((v, c) => {
      const p = v * 100;
      data.push([c, r, +p.toFixed(2)]);
      if (p < min) min = p;
      if (p > max) max = p;
    }));
    return { xLabels, yLabels, data, min, max };
  }, [ivHeroGrid]);

  const heatmapOption = useMemo(() => {
    if (!heatmap) return null;
    return {
      animation: false,
      grid: { left: 46, right: 70, top: 12, bottom: 46 },
      tooltip: {
        formatter: (p: { data: [number, number, number] }) => {
          const [c, r, v] = p.data;
          return `K/F <b>${heatmap.xLabels[c]}</b> · DTE <b>${heatmap.yLabels[r]}d</b><br/>IV (mid) <b>${v.toFixed(1)}%</b>`;
        },
      },
      xAxis: {
        type: 'category',
        data: heatmap.xLabels,
        name: 'MONEYNESS (K/F)',
        nameLocation: 'middle',
        nameGap: 30,
        nameTextStyle: { fontSize: 9, color: 'rgba(248,248,255,0.5)' },
        axisLabel: { interval: 4 },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'category',
        data: heatmap.yLabels,
        name: 'DTE',
        nameLocation: 'middle',
        nameGap: 34,
        nameTextStyle: { fontSize: 9, color: 'rgba(248,248,255,0.5)' },
        axisLabel: { interval: 2 },
        axisTick: { show: false },
      },
      visualMap: {
        type: 'continuous',
        min: Math.floor(heatmap.min),
        max: Math.ceil(heatmap.max),
        calculable: false,
        orient: 'vertical',
        right: 0,
        top: 'middle',
        itemWidth: 10,
        itemHeight: 150,
        formatter: (v: number) => `${Number(v).toFixed(0)}%`,
        textStyle: { color: 'rgba(248,248,255,0.5)', fontSize: 9, fontFamily: 'JetBrains Mono, ui-monospace, monospace' },
        inRange: { color: IV_RAMP },
      },
      series: [{
        type: 'heatmap',
        data: heatmap.data,
        progressive: 0,
        itemStyle: { borderColor: '#080706', borderWidth: 1 },
        emphasis: { itemStyle: { borderColor: 'rgba(248,248,255,0.55)' } },
      }],
    };
  }, [heatmap]);

  // VOLATILITY TERM STRUCTURE (ATM) — the surface's ATM column vs model DTE.
  const termCurve = useMemo(() => {
    const grid = ivHeroGrid;
    if (!grid.length || !grid[0]?.length) return [];
    const rows = grid.length;
    const cols = grid[0].length;
    const col = ivHeroSliceCol ?? Math.floor((cols - 1) / 2);
    return grid.map((row, r) => ({
      d: Math.round((r / (rows - 1)) * MODEL_TENOR_MAX_DAYS),
      v: row[col] * 100,
    }));
  }, [ivHeroGrid, ivHeroSliceCol]);

  const termOption = useMemo(() => {
    if (termCurve.length < 2) return null;
    return {
      animation: false,
      grid: { left: 48, right: 16, top: 12, bottom: 42 },
      tooltip: {
        trigger: 'axis',
        formatter: (ps: Array<{ data: [number, number] }>) =>
          ps?.[0] ? `DTE <b>${ps[0].data[0]}d</b> · ATM IV <b>${ps[0].data[1].toFixed(2)}%</b>` : '',
      },
      xAxis: {
        type: 'value',
        name: 'DTE',
        nameLocation: 'middle',
        nameGap: 28,
        nameTextStyle: { fontSize: 9, color: 'rgba(248,248,255,0.5)' },
        min: 0,
        max: MODEL_TENOR_MAX_DAYS,
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        scale: true,
        axisLabel: { formatter: (v: number) => `${v.toFixed(0)}%` },
      },
      series: [{
        type: 'line',
        data: termCurve.map((p) => [p.d, +p.v.toFixed(2)]),
        showSymbol: false,
        lineStyle: { width: 2, color: 'rgba(248,248,255,0.82)' },
        areaStyle: { color: 'rgba(248,248,255,0.05)' },
      }],
    };
  }, [termCurve]);

  const termStats = useMemo(() => ({
    m1: ivAtDte(termCurve, 30),
    m3: ivAtDte(termCurve, 90),
    m6: ivAtDte(termCurve, 180),
    y1: ivAtDte(termCurve, 365),
  }), [termCurve]);

  // RISK-NEUTRAL DISTRIBUTION — the real B-L density with ±1σ/±2σ markers.
  const rndOption = useMemo(() => {
    const { density, mean, stdDev } = rndResult;
    if (density.length < 3) return null;
    const sigmaLine = (x: number, label: string, color: string) => ({
      xAxis: x,
      label: { formatter: label, color, fontSize: 9, fontFamily: 'JetBrains Mono, ui-monospace, monospace' },
      lineStyle: { color, type: 'dashed' as const, width: 1 },
    });
    return {
      animation: false,
      grid: { left: 52, right: 16, top: 22, bottom: 42 },
      tooltip: {
        trigger: 'axis',
        formatter: (ps: Array<{ dataIndex: number; data: [number, number] }>) => {
          const p = ps?.[0];
          if (!p) return '';
          const node = density[p.dataIndex];
          return `K <b>${p.data[0].toLocaleString()}</b><br/>P(K) <b>${(p.data[1] * 100).toFixed(2)}%</b> · CDF <b>${((node?.cumulativeProb ?? 0) * 100).toFixed(1)}%</b>`;
        },
      },
      xAxis: {
        type: 'value',
        scale: true,
        name: 'TERMINAL PRICE',
        nameLocation: 'middle',
        nameGap: 28,
        nameTextStyle: { fontSize: 9, color: 'rgba(248,248,255,0.5)' },
        axisLabel: { formatter: (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 0 }) },
      },
      yAxis: {
        type: 'value',
        axisLabel: { formatter: (v: number) => `${(v * 100).toFixed(1)}%` },
        splitLine: { show: true },
      },
      series: [{
        type: 'line',
        data: density.map((n) => [n.strike, n.probability]),
        showSymbol: false,
        smooth: true,
        lineStyle: { width: 2, color: 'rgba(248,248,255,0.82)' },
        areaStyle: { color: 'rgba(248,248,255,0.07)' },
        markLine: {
          symbol: 'none',
          silent: true,
          data: [
            sigmaLine(spotPrice, 'SPOT', '#2C687B'),
            sigmaLine(rndResult.mean, 'μ', 'rgba(248,248,255,0.5)'),
            sigmaLine(mean - stdDev, '-1σ', '#C49A3A'),
            sigmaLine(mean + stdDev, '+1σ', '#C49A3A'),
            sigmaLine(mean - 2 * stdDev, '-2σ', '#C84848'),
            sigmaLine(mean + 2 * stdDev, '+2σ', '#C84848'),
          ],
        },
      }],
    };
  }, [rndResult, spotPrice]);

  const rndTails = useMemo(() => {
    const { density, mean, stdDev } = rndResult;
    const up = cdfAt(density, mean + 2 * stdDev);
    const dn = cdfAt(density, mean - 2 * stdDev);
    return {
      pAbove2: up == null ? null : 1 - up,
      pBelow2: dn,
    };
  }, [rndResult]);

  // GREEKS — OI-weighted aggregates over the actual chain contracts (Σ greek·OI·100).
  type GreekRow = { greek: string; call: number; put: number; net: number };
  const greekRows: GreekRow[] = useMemo(() => {
    const zero = () => ({ delta: 0, gamma: 0, vega: 0, theta: 0, vanna: 0, charm: 0 });
    const sums: Record<'call' | 'put', ReturnType<typeof zero>> = { call: zero(), put: zero() };
    for (const c of optionChain) {
      const m = (c.openInterest || 0) * 100;
      const s = sums[c.type];
      s.delta += c.delta * m;
      s.gamma += c.gamma * m;
      s.vega += c.vega * m;
      s.theta += c.theta * m;
      s.vanna += c.vanna * m;
      s.charm += c.charm * m;
    }
    const defs: Array<[keyof ReturnType<typeof zero>, string]> = [
      ['delta', 'Delta (Δ)'],
      ['gamma', 'Gamma (Γ)'],
      ['vega', 'Vega (ν)'],
      ['theta', 'Theta (Θ)'],
      ['vanna', 'Vanna'],
      ['charm', 'Charm'],
    ];
    return defs.map(([k, greek]) => ({ greek, call: sums.call[k], put: sums.put[k], net: sums.call[k] + sums.put[k] }));
  }, [optionChain]);

  const greekColumns: DataColumn<GreekRow>[] = useMemo(() => ([
    { id: 'greek', title: 'Greek', render: (r) => <span className="text-[var(--text-primary)]">{r.greek}</span> },
    { id: 'call', title: 'Calls', align: 'right', render: (r) => <span className="slayer-num text-[var(--call)]">{fmtCompact(r.call)}</span> },
    { id: 'put', title: 'Puts', align: 'right', render: (r) => <span className="slayer-num text-[var(--text-secondary)]">{fmtCompact(r.put)}</span> },
    {
      id: 'net',
      title: 'Net',
      align: 'right',
      render: (r) => (
        <span className={`slayer-num font-semibold ${r.net >= 0 ? 'text-[var(--positive-ink)]' : 'text-[var(--negative-ink)]'}`}>
          {fmtCompact(r.net)}
        </span>
      ),
    },
  ]), []);

  // CSV export — only figures already computed on this page. No fabricated fields.
  const exportCsv = () => {
    const lines: string[] = [];
    lines.push(`# QUANT SUITE EXPORT,${activeTicker},${new Date().toISOString()}`);
    lines.push(`# data_source,${serverState?.data_source ?? 'model'}`);
    lines.push(`# chain,${isLiveData ? 'live' : 'model'}`);
    lines.push('');
    lines.push('ATM TERM STRUCTURE');
    lines.push('dte_days,atm_iv_pct');
    termCurve.forEach((p) => lines.push(`${p.d},${p.v.toFixed(3)}`));
    lines.push('');
    lines.push(`RISK-NEUTRAL DENSITY (${dteD}D HORIZON)`);
    lines.push('strike,pdf,cdf');
    rndResult.density.forEach((n) => lines.push(`${n.strike},${n.probability.toExponential(5)},${n.cumulativeProb.toFixed(5)}`));
    lines.push('');
    lines.push('AGGREGATE GREEKS (SUM GREEK x OI x 100)');
    lines.push('greek,calls,puts,net');
    greekRows.forEach((r) => lines.push(`${r.greek},${r.call.toFixed(2)},${r.put.toFixed(2)},${r.net.toFixed(2)}`));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quant-suite-${activeTicker.toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ===================================
  // GRID-CELL DERIVATIONS (real inputs)
  // ===================================

  // HV(10D) / HV(30D) — the same Yang-Zhang estimator over shorter/longer windows of the
  // real candle tape (honest "—" when too few bars).
  const hv10 = useMemo(() => calculateRealizedVolSuite(candles, defaultIv, 10), [candles, defaultIv]);
  const hv30 = useMemo(() => calculateRealizedVolSuite(candles, defaultIv, 30), [candles, defaultIv]);
  const enoughCandles = candles.length >= 6;

  // Per-strike net dealer gamma from the actual chain (calls long-γ, puts short-γ),
  // in $/1%. Feeds both the GAMMA EXPOSURE surface and the DEALER HEDGING simulator.
  const gammaStrikes: StrikeRow[] = useMemo(() => {
    const map = new Map<number, number>();
    for (const c of optionChain) {
      const g = c.gamma * (c.openInterest || 0) * 100 * spotPrice * (c.type === 'put' ? -1 : 1);
      map.set(c.strike, (map.get(c.strike) || 0) + g);
    }
    return [...map.entries()].map(([strike, netGex]) => ({ strike, netGex })).sort((a, b) => a.strike - b.strike);
  }, [optionChain, spotPrice]);

  // Surface profile for the exposure grids — prefers the server's streamed dealer strikes
  // when present, else the chain-derived per-strike net gamma.
  const gammaProfile: SurfaceProfile = useMemo(() => {
    const streamed = gexProfile?.strikes as Array<{ strike: number; netGex: number }> | undefined;
    const strikes = Array.isArray(streamed) && streamed.length >= 4
      ? streamed.map((s) => ({ strike: s.strike, netGex: s.netGex }))
      : gammaStrikes;
    return {
      spot: spotPrice,
      strikes,
      expiries: gexProfile?.expiries as any,
      gammaFlip: gexProfile?.gammaFlip,
      callWall: gexProfile?.callWall,
      putWall: gexProfile?.putWall,
    };
  }, [gexProfile, gammaStrikes, spotPrice]);

  const gexGrid = useMemo(() => exposureSurfaceGrid(gammaProfile, 'netGex'), [gammaProfile]);
  const gexDomain = useMemo(() => strikeDomain(gammaProfile), [gammaProfile]);
  const gexMarkers: SurfaceMarker[] = useMemo(() => ([
    spotPrice ? { at: spotPrice, kind: 'spot' as const, label: 'Spot' } : null,
    gexProfile?.gammaFlip != null ? { at: gexProfile.gammaFlip, kind: 'flip' as const, label: 'γ-Flip' } : null,
  ].filter(Boolean) as SurfaceMarker[]), [spotPrice, gexProfile?.gammaFlip]);

  // OPEN INTEREST surface — real total OI per strike over spot ±8%, with a documented
  // near-dated concentration model across the tenor axis. Sequential (unsigned) intensity.
  const oiGrid = useMemo(() => {
    if (!spotPrice || spotPrice <= 0) return [];
    const oiByStrike = new Map<number, number>();
    for (const c of optionChain) oiByStrike.set(c.strike, (oiByStrike.get(c.strike) || 0) + (c.openInterest || 0));
    const entries = [...oiByStrike.entries()].sort((a, b) => a[0] - b[0]);
    if (entries.length < 4) return [];
    const COLS = 30, ROWS = 16;
    const lo = spotPrice * 0.92, hi = spotPrice * 1.08;
    const valAt = (k: number) => {
      let best = entries[0][1], bd = Infinity;
      for (const [s, v] of entries) { const d = Math.abs(s - k); if (d < bd) { bd = d; best = v; } }
      return best;
    };
    const axis = Array.from({ length: COLS }, (_, c) => lo + (hi - lo) * (c / (COLS - 1)));
    return Array.from({ length: ROWS }, (_, r) => {
      const w = 1 / Math.sqrt(1 + (r / (ROWS - 1)) * 5); // OI thins in far tenors
      return axis.map((k) => valAt(k) * w);
    });
  }, [optionChain, spotPrice]);
  const oiDomain = useMemo(() => strikeDomain(gammaProfile), [gammaProfile]);

  // Max Pain — settle strike minimizing total option intrinsic value (real chain OI).
  const maxPain = useMemo(() => {
    const strikes = [...new Set(optionChain.map((c) => c.strike))].sort((a, b) => a - b);
    if (strikes.length < 3) return null;
    let bestK = strikes[0], bestPain = Infinity;
    for (const K of strikes) {
      let pain = 0;
      for (const c of optionChain) {
        const oi = c.openInterest || 0;
        if (c.type === 'call') pain += oi * Math.max(0, K - c.strike);
        else pain += oi * Math.max(0, c.strike - K);
      }
      if (pain < bestPain) { bestPain = pain; bestK = K; }
    }
    return bestK;
  }, [optionChain]);

  // Put / Call open-interest ratio (real chain).
  const putCallRatio = useMemo(() => {
    let callOi = 0, putOi = 0;
    for (const c of optionChain) { if (c.type === 'call') callOi += c.openInterest || 0; else putOi += c.openInterest || 0; }
    return callOi > 0 ? putOi / callOi : null;
  }, [optionChain]);

  // Regime label — a measurable classification off the realized-vol percentile in its own
  // cone (low RV ⇒ risk-on, elevated ⇒ risk-off). Honest "—" when there is no history.
  const regime = useMemo(() => {
    if (!enoughCandles) return { label: '—', tone: undefined as 'pos' | 'neg' | 'gold' | undefined };
    const p = volSuite.rvPercentile;
    if (p <= 33) return { label: 'Risk-On', tone: 'pos' as const };
    if (p >= 67) return { label: 'Risk-Off', tone: 'neg' as const };
    return { label: 'Neutral', tone: 'gold' as const };
  }, [enoughCandles, volSuite.rvPercentile]);

  // Net dealer gamma sign → dealer positioning read.
  const netGamma = useMemo(() => greekRows.find((r) => r.greek.startsWith('Gamma'))?.net ?? 0, [greekRows]);
  const netVanna = useMemo(() => greekRows.find((r) => r.greek === 'Vanna')?.net ?? 0, [greekRows]);
  const netCharm = useMemo(() => greekRows.find((r) => r.greek === 'Charm')?.net ?? 0, [greekRows]);

  // Recent alerts & signals — DERIVED from real, computed conditions on this page only.
  // Nothing here is fabricated; each row is a measurable state stamped at calibration time.
  const alerts = useMemo(() => {
    const t = calibratedAt.toLocaleTimeString('en-US', { hour12: false });
    const out: { tone: 'pos' | 'neg' | 'warn' | 'gold'; text: string; time: string }[] = [];
    if (rndResult.isFatTailed) out.push({ tone: 'warn', text: `Fat-tailed risk-neutral density (kurtosis ${rndResult.kurtosis.toFixed(2)})`, time: t });
    if (rndResult.skewness < -0.05) out.push({ tone: 'neg', text: `Downside-skewed density (skew ${rndResult.skewness.toFixed(2)})`, time: t });
    if (skewMetrics.riskReversal25D < 0) out.push({ tone: 'neg', text: `Put skew bid · 25Δ RR ${fmtPct(skewMetrics.riskReversal25D)}`, time: t });
    if (enoughCandles) out.push({
      tone: volSuite.varianceRiskPremium >= 0 ? 'pos' : 'neg',
      text: `${volSuite.varianceRiskPremium >= 0 ? 'Positive' : 'Negative'} variance risk premium · ${(volSuite.varianceRiskPremium * 100).toFixed(2)} pts`,
      time: t,
    });
    if (gexProfile?.gammaFlip != null) out.push({ tone: 'gold', text: `Gamma flip level at ${Math.round(gexProfile.gammaFlip).toLocaleString()}`, time: t });
    if (netGamma < 0) out.push({ tone: 'neg', text: 'Dealers net short gamma — flows amplify moves', time: t });
    return out;
  }, [calibratedAt, rndResult, skewMetrics.riskReversal25D, enoughCandles, volSuite.varianceRiskPremium, gexProfile?.gammaFlip, netGamma]);

  // RISK-NEUTRAL DISTRIBUTION cell — density (left axis) + cumulative probability (right
  // axis), the reference's two-curve read, straight off the real B-L solve.
  const rndCellOption = useMemo(() => {
    const { density, mean, stdDev } = rndResult;
    if (density.length < 3) return null;
    return {
      animation: false,
      grid: { left: 40, right: 38, top: 14, bottom: 30 },
      tooltip: {
        trigger: 'axis',
        formatter: (ps: Array<{ data: [number, number]; seriesName: string }>) => {
          if (!ps?.length) return '';
          const k = ps[0].data[0];
          const rows = ps.map((p) => `${p.seriesName} <b>${p.seriesName === 'CDF' ? `${(p.data[1] * 100).toFixed(1)}%` : (p.data[1] * 100).toFixed(2)}</b>`).join('<br/>');
          return `K <b>${k.toLocaleString()}</b><br/>${rows}`;
        },
      },
      xAxis: {
        type: 'value',
        scale: true,
        axisLabel: { fontSize: 8, formatter: (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 0 }) },
      },
      yAxis: [
        { type: 'value', axisLabel: { show: false }, splitLine: { show: false } },
        { type: 'value', min: 0, max: 1, axisLabel: { fontSize: 8, formatter: (v: number) => `${(v * 100).toFixed(0)}%` }, splitLine: { show: false } },
      ],
      series: [
        {
          name: 'Density', type: 'line', yAxisIndex: 0, data: density.map((n) => [n.strike, n.probability]),
          showSymbol: false, smooth: true, lineStyle: { width: 2, color: 'rgba(248,248,255,0.82)' }, areaStyle: { color: 'rgba(248,248,255,0.06)' },
          markLine: {
            symbol: 'none', silent: true,
            data: [
              { xAxis: spotPrice, lineStyle: { color: '#2C687B', type: 'dashed', width: 1 }, label: { formatter: 'SPOT', fontSize: 8, color: '#2C687B' } },
              { xAxis: mean - stdDev, lineStyle: { color: '#C49A3A', type: 'dashed', width: 1 }, label: { show: false } },
              { xAxis: mean + stdDev, lineStyle: { color: '#C49A3A', type: 'dashed', width: 1 }, label: { show: false } },
            ],
          },
        },
        {
          name: 'CDF', type: 'line', yAxisIndex: 1, data: density.map((n) => [n.strike, n.cumulativeProb]),
          showSymbol: false, smooth: true, lineStyle: { width: 1.5, color: '#5B8DB8' },
        },
      ],
    };
  }, [rndResult, spotPrice]);

  const labTabs: { id: LabTab; label: string }[] = [
    { id: 'volgeo', label: 'Volatility Geometry' },
    { id: 'mechanics', label: 'Dealer Mechanics' },
    { id: 'distrib', label: 'Distribution & Risk' },
    { id: 'factor', label: 'Factor Lab' },
  ];

  return (
    <StrikeSyncProvider>
      <div className="slayer-terminal w-full font-mono" id="quant-suite-terminal-view">

        {/* ───────────── HEADER BAR — identity + big price + vol-stat cells + view tabs ───────────── */}
        <div className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--surface)]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 sm:px-4">
            {/* identity + price */}
            <div className="flex items-center gap-2.5">
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-[var(--accent-color)] shadow-[0_0_8px_var(--accent-glow)]" />
              <div className="leading-tight">
                <h2 className="text-[15px] font-bold tracking-[0.06em] text-[var(--text-primary)]">{activeTicker}</h2>
                <p className="truncate text-[8px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">{activeAsset.name}</p>
              </div>
              <div className="flex items-baseline gap-2 pl-1">
                <span className="slayer-num text-[20px] font-bold leading-none text-[var(--text-primary)]">
                  {spotPrice.toLocaleString('en-US', { minimumFractionDigits: activeAsset.decimals, maximumFractionDigits: activeAsset.decimals })}
                </span>
                {/* The global command bar carries the authoritative session Δ; a second
                    Δ here (from this view's longer candle history) would both duplicate
                    and contradict it, so the page header shows the focal price alone. */}
              </div>
            </div>

            {/* vol-stat cells */}
            <div className="flex flex-wrap items-center gap-y-1">
              <TopStat label="IV Rank" value="—" />
              <TopStat label="IV Pctl" value="—" />
              <TopStat label="IV 1D" value="—" />
              <TopStat label="HV 10D" value={enoughCandles && !hv10.isEstimate ? fmtPct(hv10.yangZhang) : '—'} />
              <TopStat label="HV 30D" value={enoughCandles && !hv30.isEstimate ? fmtPct(hv30.yangZhang) : '—'} />
              <TopStat label="VIX" value="—" />
              <TopStat label="Realized Vol" value={enoughCandles && !volSuite.isEstimate ? fmtPct(volSuite.yangZhang) : '—'} />
              <TopStat label="Regime" value={regime.label} tone={regime.tone} />
            </div>

            {/* controls + actions */}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <ControlSelect
                label="Sym"
                value={activeTicker}
                onChange={(v) => {
                  const asset = ASSET_LIST.find((a) => a.ticker === v);
                  if (asset) setSelectedAsset(asset);
                }}
                options={ASSET_LIST.map((a) => a.ticker)}
              />
              <ControlSelect label="Exp" value={`${dteD}D`} onChange={(v) => setDteD(parseInt(v, 10) || 14)} options={['7D', '14D', '21D', '30D']} />
              <span
                className={`slayer-num shrink-0 rounded-[var(--radius-control,5px)] border px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.14em] ${
                  isLiveData ? 'border-[var(--accent-color)] bg-[var(--accent-soft)] text-[var(--accent-color)]' : 'border-[var(--border)] text-[var(--text-tertiary)]'
                }`}
              >
                {isLiveData ? 'Live' : 'Model'} · {calibratedAt.toLocaleTimeString('en-US', { hour12: false })}
              </span>
              <button type="button" onClick={() => setRefreshNonce((n) => n + 1)} aria-label="Recalibrate" className="slayer-control inline-flex cursor-pointer items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]">
                <RefreshCw className="h-3 w-3" /> View
              </button>
              <button type="button" onClick={exportCsv} className="slayer-control inline-flex cursor-pointer items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]">
                <Download className="h-3 w-3" /> Save
              </button>
            </div>
          </div>

          {/* view tabs */}
          <div className="flex items-center gap-1 border-t border-[var(--border)] px-2 sm:px-3">
            {(['monitor', 'analyze', 'research', 'simulate'] as const).map((v) => {
              const active = activeView === v;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setActiveView(v)}
                  aria-pressed={active}
                  className={`cursor-pointer border-b-2 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors ${
                    active
                      ? 'border-[var(--accent-color)] text-[var(--text-primary)]'
                      : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {v}
                </button>
              );
            })}
          </div>
        </div>

        {/* ───────────── BODY ───────────── */}
        <div className="w-full px-3 pb-8 pt-[var(--gap)] sm:px-4">

          {(activeView === 'monitor' || activeView === 'analyze') && (
            <>
              {/* DENSE INSTRUMENT GRID — nine numbered instrument cells */}
              <div className="grid grid-cols-1 gap-[var(--gap)] lg:grid-cols-2 2xl:grid-cols-3">

                {/* 01 · IMPLIED VOLATILITY SURFACE (3D) */}
                <GridCell num="01" title="Implied Volatility Surface" controls={<span className="text-[8px] uppercase tracking-[0.12em] text-[var(--text-faint)]">K/S × tenor · 3D</span>} bodyClassName="p-0">
                  <div className="h-[260px] overflow-hidden rounded-b-[var(--radius-panel,8px)] bg-[#0a0a0b]">
                    <ErrorBoundary label="IV Surface (WebGL)">
                      <Suspense fallback={<Surface3DLoading compact label="Loading IV surface…" />}>
                        <QuantSurface3D grid={ivHeroGrid} ramp="sequential" height={260} axisLabels={['strike', 'tenor', 'IV']} xDomain={ivHeroDomain} xFormat={(v) => v.toLocaleString(undefined, { maximumFractionDigits: 0 })} valueFormat={(v) => `${(v * 100).toFixed(1)}%`} markers={ivHeroMarkers} floorHeatmap legend sliceCol={ivHeroSliceCol} sliceRow={0} />
                      </Suspense>
                    </ErrorBoundary>
                  </div>
                </GridCell>

                {/* 02 · GAMMA EXPOSURE SURFACE (3D) */}
                <GridCell num="02" title="Gamma Exposure Surface" controls={<span className="text-[8px] uppercase tracking-[0.12em] text-[var(--text-faint)]">Γ · net · 3D</span>} bodyClassName="p-0">
                  <div className="h-[260px] overflow-hidden rounded-b-[var(--radius-panel,8px)] bg-[#0a0a0b]">
                    {gexGrid.length ? (
                      <ErrorBoundary label="Gamma Surface (WebGL)">
                        <Suspense fallback={<Surface3DLoading compact label="Loading gamma surface…" />}>
                          <QuantSurface3D grid={gexGrid} ramp="diverging" height={260} axisLabels={['strike', 'tenor', 'net Γ']} xDomain={gexDomain} xFormat={(v) => v.toLocaleString(undefined, { maximumFractionDigits: 0 })} valueFormat={(v) => fmtCompact(v)} markers={gexMarkers} floorHeatmap legend />
                        </Suspense>
                      </ErrorBoundary>
                    ) : (
                      <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Chain too sparse for a gamma surface</div>
                    )}
                  </div>
                </GridCell>

                {/* 03 · RISK-NEUTRAL DISTRIBUTION (density + CDF) */}
                <GridCell num="03" title="Risk-Neutral Distribution" controls={<span className="text-[8px] uppercase tracking-[0.12em] text-[var(--text-faint)]">B-L · density + CDF</span>}>
                  {rndCellOption ? (
                    <div className="h-[240px]" id="quant-suite-rnd-chart"><EChart option={rndCellOption} notMerge /></div>
                  ) : (
                    <div className="flex h-[240px] items-center justify-center text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Chain too sparse for a density solve</div>
                  )}
                </GridCell>

                {/* 04 · MONTE CARLO SIMULATION */}
                <GridCell num="04" title="Monte Carlo Simulation" controls={<span className="slayer-num text-[8px] uppercase tracking-[0.12em] text-[var(--text-faint)]">σ {fmtPct(defaultIv)} · {dteD}D</span>} bodyClassName="max-h-[300px] min-w-0 overflow-auto p-2" className="min-w-0">
                  <div id="quant-suite-monte-carlo" className="min-w-0">
                    <MonteCarloPanel spot={spotPrice} r={0.05} sigma={defaultIv} tYears={Math.max(1, dteD) / 365} ticker={activeTicker} decimals={activeAsset.decimals} />
                  </div>
                </GridCell>

                {/* 05 · DEALER HEDGING SIMULATOR */}
                <GridCell num="05" title="Dealer Hedging Simulator" controls={<span className="text-[8px] uppercase tracking-[0.12em] text-[var(--text-faint)]">net flow</span>} bodyClassName="max-h-[300px] min-w-0 overflow-auto p-2">
                  {gammaProfile.strikes && gammaProfile.strikes.length >= 2 && spotPrice > 0 && expectedMovePct > 0 ? (
                    <div id="quant-suite-hedging" className="min-w-0">
                      <DealerHedgingPanel strikes={gammaProfile.strikes.map((s) => ({ strike: s.strike, netGex: s.netGex }))} spot={spotPrice} emPct={expectedMovePct / 100} decimals={activeAsset.decimals} ticker={activeTicker} live={isLiveData} />
                    </div>
                  ) : (
                    <div className="flex h-[240px] items-center justify-center text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Awaiting dealer strike profile</div>
                  )}
                </GridCell>

                {/* 06 · OPEN INTEREST SURFACE (3D) */}
                <GridCell num="06" title="Open Interest Surface" controls={<span className="text-[8px] uppercase tracking-[0.12em] text-[var(--text-faint)]">OI · 3D</span>} bodyClassName="p-0">
                  <div className="h-[260px] overflow-hidden rounded-b-[var(--radius-panel,8px)] bg-[#0a0a0b]">
                    {oiGrid.length ? (
                      <ErrorBoundary label="OI Surface (WebGL)">
                        <Suspense fallback={<Surface3DLoading compact label="Loading OI surface…" />}>
                          <QuantSurface3D grid={oiGrid} ramp="sequential" height={260} axisLabels={['strike', 'tenor', 'OI']} xDomain={oiDomain} xFormat={(v) => v.toLocaleString(undefined, { maximumFractionDigits: 0 })} valueFormat={(v) => fmtCompact(v)} floorHeatmap legend />
                        </Suspense>
                      </ErrorBoundary>
                    ) : (
                      <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">No open-interest chain streamed</div>
                    )}
                  </div>
                </GridCell>

                {/* 07 · MARKET REGIME DETECTION */}
                <GridCell num="07" title="Market Regime Detection" controls={<span className="text-[8px] uppercase tracking-[0.12em] text-[var(--text-faint)]">multi-signal</span>} bodyClassName="max-h-[320px] min-w-0 overflow-auto p-2">
                  {candles.length >= 30 ? (
                    <RegimeDetectionPanel candles={candles} ticker={activeTicker} />
                  ) : (
                    <RegimeMatrixPanel />
                  )}
                </GridCell>

                {/* 08 · CORRELATION / PCA EXPLORER */}
                <GridCell num="08" title="Correlation / PCA Explorer" controls={<span className="text-[8px] uppercase tracking-[0.12em] text-[var(--text-faint)]">corr · PCA</span>} bodyClassName="max-h-[320px] min-w-0 overflow-auto p-2">
                  <FactorLabPanel chain={optionChain} spot={spotPrice} ticker={activeTicker} live={isLiveData} />
                </GridCell>

                {/* 09 · VOLATILITY TERM STRUCTURE */}
                <GridCell num="09" title="Volatility Term Structure" controls={<span className="text-[8px] uppercase tracking-[0.12em] text-[var(--text-faint)]">multi-tenor</span>} bodyClassName="max-h-[320px] min-w-0 overflow-auto p-2">
                  <div id="quant-suite-vol-cone" className="min-w-0">
                    <VolConePanel cone={volCone} atmIv={defaultIv} realizedVol={volSuite.yangZhang} ticker={activeTicker} live={isLiveData} />
                  </div>
                </GridCell>

              </div>

              {/* 10 · KEY METRICS & SUMMARY + RECENT ALERTS & SIGNALS */}
              <div className="mt-[var(--gap)] grid grid-cols-1 gap-[var(--gap)] xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <GridCell num="10" title="Key Metrics & Summary">
                  <div className="grid grid-cols-2 gap-[6px] sm:grid-cols-3 lg:grid-cols-6">
                    <KpiCell label="IV Rank" value="—" />
                    <KpiCell label="IV Pctl" value="—" />
                    <KpiCell label="IV 1D" value="—" />
                    <KpiCell label="HV 10D" value={enoughCandles && !hv10.isEstimate ? fmtPct(hv10.yangZhang) : '—'} />
                    <KpiCell label="HV 30D" value={enoughCandles && !hv30.isEstimate ? fmtPct(hv30.yangZhang) : '—'} />
                    <KpiCell label="Realized" value={enoughCandles && !volSuite.isEstimate ? fmtPct(volSuite.yangZhang) : '—'} />
                    <KpiCell label="Gamma Exp" value={fmtCompact(netGamma)} tone={netGamma >= 0 ? 'pos' : 'neg'} />
                    <KpiCell label="Vanna Exp" value={fmtCompact(netVanna)} tone={netVanna >= 0 ? 'pos' : 'neg'} />
                    <KpiCell label="Charm Exp" value={fmtCompact(netCharm)} tone={netCharm >= 0 ? 'pos' : 'neg'} />
                    <KpiCell label="Dealer Pos" value={netGamma >= 0 ? 'Long γ' : 'Short γ'} tone={netGamma >= 0 ? 'pos' : 'neg'} />
                    <KpiCell label="Max Pain" value={maxPain != null ? maxPain.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'} tone="gold" />
                    <KpiCell label="Put / Call" value={putCallRatio != null ? putCallRatio.toFixed(2) : '—'} tone={putCallRatio != null && putCallRatio > 1 ? 'neg' : 'pos'} />
                  </div>
                </GridCell>

                <GridCell num="" title="Recent Alerts & Signals" bodyClassName="max-h-[240px] overflow-auto p-2">
                  {alerts.length ? (
                    <ul className="flex flex-col gap-1.5">
                      {alerts.map((a, i) => {
                        const dot = a.tone === 'pos' ? 'bg-[var(--positive-ink)]' : a.tone === 'neg' ? 'bg-[var(--negative-ink)]' : a.tone === 'warn' ? 'bg-[var(--warning)]' : 'bg-[var(--gold,#C79350)]';
                        return (
                          <li key={i} className="flex items-start gap-2 rounded-[var(--radius-control,5px)] border border-[var(--border)] bg-[var(--bg-panel-soft)] px-2 py-1.5">
                            <span aria-hidden className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
                            <span className="min-w-0 flex-1 text-[10px] leading-snug text-[var(--text-secondary)]">{a.text}</span>
                            <span className="slayer-num shrink-0 text-[8px] text-[var(--text-tertiary)]">{a.time}</span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className="flex h-[120px] items-center justify-center text-center text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">No signals — awaiting stream</div>
                  )}
                </GridCell>
              </div>
            </>
          )}

          {(activeView === 'research' || activeView === 'simulate') && (
            <div className="min-w-0 space-y-[var(--gap)]">

            {/* ── 07 · ADVANCED LABS — the original chip-switched deep-dive sub-views ── */}
            <SheetSection
              id="quant-suite-sub-tabs"
              num="07"
              title="Advanced Labs"
              subtitle="Deep-dive surfaces & engines — 3D dealer mechanics, tail risk, factor structure"
              innerRef={labsRef}
              meta={
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  {labTabs.map((t) => {
                    const active = activeSubTab === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setActiveSubTab(t.id)}
                        aria-pressed={active}
                        className={`slayer-control cursor-pointer text-[10px] font-semibold uppercase tracking-[0.14em] ${
                          active
                            ? 'border-[var(--border-strong)] bg-[var(--bg-panel-raised)] text-[var(--text-primary)]'
                            : ''
                        }`}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              }
              contentClassName="space-y-[var(--gap)] p-[var(--panel-pad)]"
            >
              <div className="space-y-[var(--gap)]" id="quant-suite-view-canvas">
                {/* §1 VOLATILITY GEOMETRY — 3D IV surface hero + RV estimators + VRP + cone + smile */}
                {activeSubTab === 'volgeo' && (
                  <>
                    <div>
                      <LabLabel
                        right={<span className="text-[8px] uppercase tracking-[0.14em] text-[var(--text-faint)]">strike × expiry × σ · 3D WebGL</span>}
                      >
                        Implied Volatility Surface · {activeTicker}
                      </LabLabel>
                      <div className="overflow-hidden rounded-[var(--radius-panel,8px)] border border-[var(--border)] bg-[#0a0a0b]">
                        <ErrorBoundary label="IV Surface (WebGL)">
                          <Suspense fallback={<Surface3DLoading label="Loading volatility surface…" />}>
                            <QuantSurface3D
                              grid={ivHeroGrid}
                              ramp="sequential"
                              height={460}
                              axisLabels={['strike', 'tenor', 'IV']}
                              xDomain={ivHeroDomain}
                              xFormat={(v) => v.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              valueFormat={(v) => `${(v * 100).toFixed(1)}%`}
                              markers={ivHeroMarkers}
                              floorHeatmap
                              wallProjections
                              legend
                              sliceCol={ivHeroSliceCol}
                              sliceRow={0}
                            />
                          </Suspense>
                        </ErrorBoundary>
                      </div>
                      <p className="mt-2 rounded-[var(--radius-control,5px)] border border-[var(--border)] bg-[var(--bg-panel-soft)] px-3 py-2 text-[10px] leading-relaxed text-[var(--text-tertiary)]">
                        IV surface anchored on the 1σ expected move (±{expectedMovePct.toFixed(2)}%). X = strike, Z = tenor (near → far),
                        Y/colour = implied vol. Put-side lift is skew; the U across strikes is the smile. The lit ridge is the ATM term structure.
                        The per-strike front smile is charted below.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-[var(--gap)] lg:grid-cols-3">
                      <div className="flex flex-col gap-[var(--gap)] lg:col-span-2">
                        <div>
                          <LabLabel>Realized Volatility Estimators (20d)</LabLabel>
                          <div className="grid grid-cols-1 gap-[6px] sm:grid-cols-3">
                            <Cell label="Parkinson" value={fmtPct(volSuite.parkinson)} sub="High/low range · excludes overnight gaps" />
                            <Cell label="Garman-Klass" value={fmtPct(volSuite.garmanKlass)} sub="OHLC · captures intraday range" />
                            <Cell label="Yang-Zhang" value={fmtPct(volSuite.yangZhang)} sub="Min-variance · gaps + intraday drift" />
                          </div>
                        </div>
                        <div>
                          <LabLabel>Variance Risk Premium (IV − RV)</LabLabel>
                          <div className="grid grid-cols-2 gap-[6px] sm:grid-cols-4">
                            <Cell label="ATM IV" value={fmtPct(defaultIv)} />
                            <Cell label="Yang-Zhang RV" value={fmtPct(volSuite.yangZhang)} tone="warn" />
                            <Cell
                              label="VRP Spread"
                              value={`${(volSuite.varianceRiskPremium * 100).toFixed(2)} pts`}
                              tone={volSuite.varianceRiskPremium >= 0 ? 'pos' : 'neg'}
                            />
                            <Cell label="RV Percentile" value={`${volSuite.rvPercentile}th`} />
                          </div>
                        </div>
                      </div>
                      <div id="quant-suite-vol-cone">
                        <VolConePanel cone={volCone} atmIv={defaultIv} realizedVol={volSuite.yangZhang} ticker={activeTicker} live={isLiveData} />
                      </div>
                    </div>

                    {optionChain.length >= 4 && spotPrice > 0 && (
                      <div id="quant-suite-iv-smile">
                        <IvSmile chain={optionChain} spot={spotPrice} decimals={activeAsset.decimals} ticker={activeTicker} live={isLiveData} />
                      </div>
                    )}
                  </>
                )}

                {/* §2 DEALER MECHANICS — real exposure surfaces (Gamma/Vanna/Charm) + edge + hedging */}
                {activeSubTab === 'mechanics' && (
                  <>
                    <ErrorBoundary label="Dealer Mechanics (WebGL)">
                      <Suspense fallback={<Surface3DLoading label="Loading dealer mechanics…" />}>
                        <DealerMechanicsDashboard profile={gexProfile as any} ticker={activeTicker} decimals={activeAsset.decimals} live={isLiveData} />
                      </Suspense>
                    </ErrorBoundary>

                    {/* Quant edge — RND / VRP / skew / scenario / Kelly / dealer clock */}
                    <QuantEdgePanel />

                    {(gexProfile?.strikes?.length ?? 0) >= 2 && spotPrice > 0 && expectedMovePct > 0 && (
                      <div id="quant-suite-hedging">
                        <DealerHedgingPanel
                          strikes={(gexProfile!.strikes as any[]).map((s) => ({ strike: s.strike, netGex: s.netGex }))}
                          spot={spotPrice}
                          emPct={expectedMovePct / 100}
                          decimals={activeAsset.decimals}
                          ticker={activeTicker}
                          live={isLiveData}
                        />
                      </div>
                    )}

                    {/* REAL dealer GEX (when streamed) + per-expiry GEX breakdown */}
                    <div className="grid grid-cols-1 gap-[var(--gap)] lg:grid-cols-3" id="quant-suite-gex-footer">
                      <div className="rounded-[var(--radius-panel,8px)] border border-[var(--border)] bg-[var(--bg-panel-soft)] p-3">
                        <LabLabel>Dealer GEX Profile</LabLabel>
                        {gexProfile ? (
                          <div className="flex flex-col gap-2 text-[11px]">
                            {([
                              {
                                l: 'Net GEX',
                                v: typeof gexProfile.netGex === 'number' ? `${(gexProfile.netGex / 1e9).toFixed(2)}B` : '—',
                                c: (gexProfile.netGex ?? 0) >= 0 ? 'text-[var(--positive-ink)]' : 'text-[var(--negative-ink)]',
                              },
                              {
                                l: 'Gamma Flip',
                                v: gexProfile.gammaFlip ? gexProfile.gammaFlip.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—',
                                c: 'text-[var(--warning)]',
                              },
                              {
                                l: 'Call Wall',
                                v: gexProfile.callWall ? gexProfile.callWall.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—',
                                c: 'text-[var(--call)]',
                              },
                              {
                                l: 'Put Wall',
                                v: gexProfile.putWall ? gexProfile.putWall.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—',
                                c: 'text-[var(--negative-ink)]',
                              },
                            ]).map((row, i, arr) => (
                              <div key={row.l} className={`flex justify-between ${i < arr.length - 1 ? 'border-b border-[var(--border)] pb-1.5' : ''}`}>
                                <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">{row.l}</span>
                                <span className={`slayer-num font-semibold ${row.c}`}>{row.v}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="py-8 text-center text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                            No dealer GEX profile streamed yet.
                          </div>
                        )}
                      </div>

                      <div className="rounded-[var(--radius-panel,8px)] border border-[var(--border)] bg-[var(--bg-panel-soft)] p-3 lg:col-span-2">
                        <LabLabel right={<span className="text-[8px] uppercase tracking-[0.14em] text-[var(--text-faint)]">Per-expiry</span>}>
                          GEX by Expiry
                        </LabLabel>
                        {expiryGex.length ? (
                          <div className="flex flex-col gap-1.5">
                            {(() => {
                              const maxAbs = Math.max(1, ...expiryGex.map(n => Math.abs(n.totalGex)));
                              return expiryGex.map((node, idx) => {
                                const up = node.totalGex >= 0;
                                const pct = Math.min(100, (Math.abs(node.totalGex) / maxAbs) * 100);
                                const tok = up ? 'var(--positive-ink)' : 'var(--negative-ink)';
                                return (
                                  <div key={idx} className="flex items-center gap-2.5">
                                    <span className="slayer-num w-14 shrink-0 text-[10px] font-semibold text-[var(--text-secondary)]">{node.expiry}</span>
                                    <div className="relative h-[22px] flex-1 overflow-hidden rounded-sm border border-[var(--border)] bg-[var(--bg-panel)]">
                                      <div
                                        className="absolute inset-y-0 left-0"
                                        style={{
                                          width: `${Math.max(3, pct)}%`,
                                          background: `linear-gradient(to right, color-mix(in srgb, ${tok} 55%, transparent), color-mix(in srgb, ${tok} 22%, transparent))`,
                                        }}
                                      />
                                      <span className="slayer-num absolute inset-0 flex items-center px-2 text-[10px] font-semibold" style={{ color: tok }}>
                                        {up ? '+' : '-'}${(Math.abs(node.totalGex) / 1e6).toFixed(1)}M
                                      </span>
                                    </div>
                                    <span className="slayer-num w-16 shrink-0 text-right text-[9px] text-[var(--text-tertiary)]">
                                      K {node.dominantStrike.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                                    </span>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        ) : (
                          <div className="py-8 text-center text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">No per-expiry GEX streamed yet.</div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* §3 DISTRIBUTION & RISK — the full B-L distribution deep-dive + tail-risk map */}
                {activeSubTab === 'distrib' && rndResult.density.length > 2 && spotPrice > 0 && (
                  <>
                    <div id="quant-suite-rnd-distribution">
                      <RiskNeutralDistribution
                        rnd={rndResult}
                        spot={spotPrice}
                        dteDays={dteD}
                        ivAtm={defaultIv}
                        realizedVol={volSuite.yangZhang}
                        callWall={gexProfile?.callWall}
                        putWall={gexProfile?.putWall}
                        gammaFlip={gexProfile?.gammaFlip}
                        decimals={activeAsset.decimals}
                        ticker={activeTicker}
                        live={isLiveData}
                      />
                    </div>
                    <div id="quant-suite-tail-risk">
                      <TailRiskMap
                        rnd={rndResult}
                        spot={spotPrice}
                        dteDays={dteD}
                        callWall={gexProfile?.callWall}
                        putWall={gexProfile?.putWall}
                        gammaFlip={gexProfile?.gammaFlip}
                        decimals={activeAsset.decimals}
                        ticker={activeTicker}
                        live={isLiveData}
                      />
                    </div>
                  </>
                )}

                {/* §4 FACTOR / STRUCTURE LAB — real cross-asset correlation + PCA + IV smile factors */}
                {activeSubTab === 'factor' && (
                  <FactorLabPanel chain={optionChain} spot={spotPrice} ticker={activeTicker} live={isLiveData} />
                )}
              </div>
            </SheetSection>
            </div>
          )}

          {/* ── FOOTER — real metadata only ── */}
          <div className="mt-[var(--gap)] flex flex-wrap items-center justify-between gap-2 px-1 pt-1">
            <span className="text-[8px] uppercase tracking-[0.18em] text-[var(--text-faint)]">Quant Lab · {activeView.toUpperCase()}</span>
            <span className="slayer-num text-[8px] uppercase tracking-[0.14em] text-[var(--text-faint)]">
              {activeTicker} · {isLiveData ? 'live chain' : 'model chain'} · calibrated {calibratedAt.toLocaleTimeString('en-US', { hour12: false })}
            </span>
          </div>
        </div>
      </div>
    </StrikeSyncProvider>
  );
}
