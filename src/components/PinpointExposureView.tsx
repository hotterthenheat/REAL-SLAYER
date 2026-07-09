/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PINPOINT — the dealer-exposure terminal page. A high-density read of dealer
 * inventory & sensitivity by strike (GEX / DEX / VEX), a diverging dealer-
 * positioning map, and a set of derived positioning insights.
 *
 * Every figure on this page is computed from the live server GEX profile
 * (serverState.gex_profile) — the exact same feed DealerFlowView consumes. No
 * value is fabricated: when the profile is missing we render the same honest
 * pending state, and when a specific level is absent we show "—".
 *
 * Styling is the shared Slayer Terminal design system (src/styles/slayer-terminal.css
 * + src/components/ui/terminal/*). Color is a data encoding, never decoration.
 */

import { useMemo, useRef, useState, useEffect } from 'react';
import { useContractStore } from '../lib/store';
import { TerminalPanel } from './ui/terminal/TerminalPanel';
import { MetricStrip, type Metric, type MetricTone } from './ui/terminal/MetricStrip';
import { InsightPanel } from './ui/terminal/InsightPanel';
import { StatusBadge } from './ui/terminal/StatusBadge';
import { DealerPositioningMap } from './pinpoint/DealerPositioningMap';
import { Download, Waves } from 'lucide-react';

// ────────────────────────────────────────────────────────────────────────────
// Formatting helpers (compact $ magnitudes, tabular-friendly)
// ────────────────────────────────────────────────────────────────────────────

/** Compact magnitude: 1.3B, 212M, 4.1K, +70. `signed` forces a leading + on positives. */
function fmtCompact(v: number | null | undefined, signed = false): string {
  if (v == null || !isFinite(v)) return '—';
  const sign = v < 0 ? '-' : signed ? '+' : '';
  const a = Math.abs(v);
  if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(a / 1e9 >= 100 ? 0 : 2)}B`;
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(a / 1e6 >= 100 ? 0 : 1)}M`;
  if (a >= 1e3) return `${sign}${(a / 1e3).toFixed(a / 1e3 >= 100 ? 0 : 1)}K`;
  return `${sign}${a.toFixed(0)}`;
}

/** Bare magnitude (no sign — colour encodes direction): 1.3B, 212M, 4K, 70. */
function fmtMag(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e9) return `${(a / 1e9).toFixed(a / 1e9 >= 100 ? 0 : 1)}B`;
  if (a >= 1e6) return `${(a / 1e6).toFixed(0)}M`;
  if (a >= 1e3) return `${(a / 1e3).toFixed(0)}K`;
  return `${a.toFixed(0)}`;
}

