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
 */

import { useMemo, useRef, useState, useEffect } from 'react';
import { useContractStore } from '../lib/store';
import EChart from './ui/EChart';
import { DataStateBadge } from './ui/DataStateBadge';
import { PanelSkeleton } from './PanelSkeleton';
import { Info, Download, Waves } from 'lucide-react';

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

const V = {
  danger: 'var(--danger)',
  info: 'var(--info)',
  success: 'var(--success)',
  warning: 'var(--warning)',
} as const;

// Resolve a CSS custom property to its computed hex (for the canvas chart, which
// can't read var()). Falls back to the Slayer-dark defaults.
function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

// ────────────────────────────────────────────────────────────────────────────
// Small presentational atoms
// ────────────────────────────────────────────────────────────────────────────

function KpiCell({
  label,
  value,
  valueColor,
  valueClassName,
  sub,
  subColor,
  first,
}: {
  label: string;
  value: string;
  valueColor?: string;
  valueClassName?: string;
  sub?: React.ReactNode;
  subColor?: string;
  first?: boolean;
}) {
  return (
    <div className={`px-3 py-2.5 min-w-0 ${first ? '' : 'border-l'} border-[var(--border)]`}>
      <div className="text-[8px] font-black uppercase tracking-widest text-[var(--text-tertiary)] truncate">
        {label}
      </div>
      <div
        className={`mt-1 font-mono font-bold tabular-nums leading-none ${valueClassName ?? 'text-[16px] sm:text-[18px] truncate'}`}
        style={{ color: valueColor ?? 'var(--text-primary)' }}
      >
        {value}
      </div>
      {sub != null && (
        <div
          className="mt-1 text-[9px] font-mono font-semibold tabular-nums truncate"
          style={{ color: subColor ?? 'var(--text-tertiary)' }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

/** A styled native <select> matching the terminal's select chrome. */
function TerminalSelect({
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
      <span className="text-[8px] font-black uppercase tracking-widest text-[var(--text-tertiary)]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-[var(--surface-3)] border border-[var(--border-strong)] rounded-md px-2 py-1 text-[10px] font-mono font-bold text-[var(--text-primary)] tracking-wide hover:border-[var(--accent-color)]/50 focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] cursor-pointer"
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
  // Colour: puts red, calls blue, net by sign.
  const color =
    side === 'put'
      ? V.danger
      : side === 'call'
        ? V.info
        : v < 0
          ? V.danger
          : V.info;
  return (
    <div className="relative h-5 flex items-center justify-end px-1 overflow-hidden">
      <span className="relative z-10 text-[9.5px] font-mono tabular-nums font-semibold" style={{ color: has ? color : 'var(--text-tertiary)' }}>
        {fmtMag(has ? v : null)}
      </span>
      {/* Thin proportional underline (sign encoded by colour, not a side bar). */}
      <span
        className="absolute bottom-[1px] right-0 h-[2px] rounded-full pointer-events-none"
        style={{ width: `${pct}%`, background: color, opacity: 0.75 }}
        aria-hidden="true"
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Main view
// ────────────────────────────────────────────────────────────────────────────

export default function PinpointExposureView() {
  const selectedAsset = useContractStore((s) => s.selectedAsset);
  const themeMode = useContractStore((s) => s.themeMode);

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
    let color = 'var(--text-primary)';
    if (bias?.includes('SHORT')) color = V.danger;
    else if (bias?.includes('LONG')) color = V.success;
    let sub = '—';
    if (pressure != null && isFinite(pressure)) {
      const mag = Math.abs(pressure);
      const word = mag > 60 ? 'Strongly' : mag > 25 ? 'Moderately' : 'Slightly';
      const dir = pressure > 0 ? 'positive' : pressure < 0 ? 'negative' : 'neutral';
      sub = `${word} ${dir}`;
    }
    return { label: bias ?? '—', color, sub };
  }, [gauge]);

  // Feed provenance.
  const isLive = !!serverState?.data_source && serverState.data_source !== 'SANDBOX_SYNTHETIC';
  const feedState: 'live' | 'model' = isLive ? 'live' : 'model';

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

  const nearestIdx = (level: number | undefined) => {
    if (level == null || asc.length === 0) return -1;
    let best = -1;
    let bd = Infinity;
    asc.forEach((r, i) => {
      const d = Math.abs(r.strike - level);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  };

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

  // ── Positioning-map chart window (wider; includes walls/pin) ────────────────
  const chartRows = useMemo(() => {
    if (asc.length === 0) return [];
    let lo = Math.max(0, centerIdx - 20);
    let hi = Math.min(asc.length - 1, centerIdx + 20);
    for (const lvl of [callWall, putWall, magnet]) {
      const i = nearestIdx(lvl);
      if (i >= 0) {
        lo = Math.min(lo, i);
        hi = Math.max(hi, i);
      }
    }
    return asc.slice(lo, hi + 1);
  }, [asc, centerIdx, callWall, putWall, magnet]);

  // ── ECharts option (diverging horizontal net-dealer-pressure bars) ──────────
  const chartOption = useMemo(() => {
    if (chartRows.length === 0) return null;
    // themeMode referenced so the memo recomputes (and re-reads tokens) on toggle.
    void themeMode;
    const danger = cssVar('--danger', '#F87171');
    const info = cssVar('--info', '#60A5FA');
    const success = cssVar('--success', '#4ADE80');
    const textPrimary = cssVar('--text-primary', '#E5E5E5');
    const textTertiary = cssVar('--text-tertiary', '#A3A3A3');
    const border = cssVar('--border-strong', 'rgba(255,255,255,0.18)');

    const cats = chartRows.map((r) => String(r.strike)); // ascending → highest at top
    const values = chartRows.map((r) => r.netGex ?? 0);
    const maxAbs = Math.max(1, ...values.map((v) => Math.abs(v)));

    const fmtAxis = (v: number) => {
      const a = Math.abs(v);
      const s = v < 0 ? '-' : '';
      if (a >= 1e9) return `${s}${(a / 1e9).toFixed(1)}B`;
      if (a >= 1e6) return `${s}${(a / 1e6).toFixed(0)}M`;
      if (a >= 1e3) return `${s}${(a / 1e3).toFixed(0)}K`;
      return `${s}${a.toFixed(0)}`;
    };

    const nearestCat = (lvl: number | undefined) => {
      if (lvl == null) return null;
      let best: string | null = null;
      let bd = Infinity;
      chartRows.forEach((r) => {
        const d = Math.abs(r.strike - lvl);
        if (d < bd) {
          bd = d;
          best = String(r.strike);
        }
      });
      return best;
    };

    // Merge reference levels that snap to the SAME strike row into one combined
    // label (e.g. pin == callWall → "CW·PIN 5,500"), shorten the codes, and
    // stagger labels top/bottom by row order so they never collide.
    type MLDef = { lvl: number | undefined; short: string; color: string; dash: number[] | 'solid' };
    const levelDefs: MLDef[] = [
      { lvl: spot, short: 'SPOT', color: textPrimary, dash: 'solid' },
      { lvl: putWall, short: 'PW', color: danger, dash: [5, 4] },
      { lvl: callWall, short: 'CW', color: success, dash: [5, 4] },
      { lvl: magnet, short: 'PIN', color: info, dash: [2, 3] },
    ];
    const merged = new Map<string, { parts: string[]; color: string; dash: number[] | 'solid' }>();
    for (const d of levelDefs) {
      if (d.lvl == null) continue;
      const cat = nearestCat(d.lvl);
      if (cat == null) continue;
      const ex = merged.get(cat);
      if (ex) ex.parts.push(d.short);
      else merged.set(cat, { parts: [d.short], color: d.color, dash: d.dash });
    }
    const catIndex = (cat: string) => cats.indexOf(cat);
    const markLineData: any[] = Array.from(merged.entries())
      .sort((a, b) => catIndex(a[0]) - catIndex(b[0]))
      .map(([cat, info], i) => ({
        yAxis: cat,
        lineStyle: { color: info.color, type: info.dash, width: 1.2, opacity: 0.9 },
        label: {
          formatter: `${info.parts.join('·')} ${fmtLevel(Number(cat))}`,
          color: info.color,
          fontSize: 9,
          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          fontWeight: 700,
          // Right-aligned; alternate top/bottom of the line so adjacent rows don't overlap.
          position: i % 2 === 0 ? 'insideEndTop' : 'insideEndBottom',
          backgroundColor: 'rgba(0,0,0,0.6)',
          padding: [2, 4],
          borderRadius: 2,
        },
      }));

    return {
      grid: { top: 16, right: 22, bottom: 34, left: 64 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          const p = Array.isArray(params) ? params[0] : params;
          const v = p?.value ?? 0;
          return `<span style="font-family:JetBrains Mono,monospace;font-size:11px">STRIKE ${p?.name}<br/>Net pressure <b style="color:${v < 0 ? danger : info}">${v < 0 ? '' : '+'}${fmtAxis(v)}</b></span>`;
        },
      },
      xAxis: {
        type: 'value',
        min: -maxAbs * 1.08,
        max: maxAbs * 1.08,
        name: 'NET DEALER PRESSURE (Σγ, $ / 1% MOVE)',
        nameLocation: 'middle',
        nameGap: 22,
        nameTextStyle: { color: textTertiary, fontSize: 9, fontWeight: 700 },
        axisLabel: { formatter: (v: number) => fmtAxis(v), fontSize: 9 },
        splitLine: { show: true, lineStyle: { color: 'rgba(255,255,255,0.05)' } },
      },
      yAxis: {
        type: 'category',
        data: cats,
        axisLabel: { fontSize: 9, color: textTertiary },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: border } },
      },
      series: [
        {
          type: 'bar',
          data: values,
          barWidth: '62%',
          itemStyle: {
            borderRadius: 2,
            color: (p: any) => (p.value < 0 ? danger : info),
            opacity: 0.9,
          },
          markLine: {
            silent: true,
            symbol: 'none',
            data: [
              { xAxis: 0, lineStyle: { color: border, type: 'solid', width: 1 }, label: { show: false } },
              ...markLineData,
            ],
          },
        },
      ],
    };
  }, [chartRows, spot, callWall, putWall, magnet, themeMode]);

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

  // Expiry / date select state (reflects the real aggregated-chain reality; the
  // server ships one aggregated chain across all dates — no fabricated per-expiry).
  const expiryOptions = useMemo(() => {
    const opts: string[] = [`${selectedAsset.ticker} PIPELINE`];
    if (profile?.expiryDate) {
      opts.unshift(profile.expiryLabel ? `${profile.expiryDate} · ${profile.expiryLabel}` : String(profile.expiryDate));
    }
    return opts;
  }, [selectedAsset.ticker, profile?.expiryDate, profile?.expiryLabel]);
  const [expiry, setExpiry] = useState(expiryOptions[0]);
  useEffect(() => {
    if (!expiryOptions.includes(expiry)) setExpiry(expiryOptions[0]);
  }, [expiryOptions, expiry]);
  const [dateSel, setDateSel] = useState('All Dates');

  // ── Honest pending state (mirrors DealerFlowView) ───────────────────────────
  if (!serverState || !profile || !profile.strikes || profile.strikes.length === 0) {
    return (
      <div
        className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 space-y-5"
        id="pinpoint-data-pending"
        role="status"
        aria-busy="true"
        aria-label="Loading pinpoint exposure data"
      >
        <div className="flex flex-col items-center justify-center text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center">
            <Waves className="w-6 h-6 text-[var(--success)]" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-[11px] font-black tracking-widest text-[var(--text-primary)] uppercase font-sans">
              LOADING PINPOINT EXPOSURE
            </h2>
            <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest leading-relaxed max-w-sm mx-auto">
              Loading dealer inventory & sensitivity by strike. Select any strike or option type to start the feed.
            </p>
          </div>
          <div className="flex items-center gap-2 justify-center">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--warning)] inline-block animate-pulse" />
            <span className="text-[8px] font-mono tracking-widest text-[var(--text-tertiary)] font-bold uppercase">
              AWAITING FIRST DATA FRAME...
            </span>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <PanelSkeleton label="Exposure Matrix" rows={6} />
          <PanelSkeleton label="Dealer Positioning Map" rows={6} />
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

  return (
    <div className="w-full font-mono tabular-data space-y-3" id="pinpoint-exposure-view">
      {/* ─────────────── 1. TOP KPI STRIP ─────────────── */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8">
          <KpiCell
            first
            label="Net GEX"
            value={fmtBnSigned(netGex)}
            valueColor={netGex == null ? undefined : netGex < 0 ? V.danger : V.success}
            sub={netGexTrend}
          />
          <KpiCell
            label="Spot"
            value={fmtLevel(spot)}
            sub={
              spotChange
                ? `${spotChange.abs >= 0 ? '+' : ''}${spotChange.abs.toFixed(2)} (${fmtPct(spotChange.pct)})`
                : '—'
            }
            subColor={spotChange ? (spotChange.abs >= 0 ? V.success : V.danger) : undefined}
          />
          <KpiCell
            label="Call Wall"
            value={fmtLevel(callWall)}
            sub={callWallPct != null ? `${callWallPct >= 0 ? '+' : ''}${callWallPct.toFixed(2)}% above` : '—'}
          />
          <KpiCell
            label="Put Wall"
            value={fmtLevel(putWall)}
            valueColor={putWall == null ? undefined : V.danger}
            sub={putWallPct != null ? `${putWallPct.toFixed(2)}% below` : '—'}
          />
          <KpiCell label="Pin Level" value={fmtLevel(magnet)} sub={pinPct != null ? fmtPct(pinPct) : '—'} />
          <KpiCell
            label="Expected Move (1D)"
            value={emAbs != null ? `±${emAbs.toFixed(2)}` : '—'}
            valueColor={emAbs == null ? undefined : V.warning}
            sub={emPct != null ? `±${(emPct * 100).toFixed(1)}%` : '—'}
          />
          <KpiCell
            label="Market Control"
            value={control ? `${control.score}/100` : '—'}
            sub={control?.word ?? '—'}
          />
          <KpiCell
            label="Dealer Bias"
            value={biasInfo.label}
            valueColor={biasInfo.color}
            valueClassName="text-[12px] sm:text-[13px] whitespace-normal break-words leading-tight"
            sub={biasInfo.sub}
          />
        </div>
      </div>

      {/* ─────────────── 2. MAIN TWO-COLUMN GRID ─────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,48fr)_minmax(0,52fr)] gap-3 items-start">
        {/* LEFT — EXPOSURE MATRIX */}
        <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg flex flex-col min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2 px-3 pt-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="text-[12px] font-black uppercase tracking-widest text-[var(--text-primary)]">
                  Exposure Matrix
                </h2>
                <Info className="w-3 h-3 text-[var(--text-tertiary)]" aria-hidden="true" />
                <DataStateBadge state={feedState} className="ml-1" />
              </div>
              <p className="text-[9px] text-[var(--text-tertiary)] tracking-wide mt-0.5">Inventory &amp; sensitivity by strike</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <TerminalSelect label="Expiry" value={expiry} onChange={setExpiry} options={expiryOptions} />
              <TerminalSelect label="Date" value={dateSel} onChange={setDateSel} options={['All Dates']} />
            </div>
          </div>

          <div className="px-3 mt-2 text-[8.5px] text-[var(--text-tertiary)] tracking-wide flex flex-wrap gap-x-4 gap-y-0.5">
            <span>GEX: $ per 1% move</span>
            <span>DEX: $ per 1σ spot move</span>
            <span>VEX: $ per 1% vol shift</span>
          </div>

          {/* TABLE — fits without scroll at ≥1280px (xl); scrolls in-container below that. */}
          <div className="mt-2 overflow-x-auto">
            <div className="min-w-[500px] xl:min-w-0">
              {/* Group header */}
              <div className="grid grid-cols-[52px_repeat(9,minmax(0,1fr))] items-end border-b border-[var(--border)] text-[8px] font-black uppercase tracking-widest text-[var(--text-tertiary)]">
                <div className="px-1 py-1">Strike</div>
                <div className="col-span-3 text-center py-1 border-l border-[var(--border)] text-[var(--success)]/80">GEX 1%</div>
                <div className="col-span-3 text-center py-1 border-l border-[var(--border)] text-[var(--info)]/80">DEX 1σ</div>
                <div className="col-span-3 text-center py-1 border-l border-[var(--border)] text-[var(--warning)]/80">VEX 1%v</div>
              </div>
              {/* Sub header */}
              <div className="grid grid-cols-[52px_repeat(9,minmax(0,1fr))] border-b border-[var(--border)] text-[8px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                <div className="px-1 py-1" />
                {(['gex', 'dex', 'vex'] as const).map((g) => (
                  <div key={g} className="col-span-3 grid grid-cols-3 border-l border-[var(--border)]">
                    <div className="text-right px-1 py-1 text-[var(--danger)]/70">Put</div>
                    <div className="text-right px-1 py-1 text-[var(--info)]/70">Call</div>
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
                      <div className="grid grid-cols-[52px_repeat(9,minmax(0,1fr))] bg-[var(--accent-color)]/10 border-y border-[var(--accent-color)]/30">
                        <div className="px-1 py-1 text-[8.5px] font-black uppercase tracking-widest text-[var(--accent-color)]">
                          Spot
                        </div>
                        <div className="col-span-9 flex items-center px-1.5 py-1 text-[10px] font-mono font-bold tabular-nums text-[var(--accent-color)]">
                          {fmtLevel(spot)}
                        </div>
                      </div>
                    )}
                    <div
                      className={`grid grid-cols-[52px_repeat(9,minmax(0,1fr))] border-b border-[var(--border)] items-center ${
                        isPin ? 'bg-[var(--info)]/[0.06]' : isCallWall ? 'bg-[var(--success)]/[0.05]' : isPutWall ? 'bg-[var(--danger)]/[0.05]' : ''
                      }`}
                    >
                      <div className="px-1 py-0.5 flex items-center gap-0.5 min-w-0 overflow-hidden">
                        <span className="text-[9.5px] font-mono font-bold tabular-nums text-[var(--text-secondary)]">
                          {fmtLevel(r.strike)}
                        </span>
                        {isPin && <span className="text-[6.5px] font-black text-[var(--info)] tracking-wide">PIN</span>}
                        {isCallWall && <span className="text-[6.5px] font-black text-[var(--success)] tracking-wide">CW</span>}
                        {isPutWall && <span className="text-[6.5px] font-black text-[var(--danger)] tracking-wide">PW</span>}
                      </div>
                      {/* GEX */}
                      <div className="col-span-3 grid grid-cols-3 border-l border-[var(--border)]">
                        <MatrixCell value={r.putGex} max={matrixMax.gex} side="put" />
                        <MatrixCell value={r.callGex} max={matrixMax.gex} side="call" />
                        <MatrixCell value={r.netGex} max={matrixMax.gex} side="net" />
                      </div>
                      {/* DEX */}
                      <div className="col-span-3 grid grid-cols-3 border-l border-[var(--border)]">
                        <MatrixCell value={r.putDex} max={matrixMax.dex} side="put" />
                        <MatrixCell value={r.callDex} max={matrixMax.dex} side="call" />
                        <MatrixCell value={r.netDex} max={matrixMax.dex} side="net" />
                      </div>
                      {/* VEX */}
                      <div className="col-span-3 grid grid-cols-3 border-l border-[var(--border)]">
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
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-[var(--border)] mt-auto">
            <span className="text-[8.5px] text-[var(--text-tertiary)] tracking-wide truncate">
              Showing strikes {fmtLevel(loStrike)}–{fmtLevel(hiStrike)} · Interval: {interval || '—'} · Expiry: {expiry} · Dates: All Dates
            </span>
            <button
              type="button"
              onClick={exportCsv}
              aria-label="Export matrix as CSV"
              className="shrink-0 p-1.5 rounded-md border border-[var(--border-strong)] bg-[var(--surface-3)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-color)]/50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)]"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </section>

        {/* RIGHT — DEALER POSITIONING MAP */}
        <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg flex flex-col min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2 px-3 pt-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="text-[12px] font-black uppercase tracking-widest text-[var(--text-primary)]">
                  Dealer Positioning Map
                </h2>
                <Info className="w-3 h-3 text-[var(--text-tertiary)]" aria-hidden="true" />
              </div>
              <p className="text-[9px] text-[var(--text-tertiary)] tracking-wide mt-0.5">Net dealer pressure by strike</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <TerminalSelect label="Expiry" value={expiry} onChange={setExpiry} options={expiryOptions} />
              <TerminalSelect label="Date" value={dateSel} onChange={setDateSel} options={['All Dates']} />
            </div>
          </div>

          {/* Legend */}
          <div className="px-3 mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[8.5px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-8 h-2 rounded-sm"
                style={{ background: 'linear-gradient(90deg, var(--danger), var(--info))' }}
                aria-hidden="true"
              />
              Net Dealer Pressure
            </span>
            <span className="flex items-center gap-1"><span className="text-[var(--text-primary)]">—</span> Spot</span>
            <span className="flex items-center gap-1"><span className="text-[var(--danger)]">—</span> Put Wall</span>
            <span className="flex items-center gap-1"><span className="text-[var(--info)]">—</span> Pin Level</span>
            <span className="flex items-center gap-1"><span className="text-[var(--success)]">—</span> Call Wall</span>
          </div>

          {hasFriction && (
            <div className="px-3 mt-1 text-[8.5px] font-bold uppercase tracking-widest text-[var(--warning)]/80">
              Friction Zone {fmtLevel(frictionLo)}–{fmtLevel(frictionHi)}
            </div>
          )}

          {/* Chart */}
          <div className="px-1 pt-2" style={{ height: 520 }}>
            {chartOption ? (
              <EChart option={chartOption} notMerge style={{ width: '100%', height: '100%' }} />
            ) : (
              <div className="h-full flex items-center justify-center text-[var(--text-tertiary)] text-[11px] uppercase tracking-widest">
                Awaiting strike data…
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-3 py-2 border-t border-[var(--border)] mt-auto space-y-0.5">
            <div className="text-[8.5px] text-[var(--text-tertiary)] tracking-wide">Positive = Dealer short gamma (upside supply)</div>
            <div className="text-[8.5px] text-[var(--text-tertiary)] tracking-wide">Negative = Dealer long gamma (downside support)</div>
          </div>
        </section>
      </div>

      {/* ─────────────── 3. BOTTOM STRIP ─────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        <BottomCard label="Net GEX" value={fmtBnSigned(netGex)} valueColor={netGex == null ? undefined : netGex < 0 ? V.danger : V.success} sub={netGexTrend} />
        <BottomCard label="Net DEX" value={fmtCompact(netDexAgg, true)} valueColor={netDexAgg == null ? undefined : netDexAgg < 0 ? V.danger : V.info} sub={netDexAgg == null ? '—' : netDexAgg < 0 ? 'Downside tilt' : 'Upside tilt'} />
        <BottomCard label="Net VEX" value={fmtCompact(netVexAgg, true)} valueColor={netVexAgg == null ? undefined : netVexAgg < 0 ? V.danger : V.info} sub={netVexAgg == null ? '—' : netVexAgg < 0 ? 'Short vega' : 'Long vega'} />
        <BottomCard label="Spot" value={fmtLevel(spot)} sub={spotChange ? fmtPct(spotChange.pct) : '—'} subColor={spotChange ? (spotChange.abs >= 0 ? V.success : V.danger) : undefined} />
        <BottomCard label="Put Wall" value={fmtLevel(putWall)} valueColor={putWall == null ? undefined : V.danger} sub={putWallPct != null ? `${putWallPct.toFixed(2)}%` : '—'} />
        <BottomCard label="Pin Level" value={fmtLevel(magnet)} valueColor={magnet == null ? undefined : V.info} sub={pinPct != null ? fmtPct(pinPct) : '—'} />
        <BottomCard label="Call Wall" value={fmtLevel(callWall)} valueColor={callWall == null ? undefined : V.success} sub={callWallPct != null ? `${callWallPct >= 0 ? '+' : ''}${callWallPct.toFixed(2)}%` : '—'} />
        <BottomCard label="Dealer Bias" value={biasInfo.label} valueColor={biasInfo.color} sub={biasInfo.sub} valueClassName="text-[11px] whitespace-normal break-words leading-tight" />
      </div>

      {/* POSITIONING INSIGHT */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">Positioning Insight</span>
          <Info className="w-3 h-3 text-[var(--text-tertiary)]" aria-hidden="true" />
        </div>
        {insights.length > 0 ? (
          <ul className="space-y-1.5">
            {insights.map((t, i) => (
              <li key={i} className="flex items-start gap-2 text-[11px] text-[var(--text-secondary)] leading-relaxed">
                <span className="mt-1 w-1 h-1 rounded-full bg-[var(--accent-color)] shrink-0" aria-hidden="true" />
                <span className="tabular-nums">{t}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest">Awaiting dealer levels…</div>
        )}
      </div>

      {/* ─────────────── 4. FOOTER ─────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-1 pt-1 text-[8.5px] text-[var(--text-tertiary)] tracking-wide">
        <span>Disclaimer: For informational purposes only. Not investment advice.</span>
        <span>Data as of {nowLabel}</span>
        <span className="font-black tracking-widest text-[var(--text-secondary)]">REAL-SLAYER</span>
      </div>
    </div>
  );
}

// Small bottom-strip stat card.
function BottomCard({
  label,
  value,
  valueColor,
  valueClassName,
  sub,
  subColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
  valueClassName?: string;
  sub?: React.ReactNode;
  subColor?: string;
}) {
  return (
    <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-md px-2.5 py-2 min-w-0">
      <div className="text-[8px] font-black uppercase tracking-widest text-[var(--text-tertiary)] truncate">{label}</div>
      <div className={`mt-1 font-mono font-bold tabular-nums leading-none ${valueClassName ?? 'text-[13px] truncate'}`} style={{ color: valueColor ?? 'var(--text-primary)' }}>
        {value}
      </div>
      {sub != null && (
        <div className="mt-0.5 text-[8.5px] font-mono font-semibold tabular-nums truncate" style={{ color: subColor ?? 'var(--text-tertiary)' }}>
          {sub}
        </div>
      )}
    </div>
  );
}
