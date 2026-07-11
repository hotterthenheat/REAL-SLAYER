/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * QUANT LAB / QUANT SUITE — research, model, and scenario analytics.
 *
 * Styled on the shared Slayer Terminal design system (src/styles/slayer-terminal.css
 * + src/components/ui/terminal/*). Color is a data encoding, never decoration, and
 * every figure is computed from real inputs:
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
 * & Risk, Factor Lab) remain fully reachable below as chip-switched sections — the
 * 3D WebGL surfaces keep their ErrorBoundary/Suspense wrappers.
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
import { ivSurfaceGrid, ivStrikeDomain, type SurfaceProfile } from './quant/dealerSurfaces';
import { DataStateBadge, liveState } from './ui/DataStateBadge';
import type { SurfaceMarker } from './quant/QuantSurface3D';
import { QuantEdgePanel } from './QuantEdgePanel';
import { RegimeMatrixPanel } from './RegimeMatrixPanel';
import { FactorLabPanel } from './FactorLabPanel';
import EChart from './ui/EChart';
import { TerminalPanel } from './ui/terminal/TerminalPanel';
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
const IV_RAMP = ['#221650', '#443199', '#792CA2', '#C13383', '#E05454'];
const MODEL_TENOR_MAX_DAYS = 365; // the surface's tenor axis is a documented 0→1y model

// ────────────────────────────────────────────────────────────────────────────
// Presentational atoms (design-system primitives only — no glow, no decoration)
// ────────────────────────────────────────────────────────────────────────────

/** Dense stat cell used beneath the analytics charts. */
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
    <div className="min-w-0 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] px-2.5 py-2">
      <div className="truncate text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{label}</div>
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
      <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</span>
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

/** Uppercase micro section label inside the advanced labs. */
function LabLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between border-b border-[var(--border-subtle)] pb-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{children}</span>
      {right}
    </div>
  );
}

/** One line of the Model Notes panel — real metadata only. */
function ModelNote({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] px-3 py-2.5">
      <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 text-[11px] leading-relaxed text-[var(--text-secondary)]">{children}</div>
    </div>
  );
}

