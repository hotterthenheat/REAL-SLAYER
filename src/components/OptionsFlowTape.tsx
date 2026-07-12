/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * OPTIONS FLOW SCREENER — the DEALER FLOW tab rebuilt as a Flowseeker-style flow
 * screener: a LEFT FILTERS RAIL (its own vertical scroll) beside a MAIN COLUMN
 * holding a toolbar + a dense, hairline FLOW TABLE. Every row expands into a
 * per-contract drilldown. A slim SESSION PULSE strip tops the view.
 *
 * The live feed is preserved verbatim: the FlowRow model, makeFlow/makeDark, the
 * seeded rows + prepend interval, dark prints, the pulse aggregates, the fmt*
 * atoms and the honest live/paused (reduced-motion) handling. Only the RENDER was
 * replaced — the tape layout became the screener layout.
 *
 * The extra Flowseeker columns (%OTM, DTE, Bid/Ask/Spread, Flow Score, Contract
 * Ratio, Vol, OI, IV, IV%, Strategy) are DERIVED DETERMINISTICALLY from the real
 * FlowRow fields — a stable per-id hash, never Math.random in render — so they
 * never flicker. They are labelled "derived / modeled" once, in the footer.
 *
 * Fully self-contained: no props, no network. Stream freezes under
 * prefers-reduced-motion. Nothing is fabricated at module scope.
 *
 * Hallmark · component: dealer-flow screener · design-system: SLAYER (locked)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import FlowFilters, {
  DEFAULT_FLOW_FILTERS,
  type FlowFilterState,
} from './flow/FlowFilters';
import ContractDrilldown from './flow/ContractDrilldown';

// ── Domain types ────────────────────────────────────────────────────────────
type FlowType = 'SWEEP' | 'BLOCK' | 'SPLIT' | 'DARKPOOL';
type Sentiment = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
type Side = 'BUY' | 'SELL';
type CP = 'C' | 'P' | null;

