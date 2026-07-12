/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * CONTRACT DRILLDOWN — a floating per-print overlay for the options-flow tape.
 * Anchored to a single flow print (FlowRow), it expands one line of the tape
 * into a three-panel workbench matching the institutional reference:
 *   (a) CONTRACT FLOW  — contract-ratio split bar + price-history line chart
 *   (b) NET PREMIUM    — net-sentiment split bar + diverging cumulative area
 *   (c) VOL / OI HISTORY — a dense green/red per-session table
 *
 * HONESTY: this is a per-PRINT drilldown, not a live tick history. Every series
 * is MODELED — synthesized DETERMINISTICALLY from the print's real fields via a
 * PRNG seeded on row.id, so a given contract renders identically every time and
 * never flickers. No Math.random in render. Real inputs (ticker, strike, cp,
 * expiry, side, size, premium, type) drive the shape; the rest is illustrative
 * and labelled as such.
 *
 * Self-contained: inline SVG charts, existing CSS vars only, no network.
 * Hallmark · component: contract drilldown overlay · design-system: SLAYER (locked)
 */

import { useCallback, useEffect, useMemo } from 'react';

// ── Local structural row type (NOT imported from OptionsFlowTape — avoids a cycle) ──
type CP = 'C' | 'P' | null;
type Side = 'BUY' | 'SELL';
type FlowType = 'SWEEP' | 'BLOCK' | 'SPLIT' | 'DARKPOOL';
type Sentiment = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface DrilldownRow {
  id: string;
  ts: number;
  ticker: string;
  spot: number;
  expiry: string; // '0DTE' | 'Jul 19' | '—'
  strike: number | null;
  cp: CP;
  side: Side;
  size: number;
  premium: number;
  type: FlowType;
  sentiment: Sentiment;
}

// ── Palette (existing CSS vars only) ────────────────────────────────────────
const C = {
  call: 'var(--call)',            // #5B9DF0 — call blue / ask lean
  pos: 'var(--positive-ink)',     // #34D399 — bullish / net-call premium
  neg: 'var(--negative-ink)',     // #F86A6F — bearish / bid lean / net-put
  pin: 'var(--pin)',              // #E5B94E — premium / walls
  greek: 'var(--greek)',          // #9B7BE0 — strategy chip
  accent: 'var(--accent-color)',  // #26C281 — sparingly: live dot / active
  muted: 'var(--text-muted)',
  grid: 'rgba(255,255,255,0.06)',
  price: 'rgba(230,233,239,0.72)', // light price line overlay
};

// ── Formatting atoms (presentation only) ────────────────────────────────────
const fmtUsd = (v: number): string => {
  const a = Math.abs(v);
  const s = v < 0 ? '-' : '';
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(0)}K`;
  return `${s}$${Math.round(a).toLocaleString('en-US')}`;
};
const fmtInt = (v: number): string => Math.round(v).toLocaleString('en-US');
const fmtPrice = (v: number): string =>
  v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Deterministic PRNG seeded from row.id ───────────────────────────────────
function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Derived, modeled contract shape (all deterministic per row.id) ──────────
interface Modeled {
  ticker: string;
  spot: number;
  strike: number | null;
  cp: CP;
  side: Side;
  contractLabel: string;
  expiryLabel: string;
  dte: number | null;
  spotDeltaPct: number;
  otmPct: number | null;
  avgPrice: number;
  flowScore: number;
  bidPct: number;
  midPct: number;
  askPct: number;
  bidCt: number;
  midCt: number;
  askCt: number;
  iv: number;
  ivChgPct: number;
  strategy: string;
  bearishPct: number;
  bullishPct: number;
  callBought: number;
  callSold: number;
  putBought: number;
  putSold: number;
  ncp: number;
  npp: number;
  netPrem: number;
  vol: number;
  oi: number;
  volOi: number;
  multiPct: number;
  price: number[];
  priceDot: { i: number; bid: number; mid: number; ask: number }[];
  net: number[];
  netPrice: number[];
  history: HistRow[];
}

interface HistRow {
  date: string;
  vol: number;
  oi: number;
  chg: number;
  close: number;
  avg: number;
  spark: number[];
  bidPct: number;
  askPct: number;
  iv: number;
  sweepPct: number;
  multiPct: number;
  totalPrem: number;
  totalPct: number;
}

/** Days from now to a "Mon DD" label (this year, roll to next if already past). */
function dteFromExpiry(expiry: string): number | null {
  if (expiry === '0DTE') return 0;
  if (!expiry || expiry === '—') return null;
  const now = new Date();
  const parsed = new Date(`${expiry} ${now.getFullYear()} 16:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.getTime() < now.getTime()) parsed.setFullYear(now.getFullYear() + 1);
  return Math.max(0, Math.round((parsed.getTime() - now.getTime()) / 86_400_000));
}