/** Signed big-number in billions: "-12.86B" / "+3.40B". */
function fmtBnSigned(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—';
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '+';
  if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(1)}M`;
  return `${sign}${a.toFixed(0)}`;
}

/** Level price with thousands separators, no decimals. */
function fmtLevel(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—';
  return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/** Signed percent, one decimal. */
function fmtPct(v: number | null | undefined, signed = true): string {
  if (v == null || !isFinite(v)) return '—';
  const sign = signed && v > 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

// Brand colours used for inline styles (matrix cells / row markers). Color = data.
const SLAYER_RED = 'var(--slayer-red)'; // #980404 — deepest put/risk red (bars)
const CALL_PURPLE = 'var(--call)';       // #792CA2 — calls
const NEG_RED = '#d94646';               // .slayer-neg — legible negative
const POS_GREEN = '#2f9d45';             // .slayer-pos — legible positive

const TONE_TEXT: Record<MetricTone, string> = {
  neutral: 'text-[var(--text-primary)]',
  positive: 'text-[#2f9d45]',
  negative: 'text-[#d94646]',
  warning: 'text-[var(--warning)]',
  call: 'text-[var(--call)]',
  pin: 'text-[var(--pin)]',
};

// ────────────────────────────────────────────────────────────────────────────
// Small presentational atoms
// ────────────────────────────────────────────────────────────────────────────

/** A single greek cell: right-aligned tabular number over a thin proportional bar. */
function MatrixCell({
  value,
  max,
  side,
}: {
  value: number | null | undefined;
  max: number;
  side: 'put' | 'call' | 'net';
}) {
  const has = value != null && isFinite(value);
  const v = has ? (value as number) : 0;
  const pct = max > 0 ? Math.min(100, (Math.abs(v) / max) * 100) : 0;
  // Numbers: puts brighter red, calls purple, net by sign. Bars: puts deep brand
  // red, calls purple, net by sign.
  const numColor = side === 'put' ? NEG_RED : side === 'call' ? CALL_PURPLE : v < 0 ? NEG_RED : POS_GREEN;
  const barColor = side === 'put' ? SLAYER_RED : side === 'call' ? CALL_PURPLE : v < 0 ? NEG_RED : POS_GREEN;
  // Heat-map cell: a subtle magnitude-scaled wash of the sign colour (max ~18%),
  // so the matrix reads as an exposure heatmap rather than a wall of numbers.
  const tint = has && pct > 0 ? `color-mix(in srgb, ${barColor} ${Math.round(pct * 0.18)}%, transparent)` : undefined;
  return (
    <div className="relative flex h-5 items-center justify-end px-1 overflow-hidden" style={{ background: tint }}>
      <span className="relative z-10 text-[9.5px] slayer-num font-semibold" style={{ color: has ? numColor : 'var(--text-faint)' }}>
        {fmtMag(has ? v : null)}
      </span>
    </div>
  );
}

/** A brand-toned mini stat cell for the bottom levels panel. */
function LevelCell({
  label,
  value,
  sub,
  tone = 'neutral',
  wrap,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: MetricTone;
  wrap?: boolean;
}) {
  return (
    <div className="min-w-0 px-3 py-2.5 border-b border-r border-[var(--border-subtle)]">
      <div className="text-[9px] uppercase tracking-[0.16em] text-[var(--text-muted)] truncate">{label}</div>
      <div
        className={`mt-1 slayer-num font-semibold leading-tight ${TONE_TEXT[tone]} ${wrap ? 'text-[13px] break-words' : 'text-[15px] truncate'}`}
      >
        {value}
      </div>
      {sub != null && <div className="mt-0.5 text-[10px] text-[var(--text-secondary)] slayer-num truncate">{sub}</div>}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Main view
// ────────────────────────────────────────────────────────────────────────────

export default function PinpointExposureView() {
  const selectedAsset = useContractStore((s) => s.selectedAsset);

  // Gate the streamed server state to the asset currently in view so switching
  // tickers can't briefly paint the previous ticker's dealer data — the exact
  // pattern DealerFlowView uses.
  const rawServerState = useContractStore((s) => s.serverState);
  const serverState = useMemo(() => {
    if (!rawServerState) return null;
    const ticker = rawServerState.contract?.replace('-', ' ').split(' ')[0];
    if (ticker !== selectedAsset.ticker) return null;
    return rawServerState;
  }, [rawServerState, selectedAsset.ticker]);

  const profile: any = serverState?.gex_profile;
  const gauge: any = serverState?.dealer_flow;

  // Real values (guarded — any absent level renders "—").
  const spot: number | undefined = profile?.spot;
  const netGex: number | undefined = profile?.netGex;
  const netDex: number | undefined = profile?.netDex;
  const netVex: number | undefined = profile?.netVex;
  const callWall: number | undefined = profile?.callWall;
  const putWall: number | undefined = profile?.putWall;
  const magnet: number | undefined = profile?.magnet; // pin level
  const emPct: number | undefined = profile?.expectedMovePct; // fraction

  // Live frame-over-frame trend of the net-gamma figure (a real trend of the
  // streamed number, not a fabricated label). Updates only past a 1% threshold
  // so it doesn't flicker on tick noise.
  const prevNetGexRef = useRef<number | null>(null);
  const [netGexTrend, setNetGexTrend] = useState<string>('—');
  useEffect(() => {
    if (netGex == null || !isFinite(netGex)) return;
    const prev = prevNetGexRef.current;
    if (prev != null) {
      const prevMag = Math.abs(prev);
      const curMag = Math.abs(netGex);
      const thresh = Math.max(1e7, prevMag * 0.01);
      if (curMag - prevMag > thresh) setNetGexTrend('Strengthening');
      else if (prevMag - curMag > thresh) setNetGexTrend('Weakening');
      else setNetGexTrend('Stable');
    }
    prevNetGexRef.current = netGex;
  }, [netGex]);

  // Spot session change, referenced to the oldest candle in the streamed window.
  const spotChange = useMemo(() => {
    if (spot == null) return null;
    const candles = serverState?.candles;
    if (!candles || candles.length === 0) return null;
    const ref = candles[0]?.open ?? candles[0]?.close;
    if (ref == null || !isFinite(ref) || ref === 0) return null;
    const abs = spot - ref;
    return { abs, pct: (abs / ref) * 100 };
  }, [spot, serverState?.candles]);

  // Market-control score + gamma regime, derived exactly like DealerFlowView's
  // headerAnalytics (net-gamma sign, pin tightness, expected-move calmness).
  const control = useMemo(() => {
    if (!profile || spot == null || netGex == null) return null;
    const positiveGamma = netGex >= 0;
    const pin = magnet ?? profile.gammaFlip;
    const em = (emPct ?? 0) || 0.01;
    let pinRiskPct: number | null = null;
    if (pin != null && spot) {
      const distFrac = Math.abs(spot - pin) / spot;
      pinRiskPct = Math.max(5, Math.min(95, Math.round(95 - (distFrac / em) * 65)));
    }
    const gammaPts = positiveGamma ? 55 : 25;
    const pinPts = pinRiskPct != null ? (pinRiskPct / 100) * 30 : 15;
    const calmPts = Math.max(0, 15 - Math.min(15, em * 100 * 3));
    const score = Math.max(0, Math.min(100, Math.round(gammaPts + pinPts + calmPts)));
    const word = score >= 66 ? 'Dealer-controlled' : score >= 45 ? 'Neutral' : 'Volatile';
    return { score, word, positiveGamma };
  }, [profile, spot, netGex, magnet, emPct]);

  // Dealer bias (real: LONG GAMMA / SHORT GAMMA) + a descriptor derived from the
  // real signed dealer-pressure index.
  const biasInfo = useMemo(() => {
    const bias: string | undefined = gauge?.bias;
    const pressure: number | undefined = gauge?.pressure;
    let tone: MetricTone = 'neutral';
    if (bias?.includes('SHORT')) tone = 'negative';
    else if (bias?.includes('LONG')) tone = 'positive';
    let sub = '—';
    if (pressure != null && isFinite(pressure)) {
      const mag = Math.abs(pressure);
      const word = mag > 60 ? 'Strongly' : mag > 25 ? 'Moderately' : 'Slightly';
      const dir = pressure > 0 ? 'positive' : pressure < 0 ? 'negative' : 'neutral';
      sub = `${word} ${dir}`;
    }
    return { label: bias ?? '—', tone, sub };
  }, [gauge]);

  // Feed provenance.
  const isLive = !!serverState?.data_source && serverState.data_source !== 'SANDBOX_SYNTHETIC';

  // ── Strike windowing / interval ────────────────────────────────────────────
  const asc = useMemo(() => {
    const s: any[] = profile?.strikes ? [...profile.strikes] : [];
    return s.sort((a, b) => a.strike - b.strike);
  }, [profile]);

  const interval = useMemo(() => {
    if (asc.length < 2) return 0;
    let min = Infinity;
    for (let i = 1; i < asc.length; i++) {
      const d = asc[i].strike - asc[i - 1].strike;
      if (d > 0 && d < min) min = d;
    }
    return isFinite(min) ? min : 0;
  }, [asc]);

  // Net DEX / VEX aggregates — summed from the real per-strike values exactly the
  // way netGex aggregates (prefer the per-strike net field; fall back to call+put).
  // Returns null only when NO strike carries a finite value, so an empty/absent
  // metric honestly shows "—" rather than a fabricated 0.
  const netAgg = useMemo(() => {
    const sumBase = (base: 'Dex' | 'Vex') => {
      if (asc.length === 0) return null;
      let any = false;
      let sum = 0;
      for (const s of asc) {
        const nd = s[`net${base}`];
        let v: number | null = null;
        if (nd != null && isFinite(nd)) v = nd;
        else {
          const c = s[`call${base}`];
          const p = s[`put${base}`];
          if ((c != null && isFinite(c)) || (p != null && isFinite(p))) v = (c || 0) + (p || 0);
        }
        if (v != null) {
          any = true;
          sum += v;
        }
      }
      return any ? sum : null;
    };
    return { dex: sumBase('Dex'), vex: sumBase('Vex') };
  }, [asc]);
  // Prefer the server's top-level aggregate when present; else the per-strike sum.
  const netDexAgg = netDex != null && isFinite(netDex) ? netDex : netAgg.dex;
  const netVexAgg = netVex != null && isFinite(netVex) ? netVex : netAgg.vex;

  const centerIdx = useMemo(() => {
    if (asc.length === 0 || spot == null) return 0;
    let best = 0;
    let bd = Infinity;
    asc.forEach((r, i) => {
      const d = Math.abs(r.strike - spot);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }, [asc, spot]);


  // Matrix window: ±10 strikes around spot.
  const matrixRows = useMemo(() => {
    if (asc.length === 0) return [];
    const lo = Math.max(0, centerIdx - 10);
    const hi = Math.min(asc.length - 1, centerIdx + 10);
    return asc.slice(lo, hi + 1);
  }, [asc, centerIdx]);

  // Per-metric max magnitude across the visible matrix (bar scaling).
  const matrixMax = useMemo(() => {
    const g = (rows: any[], keys: string[]) =>
      Math.max(1, ...rows.flatMap((r) => keys.map((k) => Math.abs(r[k] ?? 0))));
    return {
      gex: g(matrixRows, ['putGex', 'callGex', 'netGex']),
      dex: g(matrixRows, ['putDex', 'callDex', 'netDex']),
      vex: g(matrixRows, ['putVex', 'callVex', 'netVex']),
    };
  }, [matrixRows]);

  // Descending render order (highest strike at top) + a SPOT divider inserted at
  // the spot position.
  const matrixDesc = useMemo(() => [...matrixRows].sort((a, b) => b.strike - a.strike), [matrixRows]);


  // ── Positioning insight bullets (only when their inputs are real) ───────────
  const insights = useMemo(() => {
    const out: string[] = [];
    if (netGex != null) {
      if (netGex < 0) {
        out.push(
          putWall != null && callWall != null
            ? `Net GEX is negative (${fmtBnSigned(netGex)}) — dealers are long gamma below ${fmtLevel(putWall)} and short above ${fmtLevel(callWall)}, so moves get amplified.`
            : `Net GEX is negative (${fmtBnSigned(netGex)}) — dealers are short gamma, so intraday moves get amplified.`
        );
      } else {
        out.push(
          `Net GEX is positive (${fmtBnSigned(netGex)}) — dealers are long gamma, so hedging dampens intraday moves.`
        );
      }
    }
    if (spot != null && putWall != null && callWall != null && spot > putWall && spot < callWall) {
      out.push(`Price sits between ${fmtLevel(putWall)} and ${fmtLevel(callWall)} — inside the friction zone.`);
    }
    if (magnet != null) {
      out.push(`Strongest dealer support at ${fmtLevel(magnet)} (pin level).`);
    }
    if (putWall != null) {
      out.push(`A break under ${fmtLevel(putWall)} shifts dealer pressure lower.`);
    }
    if (callWall != null) {
      // Next strike above the call wall (real chain), if present.
      const above = asc.find((r) => r.strike > callWall);
      out.push(
        above
          ? `A break above ${fmtLevel(callWall)} opens quick supply toward ${fmtLevel(above.strike)}.`
          : `A break above ${fmtLevel(callWall)} opens quick supply higher.`
      );
    }
    return out;
  }, [netGex, spot, putWall, callWall, magnet, asc]);

  // ── CSV export of the visible matrix (real download) ────────────────────────
  const exportCsv = () => {
    const header = [
      'strike',
      'putGex',
      'callGex',
      'netGex',
      'putDex',
      'callDex',
      'netDex',
      'putVex',
      'callVex',
      'netVex',
    ];
    const num = (v: any) => (v == null || !isFinite(v) ? '' : String(v));
    const lines = [header.join(',')];
    for (const r of matrixDesc) {
      lines.push(
        [
          r.strike,
          num(r.putGex),
          num(r.callGex),
          num(r.netGex),
          num(r.putDex),
          num(r.callDex),
          num(r.netDex),
          num(r.putVex),
          num(r.callVex),
          num(r.netVex),
        ].join(',')
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedAsset.ticker}_exposure_matrix.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const nowLabel = useMemo(
    () => new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [serverState]
  );

  // The server ships ONE aggregated chain across all dates — there is nothing to
  // select, so render the expiry as an honest read-only label instead of a
  // dropdown that implies per-expiry filtering it can't perform.
  const expiry = useMemo(() => {
    if (profile?.expiryDate) {
      return profile.expiryLabel ? `${profile.expiryDate} · ${profile.expiryLabel}` : String(profile.expiryDate);
    }
    return `${selectedAsset.ticker} PIPELINE`;
  }, [selectedAsset.ticker, profile?.expiryDate, profile?.expiryLabel]);

  // Shared read-only chain descriptor rendered in each panel's actions slot.
  const panelActions = (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Expiry</span>
      <span className="slayer-control slayer-num cursor-default select-none">{expiry} · All Dates</span>
    </div>
  );

  // ── Honest pending state (mirrors DealerFlowView) ───────────────────────────
  if (!serverState || !profile || !profile.strikes || profile.strikes.length === 0) {
    return (
      <div
        className="slayer-panel w-full p-6 space-y-5"
        id="pinpoint-data-pending"
        role="status"
        aria-busy="true"
        aria-label="Loading pinpoint exposure data"
      >
        <div className="flex flex-col items-center justify-center text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-[var(--bg-panel-soft)] border border-[var(--border-subtle)] flex items-center justify-center">
            <Waves className="w-6 h-6 text-[var(--pin)]" />
          </div>
          <div className="space-y-1.5">
            <h2 className="slayer-title">LOADING PINPOINT EXPOSURE</h2>
            <p className="text-[11px] text-[var(--text-muted)] tracking-wide leading-relaxed max-w-sm mx-auto">
              Loading dealer inventory &amp; sensitivity by strike. Select any strike or option type to start the feed.
            </p>
          </div>
          <div className="flex items-center gap-2 justify-center">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--warning)] inline-block animate-pulse" />
            <span className="text-[9px] slayer-num tracking-[0.16em] text-[var(--text-muted)] font-semibold uppercase">
              AWAITING FIRST DATA FRAME...
            </span>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {['Exposure Matrix', 'Dealer Positioning Map'].map((label) => (
            <div key={label} className="slayer-panel p-4 space-y-2">
              <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">{label}</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-9 rounded bg-[var(--bg-panel-soft)] animate-pulse" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const loStrike = matrixRows[0]?.strike;
  const hiStrike = matrixRows[matrixRows.length - 1]?.strike;
  const callWallPct = spot != null && callWall != null ? ((callWall - spot) / spot) * 100 : null;
  const putWallPct = spot != null && putWall != null ? ((putWall - spot) / spot) * 100 : null;
  const pinPct = spot != null && magnet != null ? ((magnet - spot) / spot) * 100 : null;
  const emAbs = spot != null && emPct != null ? spot * emPct : null;

  // Friction-zone bounds (pin ↔ spot) — only when they differ.
  const frictionLo = spot != null && magnet != null ? Math.min(spot, magnet) : null;
  const frictionHi = spot != null && magnet != null ? Math.max(spot, magnet) : null;
  const hasFriction = frictionLo != null && frictionHi != null && Math.round(frictionLo) !== Math.round(frictionHi);

  // Top KPI strip — real metrics mapped to fixed brand tones.
  const topMetrics: Metric[] = [
    {
      label: 'Net GEX',
      value: fmtBnSigned(netGex),
      sub: netGexTrend,
      tone: netGex == null ? 'neutral' : netGex < 0 ? 'negative' : 'positive',
    },
    {
      label: 'Spot',
      value: fmtLevel(spot),
      sub: spotChange ? `${spotChange.abs >= 0 ? '+' : ''}${spotChange.abs.toFixed(2)} (${fmtPct(spotChange.pct)})` : '—',
      tone: spotChange ? (spotChange.abs >= 0 ? 'positive' : 'negative') : 'neutral',
    },
    {
      label: 'Call Wall',
      value: fmtLevel(callWall),
      sub: callWallPct != null ? `${callWallPct >= 0 ? '+' : ''}${callWallPct.toFixed(2)}% above` : '—',
      tone: 'call',
    },
    {
      label: 'Put Wall',
      value: fmtLevel(putWall),
      sub: putWallPct != null ? `${putWallPct.toFixed(2)}% below` : '—',
      tone: 'negative',
    },
    { label: 'Pin Level', value: fmtLevel(magnet), sub: pinPct != null ? fmtPct(pinPct) : '—', tone: 'pin' },
    {
      label: 'Expected Move (1D)',
      value: emAbs != null ? `±${emAbs.toFixed(2)}` : '—',
      sub: emPct != null ? `±${(emPct * 100).toFixed(1)}%` : '—',
      tone: 'warning',
    },
    { label: 'Market Control', value: control ? `${control.score}/100` : '—', sub: control?.word ?? '—', tone: 'neutral' },
    { label: 'Dealer Bias', value: biasInfo.label, sub: biasInfo.sub, tone: biasInfo.tone },
  ];

  const rowTint = (isPin: boolean, isCall: boolean, isPut: boolean): string | undefined =>
    isPin ? 'rgba(44,104,123,0.16)' : isCall ? 'rgba(121,44,162,0.14)' : isPut ? 'rgba(152,4,4,0.16)' : undefined;

  return (
    <div className="slayer-terminal w-full font-mono space-y-3 p-0.5" id="pinpoint-exposure-view">
      {/* ─────────────── 1. TOP KPI STRIP ─────────────── */}
      <MetricStrip metrics={topMetrics} />

      {/* ─────────────── 2. MAIN TWO-COLUMN GRID ─────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,48fr)_minmax(0,52fr)] gap-3 items-start">
        {/* LEFT — EXPOSURE MATRIX */}
        <TerminalPanel
          title="Exposure Matrix"
          subtitle="Inventory & sensitivity by strike"
          actions={
            <>
              <StatusBadge tone={isLive ? 'live' : 'neutral'} dot>
                {isLive ? 'Live Chain' : 'Model'}
              </StatusBadge>
              {panelActions}
            </>
          }
          bodyClassName="flex flex-col gap-2"
        >
          <div className="text-[10px] text-[var(--text-muted)] tracking-wide flex flex-wrap gap-x-4 gap-y-0.5">
            <span>GEX: $ per 1% move</span>
            <span>DEX: $ per 1σ spot move</span>
            <span>VEX: $ per 1% vol shift</span>
          </div>

          {/* TABLE — fits without scroll at ≥1280px (xl); scrolls in-container below that. */}
          <div className="overflow-x-auto rounded-md border border-[var(--border-subtle)]">
            <div className="min-w-[500px] xl:min-w-0">
              {/* Group header */}
              <div className="grid grid-cols-[52px_repeat(9,minmax(0,1fr))] items-end border-b border-[var(--border-subtle)] text-[9px] font-semibold uppercase tracking-[0.13em] text-[var(--text-muted)]">
                <div className="px-1 py-1.5">Strike</div>
                <div className="col-span-3 text-center py-1.5 border-l border-[var(--border-subtle)] text-[var(--call)]">GEX 1%</div>
                <div className="col-span-3 text-center py-1.5 border-l border-[var(--border-subtle)] text-[var(--pin)]">DEX 1σ</div>
                <div className="col-span-3 text-center py-1.5 border-l border-[var(--border-subtle)] text-[var(--warning)]">VEX 1%v</div>
              </div>
              {/* Sub header */}
              <div className="grid grid-cols-[52px_repeat(9,minmax(0,1fr))] border-b border-[var(--border-subtle)] text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--text-faint)]">
                <div className="px-1 py-1" />
                {(['gex', 'dex', 'vex'] as const).map((g) => (
                  <div key={g} className="col-span-3 grid grid-cols-3 border-l border-[var(--border-subtle)]">
                    <div className="text-right px-1 py-1 text-[#d94646]/80">Put</div>
                    <div className="text-right px-1 py-1 text-[var(--call)]/90">Call</div>
                    <div className="text-right px-1 py-1">Net</div>
                  </div>
                ))}
              </div>

              {/* Rows (descending) with SPOT divider inserted */}
              {matrixDesc.map((r, i) => {
                const prev = matrixDesc[i - 1];
                // Insert the SPOT divider when we cross spot going down.
                const showSpotDivider =
                  spot != null &&
                  ((i === 0 && r.strike < spot) ||
                    (prev != null && prev.strike >= spot && r.strike < spot));
                const isPin = magnet != null && Math.abs(r.strike - magnet) < 1e-6;
                const isCallWall = callWall != null && Math.abs(r.strike - callWall) < 1e-6;
                const isPutWall = putWall != null && Math.abs(r.strike - putWall) < 1e-6;

                return (
                  <div key={r.strike}>
                    {showSpotDivider && (
                      <div
                        className="grid grid-cols-[52px_repeat(9,minmax(0,1fr))] border-y border-[var(--border-mid)]"
                        style={{ background: 'rgba(248,248,255,0.06)' }}
                      >
                        <div className="px-1 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--text-primary)]">
                          Spot
                        </div>
                        <div className="col-span-9 flex items-center px-1.5 py-1 text-[10px] slayer-num font-bold text-[var(--text-primary)]">
                          {fmtLevel(spot)}
                        </div>
                      </div>
                    )}
                    <div
                      className="grid grid-cols-[52px_repeat(9,minmax(0,1fr))] border-b border-[var(--border-subtle)] items-center"
                      style={{ background: rowTint(isPin, isCallWall, isPutWall) }}
                    >
                      <div className="px-1 py-0.5 flex items-center gap-0.5 min-w-0 overflow-hidden">
                        <span className="text-[9.5px] slayer-num font-bold text-[var(--text-secondary)]">
                          {fmtLevel(r.strike)}
                        </span>
                        {isPin && <span className="text-[6.5px] font-bold text-[var(--pin)] tracking-wide">PIN</span>}
                        {isCallWall && <span className="text-[6.5px] font-bold text-[var(--call)] tracking-wide">CW</span>}
                        {isPutWall && <span className="text-[6.5px] font-bold text-[#d94646] tracking-wide">PW</span>}
                      </div>
                      {/* GEX */}
                      <div className="col-span-3 grid grid-cols-3 border-l border-[var(--border-subtle)]">
                        <MatrixCell value={r.putGex} max={matrixMax.gex} side="put" />
                        <MatrixCell value={r.callGex} max={matrixMax.gex} side="call" />
                        <MatrixCell value={r.netGex} max={matrixMax.gex} side="net" />
                      </div>
                      {/* DEX */}
                      <div className="col-span-3 grid grid-cols-3 border-l border-[var(--border-subtle)]">
                        <MatrixCell value={r.putDex} max={matrixMax.dex} side="put" />
                        <MatrixCell value={r.callDex} max={matrixMax.dex} side="call" />
                        <MatrixCell value={r.netDex} max={matrixMax.dex} side="net" />
                      </div>
                      {/* VEX */}
                      <div className="col-span-3 grid grid-cols-3 border-l border-[var(--border-subtle)]">
                        <MatrixCell value={r.putVex} max={matrixMax.vex} side="put" />
                        <MatrixCell value={r.callVex} max={matrixMax.vex} side="call" />
                        <MatrixCell value={r.netVex} max={matrixMax.vex} side="net" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-[9px] text-[var(--text-muted)] tracking-wide truncate">
              Showing strikes {fmtLevel(loStrike)}–{fmtLevel(hiStrike)} · Interval: {interval || '—'} · Expiry: {expiry} · Dates: All Dates
            </span>
            <button
              type="button"
              onClick={exportCsv}
              aria-label="Export matrix as CSV"
              className="shrink-0 flex items-center justify-center p-1.5 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[#050505] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-mid)] transition-colors cursor-pointer focus:outline-none focus-visible:border-[var(--border-strong)]"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </TerminalPanel>

        {/* RIGHT — DEALER POSITIONING MAP (static SVG — matches the render, no live jitter) */}
        <DealerPositioningMap
          rows={matrixDesc.map((r) => ({ strike: r.strike, value: r.netGex ?? 0 }))}
          spot={spot ?? undefined}
          callWall={callWall ?? undefined}
          putWall={putWall ?? undefined}
          pinLevel={magnet ?? undefined}
          actions={panelActions}
          footer={
            hasFriction ? (
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--warning)]">
                Friction Zone {fmtLevel(frictionLo)}–{fmtLevel(frictionHi)}
              </span>
            ) : undefined
          }
        />
      </div>

      {/* ─────────────── 3. AGGREGATE NET EXPOSURE ─────────────── */}
      {/* The three net-greek totals side by side. Level/wall/bias figures live in
          the top KPI strip — not duplicated here. */}
      <TerminalPanel title="Aggregate Net Exposure" subtitle="Net dealer greeks across the visible chain">
        <div className="grid grid-cols-1 sm:grid-cols-3 overflow-hidden rounded-md border-t border-l border-[var(--border-subtle)] bg-[var(--bg-panel)]">
          <LevelCell label="Net GEX" value={fmtBnSigned(netGex)} sub={netGexTrend} tone={netGex == null ? 'neutral' : netGex < 0 ? 'negative' : 'positive'} />
          <LevelCell label="Net DEX" value={fmtCompact(netDexAgg, true)} sub={netDexAgg == null ? '—' : netDexAgg < 0 ? 'Downside tilt' : 'Upside tilt'} tone={netDexAgg == null ? 'neutral' : netDexAgg < 0 ? 'negative' : 'positive'} />
          <LevelCell label="Net VEX" value={fmtCompact(netVexAgg, true)} sub={netVexAgg == null ? '—' : netVexAgg < 0 ? 'Short vega' : 'Long vega'} tone={netVexAgg == null ? 'neutral' : netVexAgg < 0 ? 'negative' : 'positive'} />
        </div>
      </TerminalPanel>

      {/* POSITIONING INSIGHT */}
      <InsightPanel title="Positioning Insight" insights={insights} />

      {/* ─────────────── 4. FOOTER ─────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-1 pt-1 text-[9px] text-[var(--text-muted)] tracking-wide">
        <span>Disclaimer: For informational purposes only. Not investment advice.</span>
        <span>Data as of {nowLabel}</span>
        <span className="font-bold tracking-[0.16em] text-[var(--text-secondary)]">REAL-SLAYER</span>
      </div>
    </div>
  );
}