interface FlowRow {
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

interface DarkPrint {
  id: string;
  ts: number;
  ticker: string;
  size: number;
  price: number;
  notional: number;
}

// ── Fixed ticker universe (plausible spots) ─────────────────────────────────
const UNIVERSE: { ticker: string; spot: number }[] = [
  { ticker: 'SPX', spot: 5990 },
  { ticker: 'SPY', spot: 598 },
  { ticker: 'QQQ', spot: 521 },
  { ticker: 'NVDA', spot: 178 },
  { ticker: 'TSLA', spot: 250 },
  { ticker: 'AAPL', spot: 232 },
  { ticker: 'AMZN', spot: 205 },
  { ticker: 'META', spot: 720 },
  { ticker: 'MSFT', spot: 470 },
  { ticker: 'AMD', spot: 168 },
];

// ── Formatting atoms (presentation only) ────────────────────────────────────
const fmtUsd = (v: number): string => {
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${Math.round(v).toLocaleString('en-US')}`;
};
const fmtInt = (v: number): string => Math.round(v).toLocaleString('en-US');
const fmtPrice = (v: number): string =>
  v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtET = (ts: number): string =>
  new Date(ts).toLocaleTimeString('en-US', {
    hour12: false,
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

// ── Synthesis helpers (random only fires when invoked in render/effect) ─────
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

const strikeStep = (spot: number): number =>
  spot >= 3000 ? 25 : spot >= 1000 ? 10 : spot >= 400 ? 5 : spot >= 150 ? 2.5 : 1;

/** Upcoming Friday labels (e.g. "Jul 19") — computed in-render, never at module scope. */
function buildExpiries(): string[] {
  const out: string[] = [];
  const day = new Date();
  const add = (5 - day.getDay() + 7) % 7;
  day.setDate(day.getDate() + (add === 0 ? 7 : add)); // next Friday, not today
  for (let i = 0; i < 6; i++) {
    out.push(day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    day.setDate(day.getDate() + 7);
  }
  return out;
}

const weightedType = (): FlowType => {
  const r = Math.random();
  if (r < 0.5) return 'SWEEP';
  if (r < 0.72) return 'SPLIT';
  if (r < 0.92) return 'BLOCK';
  return 'DARKPOOL';
};

const sentimentFor = (cp: CP, side: Side): Sentiment => {
  if (cp == null) return 'NEUTRAL';
  if (Math.random() < 0.08) return 'NEUTRAL'; // mid-market / complex
  const bull = (cp === 'C' && side === 'BUY') || (cp === 'P' && side === 'SELL');
  return bull ? 'BULLISH' : 'BEARISH';
};

let __seq = 0;
const nextId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${(__seq++).toString(36)}`;

function makeFlow(expiries: string[], tsOverride?: number): FlowRow {
  const u = pick(UNIVERSE);
  const spot = +(u.spot * (1 + (Math.random() - 0.5) * 0.004)).toFixed(2);
  const type = weightedType();
  const side: Side = Math.random() < 0.6 ? 'BUY' : 'SELL'; // lifts at the ask lean

  if (type === 'DARKPOOL') {
    // Equity block crossed off-exchange — no strike / expiry.
    const size = Math.round((5000 + Math.pow(Math.random(), 2.2) * 240000) / 100) * 100;
    const notional = size * spot;
    return {
      id: nextId('f'),
      ts: tsOverride ?? Date.now(),
      ticker: u.ticker,
      spot,
      expiry: '—',
      strike: null,
      cp: null,
      side,
      size,
      premium: notional,
      type,
      sentiment: 'NEUTRAL',
    };
  }

  const cp: CP = Math.random() < 0.55 ? 'C' : 'P';
  const step = strikeStep(spot);
  const strike = Math.round((spot + (Math.random() - 0.5) * spot * 0.04) / step) * step;
  const expiry = Math.random() < 0.45 ? '0DTE' : pick(expiries);
  const size = Math.round((100 + Math.pow(Math.random(), 2.4) * 6000) / 10) * 10;
  const optPrice = Math.max(0.05, spot * (0.004 + Math.random() * 0.02));
  const premium = size * optPrice * 100;

  return {
    id: nextId('f'),
    ts: tsOverride ?? Date.now(),
    ticker: u.ticker,
    spot,
    expiry,
    strike,
    cp,
    side,
    size,
    premium,
    type,
    sentiment: sentimentFor(cp, side),
  };
}

function makeDark(tsOverride?: number): DarkPrint {
  const u = pick(UNIVERSE);
  const price = +(u.spot * (1 + (Math.random() - 0.5) * 0.003)).toFixed(2);
  const size = Math.round((8000 + Math.pow(Math.random(), 2) * 400000) / 100) * 100;
  return {
    id: nextId('d'),
    ts: tsOverride ?? Date.now(),
    ticker: u.ticker,
    size,
    price,
    notional: size * price,
  };
}

// ── Deterministic per-row derivation (no Math.random in render) ─────────────
// A stable hash of the print id seeds every synthesized column, so a given
// print renders the same modeled Bid/Ask/IV/Vol/OI on every frame.
function hashId(id: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** DTE from the expiry label: '0DTE'→0, '—'→null, 'Jul 19'→days to that date. */
function parseDTE(expiry: string, nowMs: number): number | null {
  if (expiry === '0DTE') return 0;
  if (expiry === '—' || !expiry) return null;
  const [mon, dayStr] = expiry.split(' ');
  const mi = MONTHS.indexOf(mon);
  if (mi < 0) return null;
  const now = new Date(nowMs);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let target = new Date(now.getFullYear(), mi, Number(dayStr));
  if (target.getTime() < today.getTime() - 2 * 86400000) {
    target = new Date(now.getFullYear() + 1, mi, Number(dayStr));
  }
  return Math.max(0, Math.round((target.getTime() - today.getTime()) / 86400000));
}

interface Derived {
  otm: number | null; // signed fraction; positive = OTM, negative = ITM
  dte: number | null;
  bid: number | null;
  ask: number | null;
  spread: number | null;
  avg: number | null; // mid / avg contract price
  flowScore: number; // 0..100
  askPct: number; // contract ratio — buy-side share
  bidPct: number; // sell-side share
  vol: number;
  oi: number;
  volOi: number;
  iv: number; // implied vol %
  ivPct: number; // IV rank / percentile 0..100
  strategy: string;
}

function strategyLabel(r: FlowRow): string {
  if (r.type === 'DARKPOOL') return 'Dark Pool';
  const base = r.cp === 'C' ? 'Call' : r.cp === 'P' ? 'Put' : '';
  if (r.type === 'SWEEP') return `${base} Sweep`.trim();
  if (r.type === 'BLOCK') return `${base} Block`.trim();
  const dir = r.sentiment === 'BULLISH' ? 'Bullish' : r.sentiment === 'BEARISH' ? 'Bearish' : 'Neutral';
  return `${dir} Split`;
}

function derive(r: FlowRow, nowMs: number): Derived {
  const h = hashId(r.id);
  const h2 = (Math.imul(h, 2654435761) >>> 0) % 100;

  const otm =
    r.strike == null
      ? null
      : r.cp === 'P'
        ? (r.spot - r.strike) / r.spot
        : (r.strike - r.spot) / r.spot;

  const dte = parseDTE(r.expiry, nowMs);

  let bid: number | null = null;
  let ask: number | null = null;
  let spread: number | null = null;
  let avg: number | null = null;
  if (r.strike != null && r.size > 0) {
    const mid = r.premium / (r.size * 100);
    const hs = 0.015 + (h % 8) / 100; // half-spread 1.5%–9.5%
    bid = Math.max(0.01, mid * (1 - hs));
    ask = mid * (1 + hs);
    spread = ask - bid;
    avg = mid;
  }

  const premScore = Math.min(1, r.premium / 2_000_000);
  const sizeScore = Math.min(1, r.size / 6000);
  const flowScore = Math.round((premScore * 0.72 + sizeScore * 0.28) * 100);

  const askPct = r.side === 'BUY' ? 55 + (h % 35) : 12 + (h % 33);
  const bidPct = 100 - askPct;

  const oi = 300 + (h % 40000);
  const vol = Math.max(1, Math.round(r.size * (0.6 + (h % 80) / 100)));
  const volOi = oi ? vol / oi : 0;

  const iv = 14 + (h % 130); // 14%–143%
  const ivPct = h2; // 0..99

  return { otm, dte, bid, ask, spread, avg, flowScore, askPct, bidPct, vol, oi, volOi, iv, ivPct, strategy: strategyLabel(r) };
}

// ── Active-filter count ──────────────────────────────────────────────────────
const num = (s: string): number | null => {
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

function countActive(f: FlowFilterState): number {
  let n = 0;
  if (f.type !== 'all') n++;
  if (f.equity.length) n++;
  if (f.expiryDate) n++;
  const pairs: [string, string][] = [
    [f.dteMin, f.dteMax],
    [f.premMin, f.premMax],
    [f.oiMin, f.oiMax],
    [f.volMin, f.volMax],
    [f.volOiMin, f.volOiMax],
    [f.otmMin, f.otmMax],
    [f.stockMin, f.stockMax],
    [f.strikeMin, f.strikeMax],
    [f.avgMin, f.avgMax],
    [f.multiMin, f.multiMax],
    [f.askMin, f.askMax],
    [f.bidMin, f.bidMax],
    [f.skewMin, f.skewMax],
  ];
  for (const [a, b] of pairs) if (a.trim() || b.trim()) n++;
  if (f.sentContract !== 0) n++;
  if (f.sentChain !== 0) n++;
  if (f.excludeITM) n++;
  if (f.exclude0DTE) n++;
  if (f.otmOnly) n++;
  if (f.opexOnly) n++;
  if (f.signalOIGrowth) n++;
  return n;
}

type SortKey = 'time' | 'premium' | 'size' | 'flow';

// ── Small table atoms ────────────────────────────────────────────────────────
const cpColor = (cp: CP): string =>
  cp === 'C' ? 'var(--call)' : cp === 'P' ? 'var(--negative-ink)' : 'var(--text-faint)';

function FlowScoreBar({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="block h-[4px] w-[38px] overflow-hidden rounded-[1px] bg-[var(--surface-2)]">
        <span
          className="block h-full rounded-[1px]"
          style={{ width: `${Math.max(3, score)}%`, background: 'var(--call)' }}
        />
      </span>
      <span className="slayer-num text-[9px] text-[var(--text-muted)]">{score}</span>
    </span>
  );
}

function RatioSplit({ askPct, bidPct }: { askPct: number; bidPct: number }) {
  const ask = askPct >= bidPct;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="flex h-[4px] w-[44px] overflow-hidden rounded-[1px]">
        <span style={{ width: `${askPct}%`, background: 'var(--positive-ink)' }} />
        <span style={{ width: `${bidPct}%`, background: 'var(--negative-ink)' }} />
      </span>
      <span
        className="slayer-num text-[9px] font-semibold"
        style={{ color: ask ? 'var(--positive-ink)' : 'var(--negative-ink)' }}
      >
        {ask ? `A ${askPct}%` : `B ${bidPct}%`}
      </span>
    </span>
  );
}

function StrategyChip({ label }: { label: string }) {
  return (
    <span
      className="slayer-num inline-flex items-center whitespace-nowrap rounded-[3px] px-1.5 py-[1px] text-[9px] font-semibold"
      style={{
        color: 'var(--greek)',
        background: 'color-mix(in srgb, var(--greek) 15%, transparent)',
        boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--greek) 32%, transparent)',
      }}
    >
      {label}
    </span>
  );
}

const sentColor = (s: Sentiment): string =>
  s === 'BULLISH' ? 'var(--positive-ink)' : s === 'BEARISH' ? 'var(--negative-ink)' : 'var(--text-muted)';
const sentShort = (s: Sentiment): string => (s === 'BULLISH' ? 'Bull' : s === 'BEARISH' ? 'Bear' : '—');

// Column definitions for the flow table.
const COLS: { key: string; label: string; align?: 'left' | 'right' | 'center' }[] = [
  { key: 'time', label: 'Date/Time', align: 'left' },
  { key: 'ticker', label: 'Ticker', align: 'left' },
  { key: 'strike', label: 'Strike', align: 'right' },
  { key: 'cp', label: 'C/P', align: 'center' },
  { key: 'otm', label: '%OTM', align: 'right' },
  { key: 'exp', label: 'Exp', align: 'left' },
  { key: 'dte', label: 'DTE', align: 'right' },
  { key: 'bid', label: 'Bid', align: 'right' },
  { key: 'ask', label: 'Ask', align: 'right' },
  { key: 'spread', label: 'Spread', align: 'right' },
  { key: 'side', label: 'Side', align: 'center' },
  { key: 'flow', label: 'Flow Score', align: 'left' },
  { key: 'ratio', label: 'Contract Ratio', align: 'left' },
  { key: 'size', label: 'Size', align: 'right' },
  { key: 'prem', label: 'Prem', align: 'right' },
  { key: 'vol', label: 'Vol', align: 'right' },
  { key: 'oi', label: 'OI', align: 'right' },
  { key: 'spot', label: 'Spot', align: 'right' },
  { key: 'iv', label: 'IV', align: 'right' },
  { key: 'ivp', label: 'IV%', align: 'right' },
  { key: 'strat', label: 'Strategy', align: 'left' },
  { key: 'sent', label: 'Sentiment', align: 'center' },
];

const alignCls = (a?: 'left' | 'right' | 'center') =>
  a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';

// ── Main view ───────────────────────────────────────────────────────────────
export default function OptionsFlowTape() {
  const reduce = useReducedMotion();

  const expiries = useMemo(() => buildExpiries(), []);
  const flashRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const makeRow = useCallback((ts?: number) => makeFlow(expiries, ts), [expiries]);

  // Seed a full tape on first paint (lazy initializer — component scope, not module).
  const [rows, setRows] = useState<FlowRow[]>(() => {
    const base = Date.now();
    return Array.from({ length: 48 }, (_, i) => makeFlow(expiries, base - i * 4200));
  });
  const [darkPrints, setDarkPrints] = useState<DarkPrint[]>(() => {
    const base = Date.now();
    return Array.from({ length: 14 }, (_, i) => makeDark(base - i * 7000));
  });

  const [flashId, setFlashId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  const [filters, setFilters] = useState<FlowFilterState>(DEFAULT_FLOW_FILTERS);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('time');
  const [selected, setSelected] = useState<FlowRow | null>(null);

  // ET clock — the quiet "live" tick.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Streams — prepend new prints on an interval; frozen under reduced motion.
  useEffect(() => {
    if (reduce) return;
    const tape = setInterval(() => {
      const r = makeRow();
      setRows((prev) => [r, ...prev].slice(0, 80));
      setFlashId(r.id);
      if (flashRef.current) clearTimeout(flashRef.current);
      flashRef.current = setTimeout(() => setFlashId(null), 700);
    }, 1400);
    const dp = setInterval(() => {
      setDarkPrints((prev) => [makeDark(), ...prev].slice(0, 30));
    }, 2600);
    return () => {
      clearInterval(tape);
      clearInterval(dp);
      if (flashRef.current) clearTimeout(flashRef.current);
    };
  }, [reduce, makeRow]);

  // ── Session-pulse aggregates — recomputed from the current tape ───────────
  const kpi = useMemo(() => {
    let total = 0;
    let call = 0;
    let put = 0;
    let bull = 0;
    let bear = 0;
    let largest: FlowRow | null = null;
    for (const r of rows) {
      total += r.premium;
      if (r.cp === 'C') call += r.premium;
      else if (r.cp === 'P') put += r.premium;
      if (r.sentiment === 'BULLISH') bull += r.premium;
      else if (r.sentiment === 'BEARISH') bear += r.premium;
      if (!largest || r.premium > largest.premium) largest = r;
    }
    const callPct = call + put ? Math.round((call / (call + put)) * 100) : 50;
    const bullPct = bull + bear ? Math.round((bull / (bull + bear)) * 100) : 50;
    return { total, call, put, bull, bear, largest, callPct, bullPct };
  }, [rows]);

  const nowMs = now.getTime();

  // ── Filtering + derivation ────────────────────────────────────────────────
  const rowsWith = useMemo(
    () => rows.map((r) => ({ r, d: derive(r, nowMs) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, Math.floor(nowMs / 60000)], // re-derive DTE at most once a minute
  );

  const filtered = useMemo(() => {
    const f = filters;
    const q = search.trim().toUpperCase();
    const premMin = num(f.premMin);
    const premMax = num(f.premMax);
    const otmMin = num(f.otmMin);
    const otmMax = num(f.otmMax);
    const dteMin = num(f.dteMin);
    const dteMax = num(f.dteMax);
    const strikeMin = num(f.strikeMin);
    const strikeMax = num(f.strikeMax);
    const stockMin = num(f.stockMin);
    const stockMax = num(f.stockMax);
    const volMin = num(f.volMin);
    const volMax = num(f.volMax);
    const oiMin = num(f.oiMin);
    const oiMax = num(f.oiMax);
    const volOiMin = num(f.volOiMin);
    const volOiMax = num(f.volOiMax);
    const avgMin = num(f.avgMin);
    const avgMax = num(f.avgMax);

    const out = rowsWith.filter(({ r, d }) => {
      if (q && !r.ticker.includes(q)) return false;
      if (f.type === 'calls' && r.cp !== 'C') return false;
      if (f.type === 'puts' && r.cp !== 'P') return false;
      if (premMin != null && r.premium < premMin) return false;
      if (premMax != null && r.premium > premMax) return false;
      // %OTM filters are entered as percentages
      if (d.otm != null) {
        const otmPct = d.otm * 100;
        if (otmMin != null && otmPct < otmMin) return false;
        if (otmMax != null && otmPct > otmMax) return false;
        if (f.excludeITM && otmPct < 0) return false;
        if (f.otmOnly && otmPct <= 0) return false;
      } else if (f.excludeITM || f.otmOnly || otmMin != null || otmMax != null) {
        // dark-pool / no strike can't satisfy a strike-relative filter
        return false;
      }
      if (d.dte != null) {
        if (dteMin != null && d.dte < dteMin) return false;
        if (dteMax != null && d.dte > dteMax) return false;
        if (f.exclude0DTE && d.dte === 0) return false;
      } else if (dteMin != null || dteMax != null) {
        return false;
      }
      if (strikeMin != null && (r.strike == null || r.strike < strikeMin)) return false;
      if (strikeMax != null && (r.strike == null || r.strike > strikeMax)) return false;
      if (stockMin != null && r.spot < stockMin) return false;
      if (stockMax != null && r.spot > stockMax) return false;
      if (volMin != null && d.vol < volMin) return false;
      if (volMax != null && d.vol > volMax) return false;
      if (oiMin != null && d.oi < oiMin) return false;
      if (oiMax != null && d.oi > oiMax) return false;
      if (volOiMin != null && d.volOi < volOiMin) return false;
      if (volOiMax != null && d.volOi > volOiMax) return false;
      if (avgMin != null && (d.avg == null || d.avg < avgMin)) return false;
      if (avgMax != null && (d.avg == null || d.avg > avgMax)) return false;
      // Contract sentiment slider: threshold ±20 → Bull / Bear, else All.
      if (f.sentContract > 20 && r.sentiment !== 'BULLISH') return false;
      if (f.sentContract < -20 && r.sentiment !== 'BEARISH') return false;
      return true;
    });

    const sorted = [...out];
    if (sortKey === 'premium') sorted.sort((a, b) => b.r.premium - a.r.premium);
    else if (sortKey === 'size') sorted.sort((a, b) => b.r.size - a.r.size);
    else if (sortKey === 'flow') sorted.sort((a, b) => b.d.flowScore - a.d.flowScore);
    else sorted.sort((a, b) => b.r.ts - a.r.ts);
    return sorted;
  }, [rowsWith, filters, search, sortKey]);

  const maxPrem = useMemo(() => filtered.reduce((m, x) => Math.max(m, x.r.premium), 0) || 1, [filtered]);
  const activeCount = useMemo(() => countActive(filters), [filters]);

  // Live status pill.
  const liveTag = (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-[3px] bg-[var(--surface-2)] px-2 py-[3px] shadow-[inset_0_0_0_1px_var(--border-subtle)]">
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${reduce ? '' : 'animate-pulse'}`}
        style={{ background: reduce ? 'var(--text-faint)' : 'var(--accent-color)' }}
      />
      <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
        {reduce ? 'Paused' : 'Live'}
      </span>
    </span>
  );

  const chrome =
    'slayer-num inline-flex items-center gap-1 rounded-[3px] bg-[var(--surface-2)] px-2 py-[4px] text-[10px] text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-subtle)] outline-none';

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-col gap-[var(--gap)]" id="options-flow-tape-view">
      {/* ============== SESSION PULSE — slim strip (aggregates only; no column value restated) ============== */}
      <div className="slayer-panel flex flex-wrap items-center gap-x-5 gap-y-1.5 px-3 py-2">
        <span className="text-[9px] font-semibold uppercase tracking-[0.13em] text-[var(--text-muted)]">
          Session Pulse
        </span>
        <span className="slayer-num text-[10px]">
          <span style={{ color: 'var(--positive-ink)' }}>{kpi.bullPct}% Bull</span>
          <span className="text-[var(--text-faint)]"> · </span>
          <span style={{ color: 'var(--negative-ink)' }}>{100 - kpi.bullPct}% Bear</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="slayer-num text-[10px] text-[var(--text-muted)]">Call/Put</span>
          <span className="flex h-[5px] w-[64px] overflow-hidden rounded-[1px] bg-[var(--surface-2)]">
            <span style={{ width: `${kpi.callPct}%`, background: 'var(--call)' }} />
            <span style={{ width: `${100 - kpi.callPct}%`, background: 'var(--negative-ink)' }} />
          </span>
          <span className="slayer-num text-[10px] text-[var(--text-secondary)]">
            {kpi.callPct}/{100 - kpi.callPct}
          </span>
        </span>
        <span className="slayer-num text-[10px] text-[var(--text-muted)]">
          Prem <span className="font-semibold text-[var(--pin)]">{fmtUsd(kpi.total)}</span>
        </span>
        <span className="slayer-num text-[10px] text-[var(--text-muted)]">
          Prints <span className="font-semibold text-[var(--text-primary)]">{rows.length}</span>
        </span>
        <span className="slayer-num text-[10px] text-[var(--text-muted)]">
          Dark <span className="font-semibold text-[var(--greek)]">{darkPrints.length}</span>
        </span>
        <span className="slayer-num text-[10px] text-[var(--text-muted)]">
          Largest{' '}
          <span className="font-semibold text-[var(--text-primary)]">
            {kpi.largest ? `${kpi.largest.ticker} ${fmtUsd(kpi.largest.premium)}` : '—'}
          </span>
        </span>
      </div>

      {/* ============== SCREENER GRID — filters rail + flow table ============== */}
      <div className="grid min-h-0 grid-cols-1 gap-[var(--gap)] xl:grid-cols-[212px_minmax(0,1fr)]">
        {/* -------- FILTERS RAIL -------- */}
        <aside className="slayer-panel flex min-h-0 flex-col xl:h-[calc(100vh-150px)]">
          <header className="slayer-panel-header flex items-center justify-between gap-2 py-2.5!">
            <span className="slayer-title-section">Screener</span>
            <span className="slayer-num text-[9px] text-[var(--text-muted)]">{activeCount} on</span>
          </header>
          <FlowFilters value={filters} onChange={setFilters} activeCount={activeCount} />
        </aside>

        {/* -------- MAIN COLUMN: toolbar + table -------- */}
        <section className="slayer-panel flex min-h-0 min-w-0 flex-col xl:h-[calc(100vh-150px)]">
          {/* Toolbar */}
          <header className="slayer-panel-header flex flex-wrap items-center gap-x-2 gap-y-2 py-2.5!">
            <select
              aria-label="View"
              className={chrome}
              defaultValue="default"
              onChange={() => undefined}
            >
              <option value="default">Default</option>
              <option value="whales">Whales</option>
              <option value="0dte">0DTE</option>
            </select>
            <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-[3px] bg-[var(--surface-2)] px-2 py-[4px] shadow-[inset_0_0_0_1px_var(--border-subtle)]">
              <span aria-hidden className="text-[10px] text-[var(--text-faint)]">⌕</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ticker…"
                className="slayer-num min-w-0 flex-1 bg-transparent text-[10px] text-[var(--text-primary)] placeholder:text-[var(--text-faint)] outline-none"
              />
            </label>
            {liveTag}
            <label className={chrome}>
              <span className="text-[var(--text-muted)]">Sort</span>
              <select
                aria-label="Sort by"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="bg-transparent text-[var(--text-secondary)] outline-none"
              >
                <option value="time">Time</option>
                <option value="premium">Premium</option>
                <option value="size">Size</option>
                <option value="flow">Flow Score</option>
              </select>
            </label>
            <span className="slayer-num text-[10px] text-[var(--text-muted)]">
              Results <span className="font-semibold text-[var(--text-primary)]">{filtered.length}</span>
            </span>
            <button type="button" className={chrome}>
              Columns
            </button>
            <button type="button" className={chrome}>
              <span>Filters</span>
              {activeCount > 0 ? (
                <span
                  className="slayer-num rounded-[2px] px-1 text-[9px] font-semibold"
                  style={{
                    color: 'var(--accent-color)',
                    background: 'color-mix(in srgb, var(--accent-color) 18%, transparent)',
                  }}
                >
                  {activeCount}
                </span>
              ) : null}
            </button>
            <button type="button" className={chrome}>
              Share
            </button>
          </header>

          {/* FLOW TABLE — scrolls inside its own container (x + y) */}
          <div className="slayer-scrollbar min-h-0 flex-1 overflow-auto">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-[1] bg-[var(--bg-panel)]">
                <tr>
                  {COLS.map((c) => (
                    <th
                      key={c.key}
                      className={`whitespace-nowrap border-b border-[var(--border-strong)] px-1.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] ${alignCls(c.align)}`}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={COLS.length}
                      className="px-4 py-10 text-center text-[11px] text-[var(--text-muted)]"
                    >
                      No prints match the current filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map(({ r, d }) => {
                    const fresh = r.id === flashId;
                    const sideColor = r.side === 'BUY' ? 'var(--positive-ink)' : 'var(--negative-ink)';
                    return (
                      <tr
                        key={r.id}
                        onClick={() => setSelected(r)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelected(r);
                          }
                        }}
                        className="cursor-pointer border-b border-[var(--border-subtle)] transition-colors hover:bg-[var(--surface-2)]"
                        style={
                          fresh
                            ? { boxShadow: 'inset 3px 0 0 var(--accent-color)' }
                            : {
                                boxShadow: `inset 2px 0 0 ${
                                  r.sentiment === 'BULLISH'
                                    ? 'var(--positive-ink)'
                                    : r.sentiment === 'BEARISH'
                                      ? 'var(--negative-ink)'
                                      : 'transparent'
                                }`,
                              }
                        }
                      >
                        {/* Date/Time */}
                        <td className="whitespace-nowrap px-1.5 py-[3px] text-left slayer-num text-[10px] text-[var(--text-muted)]">
                          {fmtET(r.ts)}
                        </td>
                        {/* Ticker */}
                        <td className="whitespace-nowrap px-1.5 py-[3px] text-left slayer-num text-[10.5px] font-semibold text-[var(--text-primary)]">
                          {r.ticker}
                        </td>
                        {/* Strike */}
                        <td className="whitespace-nowrap px-1.5 py-[3px] text-right slayer-num text-[10px] text-[var(--text-secondary)]">
                          {r.strike == null ? '—' : fmtInt(r.strike)}
                        </td>
                        {/* C/P */}
                        <td className="px-1.5 py-[3px] text-center slayer-num text-[10px] font-bold" style={{ color: cpColor(r.cp) }}>
                          {r.cp ?? '—'}
                        </td>
                        {/* %OTM */}
                        <td
                          className="whitespace-nowrap px-1.5 py-[3px] text-right slayer-num text-[10px]"
                          style={{ color: d.otm == null ? 'var(--text-faint)' : d.otm < 0 ? 'var(--pin)' : 'var(--text-secondary)' }}
                        >
                          {d.otm == null ? '—' : `${d.otm >= 0 ? '+' : ''}${(d.otm * 100).toFixed(1)}%`}
                        </td>
                        {/* Exp */}
                        <td
                          className={`whitespace-nowrap px-1.5 py-[3px] text-left slayer-num text-[10px] ${r.expiry === '0DTE' ? 'font-semibold text-[var(--warning-ink)]' : 'text-[var(--text-secondary)]'}`}
                        >
                          {r.expiry}
                        </td>
                        {/* DTE */}
                        <td className="whitespace-nowrap px-1.5 py-[3px] text-right slayer-num text-[10px] text-[var(--text-muted)]">
                          {d.dte == null ? '—' : d.dte}
                        </td>
                        {/* Bid */}
                        <td className="whitespace-nowrap px-1.5 py-[3px] text-right slayer-num text-[10px] text-[var(--text-secondary)]">
                          {d.bid == null ? '—' : fmtPrice(d.bid)}
                        </td>
                        {/* Ask */}
                        <td className="whitespace-nowrap px-1.5 py-[3px] text-right slayer-num text-[10px] text-[var(--text-secondary)]">
                          {d.ask == null ? '—' : fmtPrice(d.ask)}
                        </td>
                        {/* Spread */}
                        <td className="whitespace-nowrap px-1.5 py-[3px] text-right slayer-num text-[10px] text-[var(--text-muted)]">
                          {d.spread == null ? '—' : fmtPrice(d.spread)}
                        </td>
                        {/* Side */}
                        <td className="px-1.5 py-[3px] text-center slayer-num text-[10px] font-semibold" style={{ color: sideColor }}>
                          {r.side}
                        </td>
                        {/* Flow Score */}
                        <td className="px-1.5 py-[3px] text-left">
                          <FlowScoreBar score={d.flowScore} />
                        </td>
                        {/* Contract Ratio */}
                        <td className="px-1.5 py-[3px] text-left">
                          <RatioSplit askPct={d.askPct} bidPct={d.bidPct} />
                        </td>
                        {/* Size */}
                        <td className="whitespace-nowrap px-1.5 py-[3px] text-right slayer-num text-[10px] text-[var(--text-secondary)]">
                          {fmtInt(r.size)}
                        </td>
                        {/* Prem — gold, with relative micro-bar */}
                        <td className="whitespace-nowrap px-1.5 py-[3px] text-right">
                          <span className="flex flex-col items-end">
                            <span className="slayer-num text-[10px] font-semibold text-[var(--pin)]">{fmtUsd(r.premium)}</span>
                            <span className="mt-[2px] block h-[2px] w-[42px] overflow-hidden rounded-[1px] bg-[var(--surface-2)]">
                              <span
                                className="block h-full"
                                style={{ width: `${Math.max(3, (r.premium / maxPrem) * 100)}%`, background: 'var(--pin)' }}
                              />
                            </span>
                          </span>
                        </td>
                        {/* Vol */}
                        <td className="whitespace-nowrap px-1.5 py-[3px] text-right slayer-num text-[10px] text-[var(--text-secondary)]">
                          {fmtInt(d.vol)}
                        </td>
                        {/* OI */}
                        <td className="whitespace-nowrap px-1.5 py-[3px] text-right slayer-num text-[10px] text-[var(--text-secondary)]">
                          {fmtInt(d.oi)}
                        </td>
                        {/* Spot */}
                        <td className="whitespace-nowrap px-1.5 py-[3px] text-right slayer-num text-[10px] text-[var(--text-muted)]">
                          {fmtPrice(r.spot)}
                        </td>
                        {/* IV */}
                        <td className="whitespace-nowrap px-1.5 py-[3px] text-right slayer-num text-[10px] text-[var(--text-secondary)]">
                          {d.iv}%
                        </td>
                        {/* IV% */}
                        <td className="whitespace-nowrap px-1.5 py-[3px] text-right slayer-num text-[10px] text-[var(--text-muted)]">
                          {d.ivPct}
                        </td>
                        {/* Strategy */}
                        <td className="whitespace-nowrap px-1.5 py-[3px] text-left">
                          <StrategyChip label={d.strategy} />
                        </td>
                        {/* Sentiment */}
                        <td className="px-1.5 py-[3px] text-center slayer-num text-[10px] font-semibold" style={{ color: sentColor(r.sentiment) }}>
                          {sentShort(r.sentiment)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footnote — honest labelling of synthesized columns (once). */}
          <div className="border-t border-[var(--border-subtle)] px-3 py-1.5 text-[9px] text-[var(--text-faint)]">
            %OTM · DTE derived from strike/spot/expiry. Bid · Ask · Spread · Flow Score · Contract Ratio · Vol · OI · IV · IV% are derived / modeled from each print (stable per contract).
          </div>
        </section>
      </div>

      {/* ============== PER-CONTRACT DRILLDOWN ============== */}
      <ContractDrilldown row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