const TYPE_CAP: Record<FlowType, string> = {
  SWEEP: 'Sweep',
  BLOCK: 'Block',
  SPLIT: 'Split',
  DARKPOOL: 'Dark Pool',
};

function strategyFor(cp: CP, side: Side, type: FlowType, sent: Sentiment): string {
  const leg = cp === 'C' ? 'Call' : cp === 'P' ? 'Put' : 'Equity';
  if (type === 'SPLIT') return `${sent === 'BULLISH' ? 'Bullish' : sent === 'BEARISH' ? 'Bearish' : 'Neutral'} Split`;
  if (cp == null) return `Dark ${side === 'BUY' ? 'Accum.' : 'Distrib.'}`;
  return `${leg} ${TYPE_CAP[type]}`;
}

function model(row: DrilldownRow): Modeled {
  const rnd = mulberry32(hashStr(row.id));
  const r = () => rnd();
  const between = (lo: number, hi: number) => lo + r() * (hi - lo);

  const { ticker, spot, strike, cp, side, size, premium, type, sentiment } = row;

  const contractLabel =
    strike != null && cp
      ? `${ticker} ${fmtInt(strike)}${cp} ${row.expiry}`
      : `${ticker} ${row.expiry}`;
  const dte = dteFromExpiry(row.expiry);
  const expiryLabel = dte == null ? '—' : dte === 0 ? '0 DTE' : `${dte} DTE`;
  const spotDeltaPct = +(between(-1.2, 1.6)).toFixed(2);

  // %OTM — signed, call/put aware. call ITM below spot; put ITM above spot.
  let otmPct: number | null = null;
  if (strike != null && spot > 0 && cp) {
    otmPct = cp === 'C' ? (strike - spot) / spot : (spot - strike) / spot;
    otmPct = +(otmPct * 100).toFixed(1);
  }

  const avgPrice = Math.max(0.05, premium / (Math.max(1, size) * 100));

  // Flow score 0–100 from premium + size magnitude (log-scaled, saturating).
  const premScore = Math.min(1, Math.log10(Math.max(1, premium)) / 7); // ~$10M ≈ 1
  const sizeScore = Math.min(1, Math.log10(Math.max(1, size)) / 4); // ~10k ≈ 1
  const flowScore = Math.round(Math.min(100, (premScore * 0.62 + sizeScore * 0.38) * 100));

  // Contract ratio — BUY lifts the ask, SELL hits the bid. Mid is the residual.
  const askHeavy = side === 'BUY';
  const dom = between(0.62, 0.9); // dominant lane
  const mid = between(0.02, 0.09);
  let askPct: number, bidPct: number;
  if (askHeavy) {
    askPct = dom;
    bidPct = 1 - dom - mid;
  } else {
    bidPct = dom;
    askPct = 1 - dom - mid;
  }
  const midPct = mid;
  const totalCt = size;
  const askCt = Math.round(totalCt * askPct);
  const midCt = Math.round(totalCt * midPct);
  const bidCt = Math.max(0, totalCt - askCt - midCt);

  const iv = +(between(12, 68)).toFixed(1);
  const ivChgPct = +(between(-4, 6)).toFixed(2);
  const strategy = strategyFor(cp, side, type, sentiment);

  // Net sentiment split — leans with the print's own sentiment.
  const bull =
    sentiment === 'BULLISH' ? between(0.54, 0.7) : sentiment === 'BEARISH' ? between(0.3, 0.46) : between(0.46, 0.54);
  const bullishPct = bull;
  const bearishPct = 1 - bull;

  // Session premium ledger (modeled around this print's premium).
  const base = Math.max(premium * between(80, 220), 4e7);
  const callBought = base * between(0.16, 0.26);
  const callSold = base * between(0.16, 0.26);
  const putBought = base * between(0.1, 0.18);
  const putSold = base * between(0.1, 0.18);
  const ncp = callBought - callSold;
  const npp = putSold - putBought;
  const netPrem = ncp + npp;
  const grossPrem = callBought + callSold + putBought + putSold;

  const vol = Math.max(size, Math.round(size * between(1.2, 4.5)));
  const oi = Math.round(vol * between(1.1, 3.8));
  const volOi = +(vol / Math.max(1, oi)).toFixed(2);
  const multiPct = Math.round(between(20, 95));

  // ── Series: contract price history (random walk about avgPrice) ──
  const N = 56;
  const price: number[] = [];
  let p = avgPrice * between(0.78, 0.9);
  const drift = (avgPrice - p) / N;
  for (let i = 0; i < N; i++) {
    p += drift + (r() - 0.48) * avgPrice * 0.05;
    p = Math.max(0.05, p);
    price.push(p);
  }
  const priceDot: Modeled['priceDot'] = [];
  for (let i = 0; i < N; i += 6) {
    const m = price[i];
    priceDot.push({ i, bid: m * (1 - between(0.01, 0.05)), mid: m, ask: m * (1 + between(0.01, 0.05)) });
  }

  // ── Series: diverging cumulative net premium + underlying price overlay ──
  const M = 78;
  const net: number[] = [];
  const netPrice: number[] = [];
  let cum = 0;
  let px = spot * between(0.995, 1.002);
  const bias = (netPrem / Math.max(1, grossPrem)) * (grossPrem / M) * 1.4;
  for (let i = 0; i < M; i++) {
    cum += bias + (r() - 0.5) * (grossPrem / M) * 0.9;
    net.push(cum);
    px += (r() - 0.5) * spot * 0.0016 + (bias > 0 ? 1 : -1) * spot * 0.00012;
    netPrice.push(px);
  }
  // Rescale so the final cumulative lands on netPrem (keeps it honest to the ledger).
  const last = net[M - 1] || 1;
  const k = netPrem / last;
  for (let i = 0; i < M; i++) net[i] *= k;

  // ── VOL / OI HISTORY rows ──
  const history: HistRow[] = [];
  const day = new Date(row.ts);
  let hoi = oi;
  for (let d = 0; d < 12; d++) {
    // step back one weekday
    do {
      day.setDate(day.getDate() - 1);
    } while (day.getDay() === 0 || day.getDay() === 6);
    const hvol = Math.round(vol * between(0.05, 1.05));
    const chg = +(between(-8, 12)).toFixed(1);
    hoi = Math.max(100, Math.round(hoi * between(0.9, 1.08)));
    const close = +(avgPrice * between(0.6, 1.5)).toFixed(2);
    const avg = +(close * between(0.85, 1.2)).toFixed(2);
    const spark: number[] = [];
    for (let s = 0; s < 13; s++) spark.push(between(0.05, 1));
    const hb = between(0.1, 0.9);
    history.push({
      date: day.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }),
      vol: hvol,
      oi: hoi,
      chg,
      close,
      avg,
      spark,
      bidPct: hb,
      askPct: 1 - hb,
      iv: +(between(8, 22)).toFixed(2),
      sweepPct: Math.round(between(0, 9)),
      multiPct: Math.round(between(50, 99)),
      totalPrem: hvol * close * 100 * between(0.6, 1.4),
      totalPct: +(between(0, 0.3)).toFixed(1),
    });
  }

  return {
    ticker, spot, strike, cp, side, contractLabel, expiryLabel, dte, spotDeltaPct,
    otmPct, avgPrice, flowScore, bidPct, midPct, askPct, bidCt, midCt, askCt, iv, ivChgPct,
    strategy, bearishPct, bullishPct, callBought, callSold, putBought, putSold, ncp, npp,
    netPrem, vol, oi, volOi, multiPct, price, priceDot, net, netPrice, history,
  };
}