/** Labeled loading state for the heavy lazy WebGL panels. */
function Surface3DLoading({ label }: { label: string }) {
  return (
    <div
      className="flex h-[460px] w-full flex-col items-center justify-center gap-3 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)]"
      role="status"
      aria-live="polite"
    >
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-subtle)] border-t-[var(--text-secondary)]" />
      <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-muted)]">{label}</span>
    </div>
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
      // The labs live below the suite summary now — bring the requested lab into view.
      requestAnimationFrame(() => labsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
    setSubTabIntent(null);
  }, [subTabIntent, setSubTabIntent]);

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
        time: c.timestamp ?? c.time ?? i + 1,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }));
    }
    const list: Candle[] = [];
    const base = spotPrice;
    let curr = base * 0.96;
    for (let i = 0; i < 20; i++) {
      const scale = 1.0 + (Math.sin(i * 0.5) * 0.018);
      const open = curr;
      const close = curr * scale;
      const high = Math.max(open, close) * (1.0 + (Math.abs(Math.sin(i)) * 0.012));
      const low = Math.min(open, close) * (1.0 - (Math.abs(Math.cos(i)) * 0.01));
      list.push({ time: i + 1, open, high, low, close, volume: 240000 + Math.floor(Math.sin(i) * 45000) });
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
  // chain it is anchored on live dispersion. Feeds the 2D heatmap, the ATM term
  // structure, and the 3D hero in the Volatility Geometry lab. ──
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
            sigmaLine(mean - 2 * stdDev, '-2σ', '#E05454'),
            sigmaLine(mean + 2 * stdDev, '+2σ', '#E05454'),
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

  const labTabs: { id: LabTab; label: string }[] = [
    { id: 'volgeo', label: 'Volatility Geometry' },
    { id: 'mechanics', label: 'Dealer Mechanics' },
    { id: 'distrib', label: 'Distribution & Risk' },
    { id: 'factor', label: 'Factor Lab' },
  ];

  const modelBadge = (
    <DataStateBadge state={liveState(isLiveData)} />
  );

  return (
    <StrikeSyncProvider>
      <div className="slayer-terminal p-3 sm:p-4 space-y-[var(--gap)] w-full font-mono" id="quant-suite-terminal-view">

        {/* ───────────── 1. HEADER — identity + controls ───────────── */}
        <header className="slayer-panel flex flex-wrap items-center justify-between gap-3 px-[var(--panel-pad)] py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="slayer-title whitespace-nowrap">Quant Lab / Quant Suite</h2>
              <DataStateBadge state={liveState(isLiveData)} className="shrink-0" />
            </div>
            <p className="slayer-subtitle">Research, model, and scenario analytics</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ControlSelect
              label="Symbol"
              value={activeTicker}
              onChange={(v) => {
                const asset = ASSET_LIST.find((a) => a.ticker === v);
                if (asset) setSelectedAsset(asset);
              }}
              options={ASSET_LIST.map((a) => a.ticker)}
            />
            <ControlSelect
              label="Expiry"
              value={`${dteD}D`}
              onChange={(v) => setDteD(parseInt(v, 10) || 14)}
              options={['7D', '14D', '21D', '30D']}
            />
            <span className="slayer-readout inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em]">
              <span className="text-[var(--text-muted)]">Model</span>
              <span className="font-semibold text-[var(--text-primary)]">BSM · B-L RND</span>
            </span>
            <span className="slayer-readout slayer-num inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em]">
              <span className="text-[var(--text-muted)]">Calibrated</span>
              <span className="font-semibold text-[var(--text-primary)]">{calibratedAt.toLocaleTimeString('en-US', { hour12: false })}</span>
            </span>
            <button
              type="button"
              onClick={() => setRefreshNonce((n) => n + 1)}
              className="slayer-control inline-flex cursor-pointer items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
            >
              <RefreshCw className="h-3 w-3" /> Refresh
            </button>
            <button
              type="button"
              onClick={exportCsv}
              className="slayer-control inline-flex cursor-pointer items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
            >
              <Download className="h-3 w-3" /> Export
            </button>
          </div>
        </header>

        {/* ───────────── 2. IV SURFACE + TERM STRUCTURE ───────────── */}
        <div className="grid grid-cols-1 gap-[var(--gap)] xl:grid-cols-2">
          <TerminalPanel
            title="IV Surface (Mid)"
            subtitle={`Smile × term model anchored on the 1σ expected move (±${expectedMovePct.toFixed(2)}%)`}
            actions={modelBadge}
            contentClassName="p-2"
          >
            {heatmapOption ? (
              <div className="h-[300px]" id="quant-suite-iv-heatmap">
                <EChart option={heatmapOption} notMerge />
              </div>
            ) : (
              <div className="flex h-[300px] items-center justify-center text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Surface unavailable
              </div>
            )}
            <p className="px-2 pb-1 pt-2 text-[9px] leading-relaxed text-[var(--text-faint)]">
              Put-side lift is skew; the U across moneyness is the smile. Tenor axis is a documented 0→1y model — the chain carries a single front expiry.
            </p>
          </TerminalPanel>

          <TerminalPanel
            title="Volatility Term Structure (ATM)"
            subtitle="ATM column of the vol model vs DTE"
            actions={modelBadge}
            contentClassName="flex flex-col gap-2 p-2"
          >
            {termOption ? (
              <div className="h-[240px]" id="quant-suite-term-structure">
                <EChart option={termOption} notMerge />
              </div>
            ) : (
              <div className="flex h-[240px] items-center justify-center text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Term structure unavailable
              </div>
            )}
            <div className="grid grid-cols-2 gap-[6px] sm:grid-cols-5">
              <Cell label="ATM IV" value={fmtPct(defaultIv)} sub="front" />
              <Cell label="IV 1M" value={termStats.m1 != null ? `${termStats.m1.toFixed(2)}%` : '—'} sub="term" />
              <Cell label="IV 3M" value={termStats.m3 != null ? `${termStats.m3.toFixed(2)}%` : '—'} sub="term" />
              <Cell label="IV 6M" value={termStats.m6 != null ? `${termStats.m6.toFixed(2)}%` : '—'} sub="term" />
              <Cell label="IV 1Y" value={termStats.y1 != null ? `${termStats.y1.toFixed(2)}%` : '—'} sub="term" />
            </div>
          </TerminalPanel>
        </div>

        {/* ───────────── 3. RND + MONTE CARLO (left) | REGIME DETECTION (right) ───────────── */}
        {/* The Regime signal column is intrinsically tall (11 live signals + candle-series
            classifier). Pairing a lone short chart beside it stretched that chart into a
            ~800px black void. Instead the left column stacks the RND density over the
            Monte-Carlo panel, whose sample-path cloud GROWS to fill the column height the
            Regime panel sets — the void becomes a bigger, honest visualization. */}
        <div className="grid grid-cols-1 gap-[var(--gap)] xl:grid-cols-2 xl:items-stretch">
          {/* LEFT — RND (natural height) over Monte Carlo (fills the remaining column) */}
          <div className="flex min-h-0 flex-col gap-[var(--gap)]">
            <TerminalPanel
              title="Risk-Neutral Distribution"
              subtitle={`Breeden–Litzenberger ∂²C/∂K² on the option chain · ${dteD}D horizon · r = 5.1%`}
              contentClassName="flex flex-col gap-2 p-2"
            >
              {rndOption ? (
                <div className="h-[300px]" id="quant-suite-rnd-chart">
                  <EChart option={rndOption} notMerge />
                </div>
              ) : (
                <div className="flex h-[300px] items-center justify-center text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  Chain too sparse for a density solve
                </div>
              )}
              <div className="grid grid-cols-2 gap-[6px] sm:grid-cols-5">
                <Cell label="Exp Move" value={`±${expectedMovePct.toFixed(2)}%`} sub={`1σ · ${dteD}D`} />
                <Cell
                  label="Skew"
                  value={rndResult.skewness.toFixed(3)}
                  tone={rndResult.skewness < 0 ? 'neg' : 'pos'}
                  sub={rndResult.skewness < 0 ? 'Put-tailed' : 'Call-tailed'}
                />
                <Cell
                  label="Kurtosis"
                  value={rndResult.kurtosis.toFixed(2)}
                  tone={rndResult.isFatTailed ? 'warn' : undefined}
                  sub={rndResult.isFatTailed ? 'Fat-tailed' : 'Excess'}
                />
                <Cell label="P(>+2σ)" value={rndTails.pAbove2 != null ? fmtPct(rndTails.pAbove2) : '—'} sub="Upper tail" />
                <Cell label="P(<-2σ)" value={rndTails.pBelow2 != null ? fmtPct(rndTails.pBelow2) : '—'} sub="Lower tail" />
              </div>
            </TerminalPanel>

            <TerminalPanel
              title="Monte Carlo Scenario Summary"
              subtitle={`Seeded GBM / jump-diffusion / Heston paths · σ = ${fmtPct(defaultIv)} · ${dteD}D horizon · r = 5.0%`}
              actions={<DataStateBadge state="model" />}
              contentClassName="p-2"
              className="min-h-0 flex-1"
            >
              <div id="quant-suite-monte-carlo" className="h-full min-h-0">
                <MonteCarloPanel
                  spot={spotPrice}
                  r={0.05}
                  sigma={defaultIv}
                  tYears={Math.max(1, dteD) / 365}
                  ticker={activeTicker}
                  decimals={activeAsset.decimals}
                />
              </div>
            </TerminalPanel>
          </div>

          {/* RIGHT — Regime Detection (the tall signal column that anchors the row) */}
          <TerminalPanel
            title="Regime Detection"
            subtitle="Streamed quant-edge signal grid + measurable-feature classifier over the candle series"
            contentClassName="flex flex-col gap-[var(--gap)] p-2"
          >
            <RegimeMatrixPanel />
            {candles.length >= 30 ? (
              <RegimeDetectionPanel candles={candles} ticker={activeTicker} />
            ) : (
              <p className="px-1 text-[9px] uppercase tracking-[0.14em] text-[var(--text-faint)]">
                Candle-series classifier needs ≥30 live bars — awaiting stream.
              </p>
            )}
          </TerminalPanel>
        </div>

        {/* ───────────── 4. GREEKS & FACTOR EXPOSURES (full width) ───────────── */}
        {/* Full-width now that Monte Carlo joined the RND column above — the OI-weighted
            aggregates, smile factors, per-expiry profile and per-strike exposure chart
            all fill the wider row, so no panel is stretched past its content. */}
        <TerminalPanel
          title="Greeks & Factor Exposures"
          subtitle="OI-weighted chain aggregates · smile factors · per-expiry profile"
          contentClassName="flex flex-col gap-[var(--gap)] p-2"
        >
            <div>
              <LabLabel right={<span className="text-[8px] uppercase tracking-[0.14em] text-[var(--text-faint)]">Σ greek × OI × 100</span>}>
                Aggregate Greeks
              </LabLabel>
              <DataTable columns={greekColumns} rows={greekRows} rowKey={(r) => r.greek} />
            </div>

            <div>
              <LabLabel>Smile / Vol Factor Exposures</LabLabel>
              <div className="grid grid-cols-2 gap-[6px] sm:grid-cols-4">
                <Cell
                  label="25Δ RR"
                  value={fmtPct(skewMetrics.riskReversal25D)}
                  tone={skewMetrics.riskReversal25D < 0 ? 'neg' : 'pos'}
                  sub="Call − put IV"
                />
                <Cell label="25Δ Fly" value={fmtPct(skewMetrics.butterfly25D)} sub="Wings − ATM" />
                <Cell
                  label="VRP"
                  value={`${(volSuite.varianceRiskPremium * 100).toFixed(2)} pts`}
                  tone={volSuite.varianceRiskPremium >= 0 ? 'pos' : 'neg'}
                  sub="IV − RV (Y-Z)"
                />
                <Cell label="RV %ile" value={`${volSuite.rvPercentile}th`} sub="Own cone" />
              </div>
            </div>

            <div>
              <LabLabel right={<span className="text-[8px] uppercase tracking-[0.14em] text-[var(--text-faint)]">Chain carries the front expiry only</span>}>
                Per-Expiry Greek Profile
              </LabLabel>
              {expiryGex.length ? (
                <div className="flex flex-col gap-1">
                  {expiryGex.map((node) => (
                    <div key={node.expiry} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] px-3 py-2 text-[10px]">
                      <span className="font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">{node.expiry}</span>
                      <span className="slayer-num text-[var(--call)]">Call GEX {fmtCompact(node.callGex)}</span>
                      <span className="slayer-num text-[var(--negative-ink)]">Put GEX {fmtCompact(node.putGex)}</span>
                      <span className={`slayer-num font-semibold ${node.totalGex >= 0 ? 'text-[var(--positive-ink)]' : 'text-[var(--negative-ink)]'}`}>
                        Net {fmtCompact(node.totalGex)}
                      </span>
                      <span className="slayer-num text-[var(--text-muted)]">Dominant K {node.dominantStrike.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[9px] uppercase tracking-[0.14em] text-[var(--text-faint)]">No chain streamed yet.</p>
              )}
            </div>

            {optionChain.length >= 4 && spotPrice > 0 && (
              <div id="quant-suite-greek-exposure">
                <LabLabel>Per-Strike Exposure Profile</LabLabel>
                <GreekExposurePanel
                  chain={optionChain}
                  spot={spotPrice}
                  decimals={activeAsset.decimals}
                  ticker={activeTicker}
                  live={isLiveData}
                  callWall={gexProfile?.callWall}
                  putWall={gexProfile?.putWall}
                  gammaFlip={gexProfile?.gammaFlip}
                />
              </div>
            )}
          </TerminalPanel>

        {/* ───────────── 5. MODEL NOTES & ASSUMPTIONS (real metadata only) ───────────── */}
        <TerminalPanel
          title="Model Notes & Assumptions"
          subtitle="Structure and assumptions of every model on this page — nothing here is a fitted-quality claim"
          contentClassName="grid grid-cols-1 gap-[6px] sm:grid-cols-2 xl:grid-cols-3 p-2"
        >
          <ModelNote label="Universe">
            {activeTicker} · front expiry · {optionChain.length} contracts · near-the-money
          </ModelNote>
          <ModelNote label="Calibrated">
            {calibratedAt.toLocaleTimeString('en-US', { hour12: false })} local · recomputed on every server tick or manual refresh
          </ModelNote>
          <ModelNote label="Risk-Neutral Density">
            Breeden–Litzenberger ∂²C/∂K² on a quadratic smile fit IV(K) = a + b·ln(K/S) + c·ln²(K/S) · horizon {dteD}D · r = 5.1%
          </ModelNote>
          <ModelNote label="Realized Volatility">
            Parkinson / Garman–Klass / Yang–Zhang over the last 20 bars
          </ModelNote>
          <ModelNote label="IV Surface">
            Deterministic smile + term model anchored on the 1σ expected move (σ ≈ EM·√252). Tenor axis is a documented 0→1y model.
          </ModelNote>
          <ModelNote label="Monte Carlo">
            Deterministically seeded paths under GBM / jump-diffusion / Heston on real spot & ATM vol inputs · r = 5.0%
          </ModelNote>
        </TerminalPanel>

        {/* ───────────── 6. ADVANCED LABS — the original deep-dive sections ───────────── */}
        <section ref={labsRef} className="slayer-panel scroll-mt-4" id="quant-suite-sub-tabs">
          <div className="slayer-panel-header flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="slayer-title">Advanced Labs</div>
              <div className="slayer-subtitle">Deep-dive surfaces & engines — 3D dealer mechanics, tail risk, factor structure</div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
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
          </div>

          <div className="space-y-[var(--gap)] p-[var(--panel-pad)]" id="quant-suite-view-canvas">
            {/* §1 VOLATILITY GEOMETRY — 3D IV surface hero + RV estimators + VRP + cone + smile */}
            {activeSubTab === 'volgeo' && (
              <>
                <div>
                  <LabLabel
                    right={<span className="text-[8px] uppercase tracking-[0.14em] text-[var(--text-faint)]">strike × expiry × σ · 3D WebGL</span>}
                  >
                    Implied Volatility Surface · {activeTicker}
                  </LabLabel>
                  <div className="overflow-hidden rounded-md border border-[var(--border-subtle)] bg-[#0a0a0b]">
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
                          dataState={isLiveData ? 'live' : 'model'}
                          sliceCol={ivHeroSliceCol}
                          sliceRow={0}
                        />
                      </Suspense>
                    </ErrorBoundary>
                  </div>
                  <p className="mt-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] px-3 py-2 text-[10px] leading-relaxed text-[var(--text-muted)]">
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
                  <div className="rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] p-3">
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
                          <div key={row.l} className={`flex justify-between ${i < arr.length - 1 ? 'border-b border-[var(--border-subtle)] pb-1.5' : ''}`}>
                            <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">{row.l}</span>
                            <span className={`slayer-num font-semibold ${row.c}`}>{row.v}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-8 text-center text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                        No dealer GEX profile streamed yet.
                      </div>
                    )}
                  </div>

                  <div className="rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] p-3 lg:col-span-2">
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
                                <div className="relative h-[22px] flex-1 overflow-hidden rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-panel)]">
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
                                <span className="slayer-num w-16 shrink-0 text-right text-[9px] text-[var(--text-muted)]">
                                  K {node.dominantStrike.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                                </span>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    ) : (
                      <div className="py-8 text-center text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">No per-expiry GEX streamed yet.</div>
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
        </section>
      </div>
    </StrikeSyncProvider>
  );
}
