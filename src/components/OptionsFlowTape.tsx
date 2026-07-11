/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * OPTIONS FLOW TAPE — the institutional dealer-flow feed. A live, prepending
 * tape of options prints (sweeps · blocks · splits · dark-pool) with a
 * recomputing KPI strip, type/sentiment/premium filters, a dedicated
 * dark-pool prints rail and a top-tickers-by-premium ladder.
 *
 * Fully self-contained: no props, no network. Prints are synthesized in-effect
 * on an interval so the tape reads live; the stream freezes under
 * prefers-reduced-motion. Nothing is fabricated at module scope.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { TerminalPanel } from './ui/terminal/TerminalPanel';
import { DataTable, type DataColumn } from './ui/terminal/DataTable';
import { MetricStrip, type Metric } from './ui/terminal/MetricStrip';
import { StatusBadge } from './ui/terminal/StatusBadge';
import { ToggleGroup } from './ui/ToggleGroup';

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

type TypeFilter = 'ALL' | FlowType;
type SentFilter = 'ALL' | 'BULLISH' | 'BEARISH';
type PremFilter = '0' | '100000' | '500000' | '1000000';

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

// ── Small ratio bar (steel vs red) ──────────────────────────────────────────
function RatioBar({ left, right }: { left: number; right: number }) {
  const total = left + right || 1;
  const lp = Math.max(0, Math.min(100, (left / total) * 100));
  return (
    <div className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
      <div style={{ width: `${lp}%`, background: 'var(--call)' }} />
      <div style={{ width: `${100 - lp}%`, background: 'var(--negative-ink)' }} />
    </div>
  );
}

// ── Cell atoms for the tape ─────────────────────────────────────────────────
const cpColor = (cp: CP): string =>
  cp === 'C' ? 'var(--call)' : cp === 'P' ? 'var(--negative-ink)' : 'var(--text-faint)';

const sentColor = (s: Sentiment): string =>
  s === 'BULLISH' ? 'var(--positive-ink)' : s === 'BEARISH' ? 'var(--negative-ink)' : 'var(--text-muted)';

const typeTone = (t: FlowType): 'warning' | 'info' | 'neutral' | 'pin' =>
  t === 'SWEEP' ? 'warning' : t === 'BLOCK' ? 'info' : t === 'DARKPOOL' ? 'pin' : 'neutral';