// ── Small presentational atoms ──────────────────────────────────────────────
function MicroLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[9px] font-semibold uppercase tracking-[0.13em] text-[var(--text-muted)]">{children}</span>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="flex items-baseline gap-1.5 whitespace-nowrap">
      <MicroLabel>{label}</MicroLabel>
      <span className="slayer-num text-[10.5px] font-semibold" style={{ color: tone ?? 'var(--text-primary)' }}>
        {value}
      </span>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1 whitespace-nowrap">
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      <span className="text-[9px] font-medium text-[var(--text-muted)]">{label}</span>
    </span>
  );
}

/** Three-lane ratio bar (bid | mid | ask), each labelled. */
function RatioBar({
  title, left, leftPct, leftColor, mid, midPct, midColor, right, rightPct, rightColor,
}: {
  title: string;
  left: string; leftPct: number; leftColor: string;
  mid?: string; midPct?: number; midColor?: string;
  right: string; rightPct: number; rightColor: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="slayer-num text-[9.5px] font-semibold" style={{ color: leftColor }}>{left}</span>
        <MicroLabel>{title}</MicroLabel>
        <span className="slayer-num text-[9.5px] font-semibold" style={{ color: rightColor }}>{right}</span>
      </div>
      <div className="mt-1 flex h-[7px] w-full overflow-hidden rounded-[2px]">
        <div style={{ width: `${leftPct * 100}%`, background: leftColor }} />
        {mid != null && <div style={{ width: `${(midPct ?? 0) * 100}%`, background: midColor }} />}
        <div style={{ width: `${rightPct * 100}%`, background: rightColor }} />
      </div>
    </div>
  );
}

// ── Chart: contract price history (line + bid/mid/ask dots + right axis) ─────
function PriceHistoryChart({ m }: { m: Modeled }) {
  const W = 360, H = 168, padR = 40, padB = 16, padT = 10, padL = 6;
  const iw = W - padL - padR, ih = H - padT - padB;
  const series = m.price;
  const min = Math.min(...series) * 0.98;
  const max = Math.max(...series) * 1.02;
  const x = (i: number) => padL + (i / (series.length - 1)) * iw;
  const y = (v: number) => padT + (1 - (v - min) / (max - min || 1)) * ih;
  const linePath = series.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const levels = [max, min + (max - min) * 0.5, min].map((v) => ({ v, py: y(v) }));
  const barI = Math.round(series.length * 0.08); // an early volume spike (echoes the reference)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[168px] w-full" preserveAspectRatio="none">
      {levels.map((lv, i) => (
        <g key={i}>
          <line x1={padL} x2={padL + iw} y1={lv.py} y2={lv.py} stroke={C.grid} strokeWidth={1} />
          <text x={W - padR + 3} y={lv.py + 3} fontSize={8} fill="var(--text-muted)" className="slayer-num">
            ${fmtPrice(lv.v)}
          </text>
        </g>
      ))}
      {/* watermark */}
      <text x={W / 2 - 6} y={H / 2 + 6} fontSize={22} fill="rgba(255,255,255,0.04)" textAnchor="middle" fontWeight={800}>
        REAL·SLAYER
      </text>
      {/* early volume bar */}
      <rect x={x(barI) - 2} y={padT} width={4} height={ih} fill={m.side === 'BUY' ? C.call : C.neg} opacity={0.55} />
      <path d={linePath} fill="none" stroke={C.price} strokeWidth={1.3} />
      {m.priceDot.map((d, i) => (
        <g key={i}>
          <circle cx={x(d.i)} cy={y(d.bid)} r={1.7} fill={C.neg} />
          <circle cx={x(d.i)} cy={y(d.mid)} r={1.9} fill={C.call} />
          <circle cx={x(d.i)} cy={y(d.ask)} r={1.7} fill={C.pos} />
        </g>
      ))}
    </svg>
  );
}