// ── Main view ───────────────────────────────────────────────────────────────
export default function OptionsFlowTape() {
  const reduce = useReducedMotion();

  const expiries = useMemo(() => buildExpiries(), []);
  const flashRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const makeRow = useCallback((ts?: number) => makeFlow(expiries, ts), [expiries]);

  // Seed a full tape on first paint (lazy initializer — component scope, not module).
  const [rows, setRows] = useState<FlowRow[]>(() => {
    const base = Date.now();
    return Array.from({ length: 40 }, (_, i) => makeFlow(expiries, base - i * 4200));
  });
  const [darkPrints, setDarkPrints] = useState<DarkPrint[]>(() => {
    const base = Date.now();
    return Array.from({ length: 14 }, (_, i) => makeDark(base - i * 7000));
  });

  const [flashId, setFlashId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [sentFilter, setSentFilter] = useState<SentFilter>('ALL');
  const [premFilter, setPremFilter] = useState<PremFilter>('0');

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
      setRows((prev) => [r, ...prev].slice(0, 60));
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

  // ── KPIs — recomputed from the current tape ───────────────────────────────
  const kpi = useMemo(() => {
    let total = 0;
    let call = 0;
    let put = 0;
    let bull = 0;
    let bear = 0;
    let sweeps = 0;
    let blocks = 0;
    let largest: FlowRow | null = null;
    for (const r of rows) {
      total += r.premium;
      if (r.cp === 'C') call += r.premium;
      else if (r.cp === 'P') put += r.premium;
      if (r.sentiment === 'BULLISH') bull += r.premium;
      else if (r.sentiment === 'BEARISH') bear += r.premium;
      if (r.type === 'SWEEP') sweeps++;
      if (r.type === 'BLOCK') blocks++;
      if (!largest || r.premium > largest.premium) largest = r;
    }
    const callPct = call + put ? Math.round((call / (call + put)) * 100) : 50;
    const bullPct = bull + bear ? Math.round((bull / (bull + bear)) * 100) : 50;
    return { total, call, put, bull, bear, sweeps, blocks, largest, callPct, bullPct };
  }, [rows]);

  // Top tickers by premium (from current tape).
  const topTickers = useMemo(() => {
    const by = new Map<string, number>();
    for (const r of rows) by.set(r.ticker, (by.get(r.ticker) ?? 0) + r.premium);
    const list = [...by.entries()].map(([ticker, premium]) => ({ ticker, premium }));
    list.sort((a, b) => b.premium - a.premium);
    const max = list[0]?.premium ?? 1;
    return list.slice(0, 6).map((x) => ({ ...x, pct: (x.premium / max) * 100 }));
  }, [rows]);

  // ── Filtering ─────────────────────────────────────────────────────────────
  const minPrem = Number(premFilter);
  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (typeFilter !== 'ALL' && r.type !== typeFilter) return false;
        if (sentFilter !== 'ALL' && r.sentiment !== sentFilter) return false;
        if (r.premium < minPrem) return false;
        return true;
      }),
    [rows, typeFilter, sentFilter, minPrem],
  );

  // ── KPI strip metrics ─────────────────────────────────────────────────────
  const metrics: Metric[] = [
    { label: 'Session Premium', value: fmtUsd(kpi.total), sub: `${rows.length} prints on tape`, tone: 'neutral' },
    {
      label: 'Call / Put Premium',
      value: (
        <span>
          <span className="text-[var(--call)]">{kpi.callPct}</span>
          <span className="text-[var(--text-muted)]"> / </span>
          <span className="text-[var(--negative-ink)]">{100 - kpi.callPct}</span>
        </span>
      ),
      sub: <RatioBar left={kpi.call} right={kpi.put} />,
      tone: 'neutral',
    },
    {
      label: 'Bullish vs Bearish',
      value: (
        <span className={kpi.bullPct >= 50 ? 'text-[var(--call)]' : 'text-[var(--negative-ink)]'}>
          {kpi.bullPct}% {kpi.bullPct >= 50 ? 'BULL' : 'BEAR'}
        </span>
      ),
      sub: <RatioBar left={kpi.bull} right={kpi.bear} />,
      tone: 'neutral',
    },
    { label: 'Sweeps', value: fmtInt(kpi.sweeps), sub: 'aggressive orders', tone: 'warning' },
    { label: 'Blocks', value: fmtInt(kpi.blocks), sub: 'negotiated size', tone: 'call' },
    { label: 'Dark-Pool Prints', value: fmtInt(darkPrints.length), sub: 'off-exchange', tone: 'pin' },
    {
      label: 'Largest Print',
      value: kpi.largest ? fmtUsd(kpi.largest.premium) : '—',
      sub: kpi.largest ? `${kpi.largest.ticker} · ${kpi.largest.type.toLowerCase()}` : undefined,
      tone: 'neutral',
    },
  ];

  // ── Tape columns ──────────────────────────────────────────────────────────
  const columns: DataColumn<FlowRow>[] = [
    {
      id: 'time',
      title: 'TIME',
      align: 'left',
      className: 'whitespace-nowrap',
      render: (r) => <span className="slayer-num text-[11px] text-[var(--text-muted)]">{fmtET(r.ts)}</span>,
    },
    {
      id: 'ticker',
      title: 'TICKER',
      align: 'left',
      render: (r) => <span className="slayer-num text-[11.5px] font-semibold text-[var(--text-primary)]">{r.ticker}</span>,
    },
    {
      id: 'expiry',
      title: 'EXPIRY',
      align: 'left',
      className: 'whitespace-nowrap',
      render: (r) => (
        <span
          className={`slayer-num text-[10.5px] ${r.expiry === '0DTE' ? 'font-semibold text-[var(--warning)]' : 'text-[var(--text-secondary)]'}`}
        >
          {r.expiry}
        </span>
      ),
    },
    {
      id: 'strike',
      title: 'STRIKE',
      align: 'right',
      render: (r) => (
        <span className="slayer-num text-[11px] text-[var(--text-primary)]">
          {r.strike == null ? '—' : fmtInt(r.strike)}
        </span>
      ),
    },
    {
      id: 'cp',
      title: 'C/P',
      align: 'center',
      render: (r) => (
        <span className="slayer-num text-[11px] font-bold" style={{ color: cpColor(r.cp) }}>
          {r.cp ?? '—'}
        </span>
      ),
    },
    {
      id: 'side',
      title: 'SIDE',
      align: 'center',
      render: (r) => (
        <span
          className="slayer-num text-[10.5px] font-semibold"
          style={{ color: r.side === 'BUY' ? 'var(--positive-ink)' : 'var(--negative-ink)' }}
        >
          {r.side}
        </span>
      ),
    },
    {
      id: 'size',
      title: 'SIZE',
      align: 'right',
      render: (r) => <span className="slayer-num text-[11px] text-[var(--text-secondary)]">{fmtInt(r.size)}</span>,
    },
    {
      id: 'premium',
      title: 'PREMIUM',
      align: 'right',
      render: (r) => (
        <span
          className={`slayer-num text-[11.5px] font-semibold ${r.premium >= 1e6 ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}
        >
          {fmtUsd(r.premium)}
        </span>
      ),
    },
    {
      id: 'spot',
      title: 'SPOT',
      align: 'right',
      render: (r) => <span className="slayer-num text-[10.5px] text-[var(--text-muted)]">{fmtPrice(r.spot)}</span>,
    },
    {
      id: 'type',
      title: 'TYPE',
      align: 'center',
      render: (r) => <StatusBadge tone={typeTone(r.type)}>{r.type}</StatusBadge>,
    },
    {
      id: 'sentiment',
      title: 'SENTIMENT',
      align: 'right',
      render: (r) => (
        <span
          className="slayer-num text-[10px] font-semibold uppercase tracking-[0.12em]"
          style={{ color: sentColor(r.sentiment) }}
        >
          {r.sentiment}
        </span>
      ),
    },
  ];

  const darkColumns: DataColumn<DarkPrint>[] = [
    {
      id: 'ticker',
      title: 'TICKER',
      align: 'left',
      render: (r) => <span className="slayer-num text-[11px] font-semibold text-[var(--text-primary)]">{r.ticker}</span>,
    },
    {
      id: 'size',
      title: 'SIZE',
      align: 'right',
      render: (r) => <span className="slayer-num text-[11px] text-[var(--text-secondary)]">{fmtInt(r.size)}</span>,
    },
    {
      id: 'price',
      title: 'PRICE',
      align: 'right',
      render: (r) => <span className="slayer-num text-[10.5px] text-[var(--text-muted)]">{fmtPrice(r.price)}</span>,
    },
    {
      id: 'notional',
      title: 'NOTIONAL',
      align: 'right',
      render: (r) => (
        <span className="slayer-num text-[11px] font-semibold text-[var(--pin)]">{fmtUsd(r.notional)}</span>
      ),
    },
    {
      id: 'time',
      title: 'TIME',
      align: 'right',
      className: 'whitespace-nowrap',
      render: (r) => <span className="slayer-num text-[10.5px] text-[var(--text-muted)]">{fmtET(r.ts)}</span>,
    },
  ];

  const liveTag = (
    <div className="flex items-center gap-2">
      <span className="slayer-num text-[11px] tabular-nums text-[var(--text-secondary)]">{fmtET(now.getTime())} ET</span>
    </div>
  );

  return (
    <div className="w-full space-y-[var(--gap)]" id="options-flow-tape-view">
      {/* ============== KPI STRIP — recomputes from the current tape ============== */}
      <MetricStrip metrics={metrics} columns={7} />

      {/* ============== FILTER BAR ============== */}
      <div className="slayer-panel flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Flow</span>
          <ToggleGroup<TypeFilter>
            ariaLabel="Filter by flow type"
            size="sm"
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: 'ALL', label: 'All' },
              { value: 'SWEEP', label: 'Sweeps' },
              { value: 'BLOCK', label: 'Blocks' },
              { value: 'SPLIT', label: 'Splits' },
              { value: 'DARKPOOL', label: 'Dark Pool' },
            ]}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
            Sentiment
          </span>
          <ToggleGroup<SentFilter>
            ariaLabel="Filter by sentiment"
            size="sm"
            value={sentFilter}
            onChange={setSentFilter}
            options={[
              { value: 'ALL', label: 'All' },
              { value: 'BULLISH', label: 'Bullish' },
              { value: 'BEARISH', label: 'Bearish' },
            ]}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
            Min Premium
          </span>
          <ToggleGroup<PremFilter>
            ariaLabel="Filter by minimum premium"
            size="sm"
            value={premFilter}
            onChange={setPremFilter}
            options={[
              { value: '0', label: 'All' },
              { value: '100000', label: '≥$100K' },
              { value: '500000', label: '≥$500K' },
              { value: '1000000', label: '≥$1M' },
            ]}
          />
        </div>
      </div>

      {/* ============== TAPE + RIGHT RAIL ============== */}
      <div className="grid grid-cols-1 items-start gap-[var(--gap)] xl:grid-cols-12">
        <TerminalPanel
          className="xl:col-span-8"
          title="Options Flow Tape"
          subtitle={`${filtered.length} of ${rows.length} prints · sweeps · blocks · splits · dark pool`}
          actions={liveTag}
          padded={false}
        >
          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={(r) => r.id}
            className="max-h-[560px] border-0"
            rowClassName={(r) =>
              r.id === flashId ? 'bg-[color-mix(in_srgb,var(--call)_12%,transparent)]' : undefined
            }
            emptyState="No prints match the current filters."
          />
        </TerminalPanel>

        <div className="space-y-[var(--gap)] xl:col-span-4">
          <TerminalPanel title="Dark-Pool Prints" subtitle="off-exchange block crosses" padded={false}>
            <DataTable
              columns={darkColumns}
              rows={darkPrints}
              rowKey={(r) => r.id}
              className="max-h-[300px] border-0"
              emptyState="No dark-pool prints yet."
            />
          </TerminalPanel>

          <TerminalPanel title="Top Tickers by Premium" subtitle="session flow concentration">
            <div className="space-y-2.5">
              {topTickers.length === 0 ? (
                <div className="text-[12px] slayer-muted">No flow yet.</div>
              ) : (
                topTickers.map((t) => (
                  <div key={t.ticker} className="flex items-center gap-3">
                    <span className="slayer-num w-12 shrink-0 text-[11.5px] font-semibold text-[var(--text-primary)]">
                      {t.ticker}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
                      <div className="h-full rounded-full" style={{ width: `${t.pct}%`, background: 'var(--call)' }} />
                    </div>
                    <span className="slayer-num w-16 shrink-0 text-right text-[11px] text-[var(--text-secondary)]">
                      {fmtUsd(t.premium)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </TerminalPanel>
        </div>
      </div>
    </div>
  );
}