// ── Chart: diverging cumulative net premium (green>0 / red<0) + price line ──
function NetPremiumChart({ m }: { m: Modeled }) {
  const W = 380, H = 168, padR = 44, padB = 14, padT = 10, padL = 6;
  const iw = W - padL - padR, ih = H - padT - padB;
  const net = m.net;
  const amax = Math.max(1, ...net.map((v) => Math.abs(v)));
  const x = (i: number) => padL + (i / (net.length - 1)) * iw;
  const y = (v: number) => padT + (1 - (v + amax) / (2 * amax)) * ih;
  const zeroY = y(0);

  // Split fills: build clipped area paths above/below zero.
  const areaPath = (clampAbove: boolean) => {
    const pts = net.map((v, i) => {
      const cv = clampAbove ? Math.max(0, v) : Math.min(0, v);
      return `${x(i).toFixed(1)},${y(cv).toFixed(1)}`;
    });
    return `M${x(0).toFixed(1)},${zeroY.toFixed(1)} L${pts.join(' L')} L${x(net.length - 1).toFixed(1)},${zeroY.toFixed(1)} Z`;
  };

  // Price overlay on its own axis.
  const pmin = Math.min(...m.netPrice), pmax = Math.max(...m.netPrice);
  const py = (v: number) => padT + (1 - (v - pmin) / (pmax - pmin || 1)) * ih;
  const pricePath = m.netPrice.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
  const priceLevels = [pmax, (pmax + pmin) / 2, pmin];
  const premLevels = [amax, amax / 2, 0, -amax / 2, -amax];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[168px] w-full" preserveAspectRatio="none">
      {premLevels.map((lv, i) => (
        <g key={i}>
          <line x1={padL} x2={padL + iw} y1={y(lv)} y2={y(lv)} stroke={C.grid} strokeWidth={lv === 0 ? 1.2 : 1} />
          <text x={2} y={y(lv) - 2} fontSize={7.5} fill="var(--text-muted)" className="slayer-num">
            {fmtUsd(lv)}
          </text>
        </g>
      ))}
      <text x={W / 2 + 4} y={H / 2 + 6} fontSize={22} fill="rgba(255,255,255,0.04)" textAnchor="middle" fontWeight={800}>
        REAL·SLAYER
      </text>
      <path d={areaPath(true)} fill={C.pos} fillOpacity={0.22} stroke={C.pos} strokeWidth={1} />
      <path d={areaPath(false)} fill={C.neg} fillOpacity={0.22} stroke={C.neg} strokeWidth={1} />
      <path d={pricePath} fill="none" stroke={C.price} strokeWidth={1.2} />
      {priceLevels.map((lv, i) => (
        <text key={i} x={W - padR + 4} y={py(lv) + 3} fontSize={7.5} fill="var(--text-muted)" className="slayer-num">
          ${fmtInt(lv)}
        </text>
      ))}
    </svg>
  );
}

// ── Sparkline for the history table ─────────────────────────────────────────
function Spark({ data, color }: { data: number[]; color: string }) {
  const W = 64, H = 14;
  const max = Math.max(...data) || 1;
  const bw = W / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[14px] w-[64px]">
      {data.map((v, i) => {
        const h = Math.max(1, (v / max) * H);
        return <rect key={i} x={i * bw} y={H - h} width={Math.max(0.6, bw - 0.6)} height={h} fill={color} opacity={0.7} />;
      })}
    </svg>
  );
}

// ── Segmented toggle (visual only — this is a static drilldown) ─────────────
function Seg({ options, active }: { options: string[]; active: string }) {
  return (
    <div className="flex items-center gap-px overflow-hidden rounded-[3px] border border-[var(--border-subtle)]">
      {options.map((o) => (
        <span
          key={o}
          className="px-1.5 py-[3px] text-[9px] font-semibold"
          style={
            o === active
              ? { background: 'color-mix(in srgb, var(--accent-color) 18%, transparent)', color: 'var(--accent-color)' }
              : { color: 'var(--text-muted)' }
          }
        >
          {o}
        </span>
      ))}
    </div>
  );
}

// ── Main overlay ─────────────────────────────────────────────────────────────
export default function ContractDrilldown({ row, onClose }: { row: DrilldownRow | null; onClose: () => void }) {
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );
  useEffect(() => {
    if (!row) return;
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [row, onKey]);

  const m = useMemo(() => (row ? model(row) : null), [row]);
  if (!row || !m) return null;

  const sideColor = m.side === 'BUY' ? C.call : C.neg;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Contract drilldown ${m.contractLabel}`}
      className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6"
    >
      {/* scrim */}
      <button
        aria-label="Close drilldown"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        style={{ background: 'rgba(0,0,0,0.72)' }}
      />

      <div
        className="slayer-panel relative z-10 flex max-h-[92vh] w-full max-w-[1160px] flex-col overflow-hidden"
        style={{ background: 'var(--bg-panel)' }}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <header className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-3 py-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="slayer-title text-[10px]">Contract Drilldown</span>
            <span className="text-[var(--text-muted)]">·</span>
            <span className="slayer-num text-[11px] font-bold" style={{ color: 'var(--text-primary)' }}>
              {m.contractLabel}
            </span>
            <span
              className="rounded-[3px] px-1.5 py-[1px] text-[9px] font-semibold"
              style={{ background: 'color-mix(in srgb, var(--greek) 16%, transparent)', color: C.greek }}
            >
              {m.strategy}
            </span>
            <span className="text-[var(--text-muted)]">·</span>
            <span className="slayer-num text-[10px] text-[var(--text-muted)]">{m.expiryLabel}</span>
            <span className="text-[var(--text-muted)]">·</span>
            <span className="slayer-num text-[10px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              {m.ticker} ${fmtPrice(m.spot)}
            </span>
            <span
              className="slayer-num text-[10px] font-semibold"
              style={{ color: m.spotDeltaPct >= 0 ? C.pos : C.neg }}
            >
              ({m.spotDeltaPct >= 0 ? '+' : ''}{m.spotDeltaPct}%)
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: C.accent }} />
              <MicroLabel>Modeled</MicroLabel>
            </span>
            <button
              aria-label="Close"
              onClick={onClose}
              className="slayer-num flex h-6 w-6 items-center justify-center rounded-[3px] border border-[var(--border-subtle)] text-[13px] leading-none text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              ✕
            </button>
          </div>
        </header>

        {/* ── Body (scrolls vertically) ──────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 gap-px bg-[var(--border-subtle)] lg:grid-cols-2">
            {/* ── (a) CONTRACT FLOW ── */}
            <section className="flex flex-col gap-2.5 bg-[var(--bg-panel)] p-3">
              <div className="flex items-center justify-between">
                <span className="slayer-title text-[10px]">Contract Flow</span>
                <Seg options={['1D', '5min']} active="1D" />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <Stat label="Vol" value={fmtInt(m.vol)} />
                <Stat label="OI" value={fmtInt(m.oi)} />
                <Stat label="Avg" value={`$${fmtPrice(m.avgPrice)}`} tone={C.pin} />
                <Stat label="Prem" value={fmtUsd(row.premium)} tone={C.pin} />
                <Stat label="OTM" value={m.otmPct == null ? '—' : `${m.otmPct}%`} tone={m.otmPct != null && m.otmPct < 0 ? C.pos : undefined} />
                <Stat label="Vol/OI" value={m.volOi.toFixed(2)} />
                <Stat label="Mult" value={`${m.multiPct}%`} />
                <Stat label="Score" value={m.flowScore} tone={C.greek} />
                <Stat label="IV" value={`${m.iv}%`} tone={m.ivChgPct >= 0 ? C.pos : C.neg} />
              </div>
              <RatioBar
                title="Contract Ratio"
                left={`Bid ${Math.round(m.bidPct * 100)}%`} leftPct={m.bidPct} leftColor={C.neg}
                mid="mid" midPct={m.midPct} midColor="var(--text-muted)"
                right={`Ask ${Math.round(m.askPct * 100)}%`} rightPct={m.askPct} rightColor={C.call}
              />
              <div className="flex flex-wrap items-center justify-between gap-y-1">
                <div className="flex items-center gap-2.5">
                  <span className="slayer-num text-[9px]" style={{ color: C.neg }}>Bid {fmtInt(m.bidCt)}</span>
                  <span className="slayer-num text-[9px] text-[var(--text-muted)]">Mid {fmtInt(m.midCt)}</span>
                  <span className="slayer-num text-[9px]" style={{ color: C.call }}>Ask {fmtInt(m.askCt)}</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <MicroLabel>Single-Leg</MicroLabel>
                  <MicroLabel>Avg</MicroLabel>
                  <MicroLabel>IV</MicroLabel>
                  <MicroLabel>#Vol</MicroLabel>
                </div>
              </div>
              <div className="rounded-[3px] border border-[var(--border-subtle)] px-1 py-1">
                <PriceHistoryChart m={m} />
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <LegendDot color={C.neg} label="Bid" />
                <LegendDot color={C.call} label="Mid" />
                <LegendDot color={C.pos} label="Ask" />
                <span className="text-[var(--text-muted)]">·</span>
                <LegendDot color={C.price} label="Single-Leg" />
                <LegendDot color={C.pin} label="IV" />
                <LegendDot color={C.greek} label="#VOL" />
              </div>
            </section>

            {/* ── (b) NET PREMIUM ── */}
            <section className="flex flex-col gap-2.5 bg-[var(--bg-panel)] p-3">
              <div className="flex items-center justify-between">
                <span className="slayer-title text-[10px]">Net Premium</span>
                <div className="flex items-center gap-1.5">
                  <Seg options={['1D']} active="1D" />
                  <Seg options={['Single-Leg']} active="Single-Leg" />
                </div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <Stat label="Vol" value={fmtInt(m.vol * 1000)} />
                <Stat label="Prem" value={fmtUsd(m.callBought + m.callSold + m.putBought + m.putSold)} tone={C.pin} />
                <Stat label="Net" value={fmtUsd(m.netPrem)} tone={m.netPrem >= 0 ? C.pos : C.neg} />
                <Stat label="NCP" value={fmtUsd(m.ncp)} tone={m.ncp >= 0 ? C.pos : C.neg} />
                <Stat label="NPP" value={fmtUsd(m.npp)} tone={m.npp >= 0 ? C.pos : C.neg} />
              </div>
              <RatioBar
                title="Net Sentiment"
                left={`Bearish ${Math.round(m.bearishPct * 100)}%`} leftPct={m.bearishPct} leftColor={C.neg}
                right={`Bullish ${Math.round(m.bullishPct * 100)}%`} rightPct={m.bullishPct} rightColor={C.pos}
              />
              <div className="rounded-[3px] border border-[var(--border-subtle)] px-1 py-1">
                <NetPremiumChart m={m} />
              </div>
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: C.pos }} />
                  <span className="text-[9px] text-[var(--text-muted)]">Call Bought</span>
                  <span className="slayer-num text-[9px]" style={{ color: C.pos }}>{fmtUsd(m.callBought)}</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: C.neg }} />
                  <span className="text-[9px] text-[var(--text-muted)]">Call Sold</span>
                  <span className="slayer-num text-[9px]" style={{ color: C.neg }}>{fmtUsd(m.callSold)}</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: C.call }} />
                  <span className="text-[9px] text-[var(--text-muted)]">Put Bought</span>
                  <span className="slayer-num text-[9px]" style={{ color: C.call }}>{fmtUsd(m.putBought)}</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: C.pin }} />
                  <span className="text-[9px] text-[var(--text-muted)]">Put Sold</span>
                  <span className="slayer-num text-[9px]" style={{ color: C.pin }}>{fmtUsd(m.putSold)}</span>
                </span>
                <span className="text-[var(--text-muted)]">·</span>
                <LegendDot color={C.pos} label="NCP" />
                <LegendDot color={C.neg} label="NPP" />
                <LegendDot color={C.price} label="Price" />
              </div>
            </section>
          </div>

          {/* ── (c) VOL / OI HISTORY ── */}
          <section className="border-t border-[var(--border-subtle)] bg-[var(--bg-panel)]">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="slayer-title text-[10px]">Vol / OI History</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-medium text-[var(--text-muted)]">Flow Orders</span>
                <span
                  className="rounded-[3px] px-1.5 py-[2px] text-[9px] font-semibold"
                  style={{ background: 'color-mix(in srgb, var(--accent-color) 16%, transparent)', color: C.accent }}
                >
                  Vol / OI History
                </span>
              </div>
            </div>
            <div className="max-h-[280px] overflow-auto">
              <table className="slayer-table min-w-[860px]">
                <thead>
                  <tr>
                    {['Date', 'Vol', 'OI', '+/-', 'Close', 'Avg', 'Vol (30min)', 'Bid/Ask', 'IV', 'Sweep', 'Multi', 'Total Prem', '% Total'].map(
                      (h) => (
                        <th key={h} className={h === 'Date' ? 'text-left' : 'text-right'}>
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {m.history.map((h, i) => (
                    <tr key={i}>
                      <td className="slayer-num whitespace-nowrap text-left text-[10px] text-[var(--text-secondary)]">{h.date}</td>
                      <td className="slayer-num text-right text-[10px]">{fmtInt(h.vol)}</td>
                      <td className="slayer-num text-right text-[10px]">{fmtInt(h.oi)}</td>
                      <td className="slayer-num text-right text-[10px]" style={{ color: h.chg >= 0 ? C.pos : C.neg }}>
                        {h.chg >= 0 ? '+' : ''}{h.chg}%
                      </td>
                      <td className="slayer-num text-right text-[10px]">${fmtPrice(h.close)}</td>
                      <td className="slayer-num text-right text-[10px] text-[var(--text-muted)]">${fmtPrice(h.avg)}</td>
                      <td className="text-right">
                        <div className="flex justify-end">
                          <Spark data={h.spark} color={h.chg >= 0 ? C.pos : C.neg} />
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          <span className="slayer-num text-[8.5px]" style={{ color: C.neg }}>{Math.round(h.bidPct * 100)}%</span>
                          <span className="flex h-[6px] w-[54px] overflow-hidden rounded-[2px]">
                            <span style={{ width: `${h.bidPct * 100}%`, background: C.neg }} />
                            <span style={{ width: `${h.askPct * 100}%`, background: C.pos }} />
                          </span>
                          <span className="slayer-num text-[8.5px]" style={{ color: C.pos }}>{Math.round(h.askPct * 100)}%</span>
                        </div>
                      </td>
                      <td className="slayer-num text-right text-[10px] text-[var(--text-muted)]">{h.iv}%</td>
                      <td className="slayer-num text-right text-[10px]">{h.sweepPct}%</td>
                      <td className="slayer-num text-right text-[10px]">{h.multiPct}%</td>
                      <td className="slayer-num text-right text-[10px]" style={{ color: C.pin }}>{fmtUsd(h.totalPrem)}</td>
                      <td className="slayer-num text-right text-[10px] text-[var(--text-muted)]">{h.totalPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-end gap-2 px-3 py-2">
              <span className="text-[9px] text-[var(--text-muted)]">Page 1</span>
              <span className="slayer-num text-[9px] text-[var(--text-muted)]">Next ›</span>
            </div>
          </section>

          {/* ── Honest footnote (once) ── */}
          <div className="border-t border-[var(--border-subtle)] px-3 py-2">
            <p className="text-[9px] leading-relaxed text-[var(--text-muted)]">
              Modeled from print — illustrative. This is a per-print drilldown, not a live tick history. Real fields
              (ticker, strike, C/P, expiry, side, size, premium, type) are shown as-is; all other columns and both charts
              — Vol, OI, IV, Flow Score, Contract Ratio, Net Premium ledger, Vol/OI history and sparklines — are{' '}
              <span className="font-semibold">derived / modeled</span> deterministically from this print and are for
              structural illustration only.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
