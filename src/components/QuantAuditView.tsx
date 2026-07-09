/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * AUDITOR — the Trade History terminal page. A unified trade blotter that merges
 * two REAL sources into one honest ledger:
 *   1. the server trade archive (serverState.trade_archive → V8TradeRecord[])
 *   2. the user's tracked setups (useTrackingStore → TrackedSetup[])
 *
 * Nothing is fabricated. Open trades never render a realized P&L or a win/loss
 * verdict. Dollar figures are stated in explicit "per contract" units because
 * position size isn't recorded — they are derived from real premium × real
 * return, never invented. R-multiples use a real planned-risk denominator (the
 * option-premium stop distance for archive trades; the modeled premium at the
 * invalidation level for tracked setups) and fall back to "—" when that risk unit
 * isn't derivable. The equity curve is a cumulative of real realized outcomes in
 * resolution order, with an awaiting state when nothing has closed.
 *
 * Styling is the shared Slayer Terminal design system (src/styles/slayer-terminal.css
 * + src/components/ui/terminal/*). Color is a data encoding, never decoration.
 */

import { useState, useMemo, useEffect } from 'react';
import {
  RotateCcw, Search, Activity, ChevronLeft, ChevronRight, Columns3,
  Radio, FlaskConical, StickyNote, ArrowUpRight, X, Check, TrendingUp, TrendingDown,
} from 'lucide-react';
import { useContractStore } from '../lib/store';
import EChart from './ui/EChart';
import { TerminalPanel } from './ui/terminal/TerminalPanel';
import { MetricStrip, type Metric, type MetricTone } from './ui/terminal/MetricStrip';
import { DataTable, type Column } from './ui/terminal/DataTable';
import { StatusBadge } from './ui/terminal/StatusBadge';
import {
  useTrackingStore, computeStats, splitByMode, isTerminal, trackModeLabel,
  type TrackedSetup, type TrackStats,
} from '../lib/trackedSetups';
import { useTrackedCount } from './TrackedSetupsPanel';
import { ASSET_LIST } from '../data';
import { AssetInfo, SystemScore, V8TradeRecord } from '../types';

interface QuantAuditViewProps {
  selectedAsset: AssetInfo;
  isCall: boolean;
  systemScore: SystemScore;
  optionPremium: number;
  trades: V8TradeRecord[];
  onClearTrades: () => void;
}

// ── Outcome model ────────────────────────────────────────────────────────────
// A trade is one of three states. 'open' is unresolved — no realized P&L and no
// win/loss verdict; it must never render a fabricated gain.
type OutcomeState = 'open' | 'win' | 'loss';

const archiveState = (t: V8TradeRecord): OutcomeState => {
  if (t.finalOutcome === 'Active') return 'open';
  if (t.finalOutcome === 'Failure') return 'loss';
  return 'win';
};

// Realized return % for a resolved archive trade (?? honors a legitimate 0).
const archiveReturnPct = (t: V8TradeRecord, s: OutcomeState): number | null => {
  if (s === 'open') return null;
  if (s === 'loss') return -(t.maxDrawdown ?? t.expectedDrawdown ?? 0);
  return t.maxGain ?? 0;
};

const trackedState = (s: TrackedSetup): OutcomeState => {
  if (!isTerminal(s.status)) return 'open';
  if (s.status === 'RESOLVED_WIN') return 'win';
  if (s.status === 'RESOLVED_LOSS' || s.status === 'INVALIDATED') return 'loss';
  if (s.status === 'EXPIRED') return (s.finalReturnPct ?? 0) > 0 ? 'win' : 'loss';
  return 'open'; // CANCELLED handled upstream (filtered out)
};

// ── Unified row model ──────────────────────────────────────────────────────────
// One shape both sources normalize into so the blotter, rail, KPIs and equity
// curve all read from the same honest numbers.
interface AuditRow {
  id: string;
  source: 'archive' | 'tracked';
  time: string;                    // display label
  sortMs: number;                  // ordering key (entry time)
  resolveMs: number | null;        // when it closed (equity-curve ordering)
  symbol: string;
  setup: string;                   // real descriptor (structure / dealer rationale)
  contract: string;
  direction: 'BULLISH' | 'BEARISH';
  optionType: 'C' | 'P';
  outcome: OutcomeState;
  status: 'OPEN' | 'CLOSED';
  entry: number;                   // premium at entry
  exitOrCurrent: number | null;    // premium at exit (closed) / live (open tracked)
  returnPct: number | null;        // realized (closed) or unrealized (open tracked)
  realized: boolean;               // returnPct is realized (closed)
  riskPct: number | null;          // planned-risk denominator (1R), in premium %
  r: number | null;                // return R-multiple
  pnlPerContract: number | null;   // $ for one contract (realized when closed)
  maxGainPct: number | null;
  maxAdversePct: number | null;    // signed (negative)
  hasNotes: boolean;
  archive?: V8TradeRecord;
  tracked?: TrackedSetup;
}

const cleanTicker = (u: string) => u.replace(/[^a-zA-Z]/g, '').toUpperCase();

// Planned-risk % (1R) from an option-premium stop: (entry − stop) / entry, as a
// positive premium % in (0, 100]. Returns null when not derivable.
function riskFromStop(entry: number, stop: number | null | undefined): number | null {
  if (stop == null || !isFinite(stop) || !isFinite(entry) || entry <= 0) return null;
  const pct = ((entry - stop) / entry) * 100;
  if (!isFinite(pct) || pct <= 0) return null;
  return Math.min(100, pct);
}

// Modeled premium-risk % for a tracked setup: reprice entry premium at the
// invalidation spot via entry delta, express the drop as a premium %. Null when
// there's no invalidation level to define the risk.
function riskFromInvalidation(s: TrackedSetup): number | null {
  if (s.invalidationLevel == null || !isFinite(s.invalidationLevel)) return null;
  if (!isFinite(s.premiumAtTrack) || s.premiumAtTrack <= 0) return null;
  const premAtInval = s.premiumAtTrack + s.entryDelta * (s.invalidationLevel - s.spotAtTrack);
  const pct = ((s.premiumAtTrack - premAtInval) / s.premiumAtTrack) * 100;
  if (!isFinite(pct) || pct <= 0) return null;
  return Math.min(100, pct);
}

const rMultiple = (retPct: number | null, riskPct: number | null): number | null =>
  retPct == null || riskPct == null || riskPct <= 0 ? null : retPct / riskPct;

// ── Formatters ─────────────────────────────────────────────────────────────────
const fmtUsd = (v: number | null | undefined, signed = true): string => {
  if (v == null || !isFinite(v)) return '—';
  const sign = v < 0 ? '-' : signed ? '+' : '';
  const a = Math.abs(v);
  return `${sign}$${a.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtR = (v: number | null | undefined): string => {
  if (v == null || !isFinite(v)) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}R`;
};
const fmtPct = (v: number | null | undefined, signed = true): string => {
  if (v == null || !isFinite(v)) return '—';
  return `${signed && v > 0 ? '+' : ''}${v.toFixed(1)}%`;
};
const fmtPrem = (v: number | null | undefined): string =>
  v == null || !isFinite(v) ? '—' : `$${v.toFixed(2)}`;

const signTone = (v: number | null | undefined): MetricTone =>
  v == null || !isFinite(v) ? 'neutral' : v > 0 ? 'positive' : v < 0 ? 'negative' : 'neutral';
const signClass = (v: number | null | undefined): string =>
  v == null || !isFinite(v) ? 'text-[var(--text-secondary)]' : v > 0 ? 'text-[#2f9d45]' : v < 0 ? 'text-[#d94646]' : 'text-[var(--text-secondary)]';

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

// ── Row builders ─────────────────────────────────────────────────────────────
function fromArchive(t: V8TradeRecord): AuditRow {
  const state = archiveState(t);
  const closed = state !== 'open';
  const retPct = archiveReturnPct(t, state);
  const riskPct = riskFromStop(t.entryPrice, t.stopLoss);
  const exitOrCurrent = closed && retPct != null ? t.entryPrice * (1 + retPct / 100) : null;
  const pnl = closed && exitOrCurrent != null ? (exitOrCurrent - t.entryPrice) * 100 : null;
  const ms = Date.parse(t.timestamp.replace(' ', 'T'));
  const closeMs = t.closeTs ? Date.parse(t.closeTs.replace(' ', 'T')) : ms;
  return {
    id: t.id,
    source: 'archive',
    time: t.timestamp,
    sortMs: isFinite(ms) ? ms : 0,
    resolveMs: closed ? (isFinite(closeMs) ? closeMs : (isFinite(ms) ? ms : null)) : null,
    symbol: cleanTicker(t.underlying),
    setup: t.structureState || (t.direction === 'BULLISH' ? 'Bullish' : 'Bearish'),
    contract: t.contract,
    direction: t.direction,
    optionType: t.direction === 'BULLISH' ? 'C' : 'P',
    outcome: state,
    status: closed ? 'CLOSED' : 'OPEN',
    entry: t.entryPrice,
    exitOrCurrent,
    returnPct: retPct,
    realized: closed,
    riskPct,
    r: rMultiple(retPct, riskPct),
    pnlPerContract: pnl,
    maxGainPct: t.maxGain ?? null,
    maxAdversePct: t.maxDrawdown != null ? -(t.maxDrawdown) : null,
    hasNotes: (t.failureReasons?.length ?? 0) > 0,
    archive: t,
  };
}

function fromTracked(s: TrackedSetup): AuditRow {
  const state = trackedState(s);
  const closed = state !== 'open';
  const retPct = closed ? (s.finalReturnPct ?? s.premiumChangePct) : s.premiumChangePct;
  const riskPct = riskFromInvalidation(s);
  const pnl = (s.currentPremium - s.premiumAtTrack) * 100;
  return {
    id: s.id,
    source: 'tracked',
    time: new Date(closed ? (s.resolvedAt ?? s.createdAt) : s.createdAt)
      .toLocaleString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
    sortMs: s.createdAt,
    resolveMs: closed ? (s.resolvedAt ?? s.updatedAt) : null,
    symbol: cleanTicker(s.ticker),
    setup: s.dealerReason && s.dealerReason !== '—' ? s.dealerReason : (s.source === 'skyvision' ? 'SkyVision' : 'Pinpoint'),
    contract: s.contract,
    direction: s.direction,
    optionType: s.optionType,
    outcome: state,
    status: closed ? 'CLOSED' : 'OPEN',
    entry: s.premiumAtTrack,
    exitOrCurrent: s.currentPremium,
    returnPct: retPct,
    realized: closed,
    riskPct,
    r: rMultiple(retPct, riskPct),
    pnlPerContract: pnl,
    maxGainPct: s.maxGainPct,
    maxAdversePct: s.maxDrawdownPct,
    hasNotes: (s.dealerReason && s.dealerReason !== '—') || (s.volatilityReason && s.volatilityReason !== '—') ? true : false,
    tracked: s,
  };
}

// ── Optional-column model (functional columns control) ─────────────────────────
type ColKey = 'time' | 'symbol' | 'setup' | 'contract' | 'entry' | 'exit' | 'status' | 'r' | 'pnl' | 'notes';
const COLUMN_DEFS: { key: ColKey; label: string; locked?: boolean }[] = [
  { key: 'time', label: 'Time' },
  { key: 'symbol', label: 'Symbol', locked: true },
  { key: 'setup', label: 'Setup' },
  { key: 'contract', label: 'Contract', locked: true },
  { key: 'entry', label: 'Entry' },
  { key: 'exit', label: 'Exit / Current' },
  { key: 'status', label: 'Status' },
  { key: 'r', label: 'R (Return)' },
  { key: 'pnl', label: 'PnL' },
  { key: 'notes', label: 'Notes' },
];

export function QuantAuditView({
  // selectedAsset, isCall, systemScore and optionPremium are part of the public
  // props contract for this tab; the registry renders from `trades` + the tracking
  // store directly.
  selectedAsset, isCall, systemScore, optionPremium,
  trades,
  onClearTrades,
}: QuantAuditViewProps) {
  void selectedAsset; void isCall; void systemScore; void optionPremium;

  const searchQuery = useContractStore(s => s.auditSearchQuery);
  const setSearchQuery = useContractStore(s => s.setAuditSearchQuery);
  const expandedId = useContractStore(s => s.expandedAuditId);
  const setExpandedId = useContractStore(s => s.setExpandedAuditId);
  const themeMode = useContractStore(s => s.themeMode);
  const trackedCount = useTrackedCount();

  const setups = useTrackingStore(s => s.setups);
  const cancelTracked = useTrackingStore(s => s.cancel);
  const clearResolved = useTrackingStore(s => s.clearResolved);

  const [setupFilter, setSetupFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'CLOSED' | 'WINS' | 'LOSSES'>('ALL');
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(() => new Set(COLUMN_DEFS.map(c => c.key)));
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [perfTab, setPerfTab] = useState<'equity' | 'daily' | 'monthly'>('equity');
  const [perfMode, setPerfMode] = useState<'pnl' | 'r'>('pnl');

  // Tracked setups minus cancelled — the live half of the ledger.
  const trackedVisible = useMemo(() => setups.filter(s => s.status !== 'CANCELLED'), [setups]);
  const { live, modelSample } = useMemo(() => splitByMode(trackedVisible), [trackedVisible]);
  const liveStats = useMemo(() => computeStats(live), [live]);
  const modelStats = useMemo(() => computeStats(modelSample), [modelSample]);

  // Unified rows (newest first) from both real sources.
  const allRows = useMemo<AuditRow[]>(() => {
    const rows = [...trades.map(fromArchive), ...trackedVisible.map(fromTracked)];
    return rows.sort((a, b) => b.sortMs - a.sortMs);
  }, [trades, trackedVisible]);

  const setupOptions = useMemo(
    () => Array.from(new Set(allRows.map(r => r.setup))).sort(),
    [allRows],
  );

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toUpperCase();
    return allRows.filter(r => {
      if (setupFilter !== 'ALL' && r.setup !== setupFilter) return false;
      if (statusFilter === 'OPEN' && r.status !== 'OPEN') return false;
      if (statusFilter === 'CLOSED' && r.status !== 'CLOSED') return false;
      if (statusFilter === 'WINS' && r.outcome !== 'win') return false;
      if (statusFilter === 'LOSSES' && r.outcome !== 'loss') return false;
      if (q) {
        const hay = `${r.symbol} ${r.contract} ${r.setup} ${r.status} ${r.outcome}`.toUpperCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allRows, setupFilter, statusFilter, searchQuery]);

  // Selection: honor an externally-set expandedAuditId (ticker/prism deep-links),
  // else keep a valid local selection, else default to the first filtered row.
  useEffect(() => {
    if (expandedId && allRows.some(r => r.id === expandedId)) setSelectedId(expandedId);
  }, [expandedId, allRows]);
  useEffect(() => {
    if (filteredRows.length === 0) { setSelectedId(null); return; }
    if (!selectedId || !filteredRows.some(r => r.id === selectedId)) setSelectedId(filteredRows[0].id);
  }, [filteredRows, selectedId]);

  const selected = useMemo(
    () => filteredRows.find(r => r.id === selectedId) ?? null,
    [filteredRows, selectedId],
  );
  const selectedIdx = useMemo(
    () => (selected ? filteredRows.findIndex(r => r.id === selected.id) : -1),
    [filteredRows, selected],
  );
  const selectRow = (id: string) => { setSelectedId(id); setExpandedId(id); };
  const stepSelection = (delta: number) => {
    if (filteredRows.length === 0) return;
    const base = selectedIdx < 0 ? 0 : selectedIdx;
    const next = (base + delta + filteredRows.length) % filteredRows.length;
    selectRow(filteredRows[next].id);
  };

  // ── KPI strip — computed from real CLOSED trades across both sources ──────────
  const kpis = useMemo(() => {
    const closed = allRows.filter(r => r.status === 'CLOSED' && r.returnPct != null);
    const wins = closed.filter(r => r.outcome === 'win').length;
    const losses = closed.filter(r => r.outcome === 'loss').length;
    const resolved = wins + losses;
    const retVals = closed.map(r => r.returnPct as number);
    const rVals = closed.map(r => r.r).filter((x): x is number => x != null);
    const pnlVals = closed.map(r => r.pnlPerContract).filter((x): x is number => x != null);
    const avgReturn = retVals.length ? retVals.reduce((a, b) => a + b, 0) / retVals.length : null;
    const expectancyR = rVals.length ? rVals.reduce((a, b) => a + b, 0) / rVals.length : null;
    const realizedPnl = pnlVals.length ? pnlVals.reduce((a, b) => a + b, 0) : null;
    let best: AuditRow | null = null, worst: AuditRow | null = null;
    for (const r of closed) {
      if (r.pnlPerContract == null) continue;
      if (!best || (r.pnlPerContract) > (best.pnlPerContract ?? -Infinity)) best = r;
      if (!worst || (r.pnlPerContract) < (worst.pnlPerContract ?? Infinity)) worst = r;
    }
    const activeTrackers = trackedVisible.filter(s => !isTerminal(s.status)).length;
    return {
      total: allRows.length,
      wins, losses, resolved,
      hitRate: resolved > 0 ? Math.round((wins / resolved) * 100) : null,
      avgReturn, expectancyR, realizedPnl, best, worst, activeTrackers,
    };
  }, [allRows, trackedVisible]);

  const topMetrics: Metric[] = [
    { label: 'Total Trades', value: String(kpis.total), sub: `${kpis.resolved} closed · ${kpis.total - kpis.resolved} open`, tone: 'neutral' },
    { label: 'Hit Rate', value: kpis.hitRate == null ? '—' : `${kpis.hitRate}%`, sub: kpis.resolved > 0 ? `${kpis.wins}W · ${kpis.losses}L` : 'no closed trades', tone: kpis.hitRate == null ? 'neutral' : kpis.hitRate >= 50 ? 'positive' : 'negative' },
    { label: 'Avg Return', value: fmtPct(kpis.avgReturn), sub: 'per closed trade', tone: signTone(kpis.avgReturn) },
    { label: 'Expectancy', value: fmtR(kpis.expectancyR), sub: 'avg R / trade', tone: signTone(kpis.expectancyR) },
    { label: 'Realized PnL', value: fmtUsd(kpis.realizedPnl), sub: 'per contract', tone: signTone(kpis.realizedPnl) },
    { label: 'Best Trade', value: kpis.best ? fmtUsd(kpis.best.pnlPerContract) : '—', sub: kpis.best ? `${kpis.best.symbol} · ${fmtR(kpis.best.r)}` : '—', tone: 'positive' },
    { label: 'Worst Trade', value: kpis.worst ? fmtUsd(kpis.worst.pnlPerContract) : '—', sub: kpis.worst ? `${kpis.worst.symbol} · ${fmtR(kpis.worst.r)}` : '—', tone: 'negative' },
    { label: 'Active Trackers', value: String(kpis.activeTrackers), sub: 'live positions', tone: kpis.activeTrackers > 0 ? 'warning' : 'neutral' },
  ];

  // ── Equity / period series — real realized outcomes in resolution order ───────
  const closedOrdered = useMemo(
    () => allRows
      .filter(r => r.status === 'CLOSED' && r.returnPct != null)
      .filter(r => (perfMode === 'r' ? r.r != null : r.pnlPerContract != null))
      .slice()
      .sort((a, b) => (a.resolveMs ?? a.sortMs) - (b.resolveMs ?? b.sortMs)),
    [allRows, perfMode],
  );
  const perfValue = (r: AuditRow): number => (perfMode === 'r' ? (r.r as number) : (r.pnlPerContract as number));
  const unitLabel = perfMode === 'r' ? 'R' : '$ / contract';

  const chartOption = useMemo(() => {
    if (closedOrdered.length === 0) return null;
    void themeMode;
    const posText = '#2f9d45'; // .slayer-pos — legible win
    const negText = '#d94646'; // .slayer-neg — legible loss
    const muted = cssVar('--text-muted', 'rgba(248,248,255,0.46)');
    const fmtVal = (v: number) => (perfMode === 'r' ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}R` : `${v < 0 ? '-' : '+'}$${Math.abs(v).toFixed(0)}`);

    if (perfTab === 'equity') {
      let acc = 0;
      const pts = closedOrdered.map((r, i) => {
        acc += perfValue(r);
        return { x: i + 1, y: acc, row: r };
      });
      const cats = pts.map(p => String(p.x));
      const vals = pts.map(p => p.y);
      const ends = vals[vals.length - 1] ?? 0;
      const lineCol = ends >= 0 ? posText : negText;
      return (echarts: any) => ({
        grid: { top: 18, right: 18, bottom: 26, left: 52 },
        tooltip: {
          trigger: 'axis',
          formatter: (ps: any) => {
            const p = Array.isArray(ps) ? ps[0] : ps;
            const row = pts[p.dataIndex]?.row;
            return `<span style="font-family:JetBrains Mono,monospace;font-size:11px">Trade #${p.name} · ${row?.symbol ?? ''} ${row?.contract ?? ''}<br/>Cumulative <b style="color:${p.value < 0 ? negText : posText}">${fmtVal(p.value)}</b><br/><span style="color:${muted}">${row?.time ?? ''}</span></span>`;
          },
        },
        xAxis: { type: 'category', data: cats, name: 'TRADE #', nameLocation: 'middle', nameGap: 20, nameTextStyle: { color: muted, fontSize: 9, fontWeight: 700 }, axisLabel: { fontSize: 9, color: muted } },
        yAxis: { type: 'value', name: unitLabel, nameTextStyle: { color: muted, fontSize: 9, fontWeight: 700, align: 'right' }, axisLabel: { fontSize: 9, color: muted, formatter: (v: number) => (perfMode === 'r' ? `${v.toFixed(1)}` : `$${Math.round(v)}`) }, splitLine: { lineStyle: { color: 'rgba(248,248,255,0.05)' } } },
        series: [{
          type: 'line', data: vals, showSymbol: false, smooth: false,
          lineStyle: { color: lineCol, width: 1.6 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: ends >= 0 ? 'rgba(47,157,69,0.28)' : 'rgba(217,70,70,0.28)' },
              { offset: 1, color: 'rgba(0,0,0,0)' },
            ]),
          },
          markLine: { silent: true, symbol: 'none', data: [{ yAxis: 0, lineStyle: { color: 'rgba(248,248,255,0.18)', type: 'dashed', width: 1 }, label: { show: false } }] },
        }],
      });
    }

    // Daily / Monthly buckets
    const keyOf = (r: AuditRow): string | null => {
      const ms = r.resolveMs ?? r.sortMs;
      if (!isFinite(ms) || ms <= 0) return null;
      const d = new Date(ms);
      return perfTab === 'daily'
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };
    const buckets = new Map<string, number>();
    for (const r of closedOrdered) {
      const k = keyOf(r);
      if (k == null) continue;
      buckets.set(k, (buckets.get(k) ?? 0) + perfValue(r));
    }
    const keys = Array.from(buckets.keys()).sort();
    const vals = keys.map(k => buckets.get(k) as number);
    return (_echarts: any) => ({
      grid: { top: 18, right: 18, bottom: 40, left: 52 },
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'shadow' },
        formatter: (ps: any) => { const p = Array.isArray(ps) ? ps[0] : ps; return `<span style="font-family:JetBrains Mono,monospace;font-size:11px">${p.name}<br/><b style="color:${p.value < 0 ? negText : posText}">${fmtVal(p.value)}</b></span>`; },
      },
      xAxis: { type: 'category', data: keys, axisLabel: { fontSize: 9, color: muted, rotate: perfTab === 'daily' ? 40 : 0, formatter: (v: string) => (perfTab === 'daily' ? v.slice(5) : v) } },
      yAxis: { type: 'value', name: `${perfTab === 'daily' ? 'DAILY' : 'MONTHLY'} ${unitLabel}`, nameTextStyle: { color: muted, fontSize: 9, fontWeight: 700, align: 'right' }, axisLabel: { fontSize: 9, color: muted, formatter: (v: number) => (perfMode === 'r' ? `${v.toFixed(1)}` : `$${Math.round(v)}`) }, splitLine: { lineStyle: { color: 'rgba(248,248,255,0.05)' } } },
      series: [{ type: 'bar', data: vals, barMaxWidth: 34, itemStyle: { borderRadius: 2, color: (p: any) => (p.value < 0 ? negText : posText) } }],
    });
  }, [closedOrdered, perfTab, perfMode, unitLabel, themeMode]);

  // Selecting a contract loads it into the analyzer and switches tabs (preserved).
  const loadContract = (contractStr: string) => {
    const parts = contractStr.trim().split(/\s+/);
    if (parts.length < 2) return;
    const ticker = parts[0];
    const contractRaw = parts[1];
    const strikeMatch = contractRaw.match(/(\d+)/);
    const typeMatch = contractRaw.match(/([CPcp])/);
    if (!strikeMatch || !typeMatch) return;
    const strike = parseInt(strikeMatch[0], 10);
    const optionIsCall = typeMatch[0].toUpperCase() === 'C';
    const asset = ASSET_LIST.find(a => a.ticker === ticker);
    if (!asset) return;
    const store = useContractStore.getState();
    store.selectContractAtomically(asset, strike, optionIsCall);
    store.setActiveTab('skyvision', true);
  };

  const handleReset = () => {
    if (!confirmReset) { setConfirmReset(true); return; }
    onClearTrades();
    setConfirmReset(false);
  };
  useEffect(() => {
    if (!confirmReset) return;
    const t = setTimeout(() => setConfirmReset(false), 4000);
    return () => clearTimeout(t);
  }, [confirmReset]);

  // ── Blotter columns (respecting the columns control) ──────────────────────────
  const statusBadge = (r: AuditRow) => (
    <StatusBadge tone={r.status === 'OPEN' ? 'warning' : r.outcome === 'win' ? 'positive' : r.outcome === 'loss' ? 'negative' : 'neutral'} dot={r.status === 'OPEN'}>
      {r.status === 'OPEN' ? 'OPEN' : r.outcome === 'win' ? 'WIN' : 'LOSS'}
    </StatusBadge>
  );

  const columns: Column<AuditRow>[] = useMemo(() => {
    const all: Record<ColKey, Column<AuditRow>> = {
      time: { key: 'time', header: 'Time', align: 'left', render: (r) => <span className="text-[var(--text-muted)] whitespace-nowrap">{r.time}</span> },
      symbol: { key: 'symbol', header: 'Symbol', align: 'left', render: (r) => (
        <span className="inline-flex items-center gap-1.5">
          {r.direction === 'BULLISH' ? <TrendingUp className="w-3 h-3 text-[#2f9d45]" /> : <TrendingDown className="w-3 h-3 text-[#d94646]" />}
          <span className="font-semibold text-[var(--text-primary)]">{r.symbol}</span>
        </span>
      ) },
      setup: { key: 'setup', header: 'Setup', align: 'left', render: (r) => <span className="text-[var(--text-secondary)] block max-w-[150px] truncate" title={r.setup}>{r.setup}</span> },
      contract: { key: 'contract', header: 'Contract', align: 'left', render: (r) => <span className="font-semibold text-[var(--text-primary)] whitespace-nowrap">{r.contract}</span> },
      entry: { key: 'entry', header: 'Entry', align: 'right', render: (r) => <span className="slayer-num">{fmtPrem(r.entry)}</span> },
      exit: { key: 'exit', header: 'Exit / Cur', align: 'right', render: (r) => <span className="slayer-num text-[var(--text-secondary)]">{fmtPrem(r.exitOrCurrent)}</span> },
      status: { key: 'status', header: 'Status', align: 'center', render: statusBadge },
      r: { key: 'r', header: 'R', align: 'right', render: (r) => <span className={`slayer-num font-semibold ${signClass(r.r)}`}>{fmtR(r.r)}</span> },
      pnl: { key: 'pnl', header: 'PnL', align: 'right', render: (r) => (
        <span className={`slayer-num font-semibold ${signClass(r.realized ? r.pnlPerContract : null)}`} title="per contract">
          {r.realized ? fmtUsd(r.pnlPerContract) : <span className="text-[var(--text-faint)]">{fmtUsd(r.pnlPerContract)}<span className="text-[8px] align-super"> u</span></span>}
        </span>
      ) },
      notes: { key: 'notes', header: '', align: 'center', render: (r) => <StickyNote className={`w-3.5 h-3.5 inline ${r.hasNotes ? 'text-[var(--text-secondary)]' : 'text-[var(--text-faint)]'}`} /> },
    };
    return COLUMN_DEFS.filter(c => visibleCols.has(c.key)).map(c => all[c.key]);
  }, [visibleCols]);

  const toggleCol = (k: ColKey) => {
    const def = COLUMN_DEFS.find(c => c.key === k);
    if (def?.locked) return;
    setVisibleCols(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  const anyTracked = trackedCount > 0;
  const nowLabel = useMemo(
    () => new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trades, trackedVisible.length],
  );

  return (
    <div className="slayer-terminal w-full font-mono select-none antialiased space-y-3 p-0.5" id="quant-audit-view">
      {/* ─────────────── HEADER ─────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <span className="text-[10px] text-[var(--text-muted)] font-semibold tracking-[0.2em] uppercase block">Trade History</span>
          <h1 className="text-[18px] font-bold text-[var(--text-primary)] tracking-tight">Auditor · Trade Record</h1>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge tone="neutral" dot>{nowLabel}</StatusBadge>
          <button
            onClick={handleReset}
            className={`flex items-center gap-1.5 rounded-[var(--radius-control)] border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] transition-colors cursor-pointer focus:outline-none focus-visible:border-[var(--border-strong)] ${
              confirmReset
                ? 'border-[var(--slayer-red)]/60 bg-[var(--negative-soft)] text-[#d94646]'
                : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-mid)] hover:text-[var(--text-primary)]'
            }`}
          >
            {confirmReset ? <Check className="w-3 h-3" /> : <RotateCcw className="w-3 h-3" />}
            {confirmReset ? 'Confirm reset' : 'Reset session'}
          </button>
        </div>
      </div>

      {/* ─────────────── 1. TOP KPI STRIP ─────────────── */}
      <MetricStrip metrics={topMetrics} />

      {/* ─────────────── Tracked-setup performance (Live vs Model — never mixed) ─────────────── */}
      {anyTracked && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <StatBlock title="Live tracks" icon={<Radio className="w-3 h-3" />} stats={liveStats} live />
          <StatBlock
            title="Model / Sample" icon={<FlaskConical className="w-3 h-3" />} stats={modelStats} live={false}
            action={liveStats.resolved + modelStats.resolved > 0 ? (
              <button onClick={clearResolved} className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:underline rounded transition-colors">Clear resolved</button>
            ) : undefined}
          />
        </div>
      )}

      {/* ─────────────── 2. MAIN TWO-COLUMN GRID ─────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-3 items-start">
        {/* LEFT — TRADES BLOTTER */}
        <TerminalPanel
          title="Trades"
          subtitle={`${filteredRows.length} of ${allRows.length} · archive + tracked setups`}
          actions={
            <div className="relative">
              <button
                onClick={() => setColMenuOpen(o => !o)}
                aria-label="Toggle columns"
                className="flex items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[#050505] px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-mid)] transition-colors cursor-pointer focus:outline-none focus-visible:border-[var(--border-strong)]"
              >
                <Columns3 className="w-3.5 h-3.5" /> Columns
              </button>
              {colMenuOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setColMenuOpen(false)} />
                  <div className="absolute right-0 z-30 mt-1 w-44 rounded-[var(--radius-control)] border border-[var(--border-mid)] bg-[var(--bg-panel-raised)] p-1.5 shadow-xl">
                    {COLUMN_DEFS.map(c => (
                      <button
                        key={c.key}
                        onClick={() => toggleCol(c.key)}
                        disabled={c.locked}
                        className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors ${c.locked ? 'cursor-default text-[var(--text-faint)]' : 'cursor-pointer text-[var(--text-secondary)] hover:bg-[rgba(248,248,255,0.04)] hover:text-[var(--text-primary)]'}`}
                      >
                        {c.label}
                        {visibleCols.has(c.key) && <Check className="w-3 h-3 text-[#2f9d45]" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          }
          bodyClassName="flex flex-col gap-2.5"
        >
          {/* Controls: search + setup + status */}
          <div className="flex flex-col sm:flex-row gap-2">
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search symbol, contract, setup…"
                className="slayer-control w-full pl-8 pr-8 placeholder:text-[var(--text-faint)] focus:outline-none focus-visible:border-[var(--border-strong)]"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[#d94646] cursor-pointer">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </label>
            <select value={setupFilter} onChange={(e) => setSetupFilter(e.target.value)} className="slayer-control slayer-num cursor-pointer focus:outline-none focus-visible:border-[var(--border-strong)] max-w-[150px]">
              <option value="ALL">All setups</option>
              {setupOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="slayer-control slayer-num cursor-pointer focus:outline-none focus-visible:border-[var(--border-strong)]">
              <option value="ALL">All status</option>
              <option value="OPEN">Open</option>
              <option value="CLOSED">Closed</option>
              <option value="WINS">Wins</option>
              <option value="LOSSES">Losses</option>
            </select>
          </div>

          <DataTable<AuditRow>
            columns={columns}
            rows={filteredRows}
            rowKey={(r) => r.id}
            onRowClick={(r) => selectRow(r.id)}
            rowClassName={(r) => (r.id === selectedId ? 'bg-[rgba(248,248,255,0.05)]' : undefined)}
            empty={
              allRows.length === 0
                ? 'No trades yet — track a setup in SkyVision or Pinpoint, or wait for the archive to log a trade.'
                : 'No trades match these filters.'
            }
          />
          <div className="text-[9px] text-[var(--text-muted)] tracking-wide">
            PnL &amp; Best/Worst are stated per 1 contract (position size isn&apos;t recorded). Open-trade PnL is unrealized (marked <span className="text-[var(--text-faint)]">u</span>).
          </div>
        </TerminalPanel>

        {/* RIGHT — SELECTED TRADE */}
        <TerminalPanel
          title="Selected Trade"
          actions={
            <div className="flex items-center gap-1">
              <button onClick={() => stepSelection(-1)} disabled={filteredRows.length === 0} aria-label="Previous trade" className="rounded border border-[var(--border-subtle)] p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-mid)] disabled:opacity-40 cursor-pointer focus:outline-none focus-visible:border-[var(--border-strong)]"><ChevronLeft className="w-3.5 h-3.5" /></button>
              <span className="text-[9px] text-[var(--text-muted)] slayer-num w-10 text-center">{selectedIdx >= 0 ? `${selectedIdx + 1}/${filteredRows.length}` : '—'}</span>
              <button onClick={() => stepSelection(1)} disabled={filteredRows.length === 0} aria-label="Next trade" className="rounded border border-[var(--border-subtle)] p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-mid)] disabled:opacity-40 cursor-pointer focus:outline-none focus-visible:border-[var(--border-strong)]"><ChevronRight className="w-3.5 h-3.5" /></button>
            </div>
          }
          bodyClassName="p-0"
        >
          {selected ? (
            <SelectedTradePanel row={selected} onCancel={cancelTracked} onLoad={loadContract} />
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <Activity className="w-6 h-6 text-[var(--text-faint)]" />
              <p className="text-[11px] text-[var(--text-muted)] tracking-wide max-w-[220px]">Select a trade from the blotter to inspect its thesis, target ladder and result.</p>
            </div>
          )}
        </TerminalPanel>
      </div>

      {/* ─────────────── 3. PERFORMANCE OVER TIME ─────────────── */}
      <TerminalPanel
        title="Performance Over Time"
        subtitle="Cumulative of real realized outcomes, in resolution order"
        actions={
          <div className="flex items-center gap-1.5">
            <div className="flex rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[#050505] p-0.5">
              {([['pnl', 'Cumulative'], ['r', 'R Multiple']] as const).map(([k, label]) => (
                <button key={k} onClick={() => setPerfMode(k)} className={`px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] rounded transition-colors cursor-pointer focus:outline-none ${perfMode === k ? 'bg-[rgba(248,248,255,0.08)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}>{label}</button>
              ))}
            </div>
            <div className="flex rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[#050505] p-0.5">
              {([['equity', 'Equity'], ['daily', 'Daily'], ['monthly', 'Monthly']] as const).map(([k, label]) => (
                <button key={k} onClick={() => setPerfTab(k)} className={`px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] rounded transition-colors cursor-pointer focus:outline-none ${perfTab === k ? 'bg-[rgba(248,248,255,0.08)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}>{label}</button>
              ))}
            </div>
          </div>
        }
      >
        {chartOption ? (
          <>
            <div style={{ height: 300 }}>
              <EChart option={chartOption} notMerge style={{ width: '100%', height: '100%' }} />
            </div>
            <div className="flex items-center justify-between gap-2 pt-2 text-[9px] text-[var(--text-muted)] tracking-wide">
              <span>{closedOrdered.length} closed trade{closedOrdered.length === 1 ? '' : 's'} · unit: {unitLabel}</span>
              <span>{perfMode === 'r' ? 'R = return ÷ planned risk (1R)' : 'Per-contract $ = premium move × 100'}</span>
            </div>
          </>
        ) : (
          <div className="flex items-start gap-3 py-3">
            <span className="mt-1 w-1.5 h-1.5 shrink-0 rounded-full bg-[var(--warning)] animate-pulse" />
            <div className="min-w-0">
              <div className="text-[10px] slayer-num tracking-[0.16em] text-[var(--text-muted)] font-semibold uppercase">Awaiting closed trades</div>
              <p className="text-[10px] text-[var(--text-faint)] tracking-wide mt-1 max-w-[520px] leading-relaxed">
                The equity curve builds from real realized outcomes — close a tracked setup or log a resolved archive trade to populate it. No series is drawn from open positions.
              </p>
            </div>
          </div>
        )}
      </TerminalPanel>

      {/* ─────────────── FOOTER ─────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-1 pt-1 text-[9px] text-[var(--text-muted)] tracking-wide">
        <span>Disclaimer: For informational purposes only. Not investment advice.</span>
        <span>{kpis.total} logged · Live tracks & model/sample kept separate</span>
        <span className="font-bold tracking-[0.16em] text-[var(--text-secondary)]">REAL-SLAYER</span>
      </div>
    </div>
  );
}

// ── Live/Model stat block (terminal-styled, live-vs-model separation) ──────────
function StatBlock({ title, icon, stats, live, action }: { title: string; icon: React.ReactNode; stats: TrackStats; live: boolean; action?: React.ReactNode }) {
  const accent = live ? 'text-[#2f9d45]' : 'text-[var(--pin)]';
  const cells: { label: string; value: string; cls?: string }[] = [
    { label: 'Win rate', value: stats.winRate == null ? '—' : `${stats.winRate}%` },
    { label: 'Record', value: `${stats.wins}-${stats.losses}` },
    { label: 'Active', value: String(stats.active) },
    { label: 'Avg result', value: stats.avgReturnPct == null ? '—' : `${stats.avgReturnPct >= 0 ? '+' : ''}${stats.avgReturnPct.toFixed(1)}%`, cls: signClass(stats.avgReturnPct) },
  ];
  return (
    <div className="slayer-panel p-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
          <span className={accent} aria-hidden="true">{icon}</span>{title}
        </span>
        {action ?? (!live && <span className="text-[8px] font-bold uppercase tracking-widest text-[var(--pin)]">Not live performance</span>)}
      </div>
      <div className="mt-2.5 grid grid-cols-4 gap-2">
        {cells.map(c => (
          <div key={c.label}>
            <span className="block text-[8px] uppercase tracking-widest text-[var(--text-muted)]">{c.label}</span>
            <span className={`block text-[16px] font-bold slayer-num ${c.cls ?? 'text-[var(--text-primary)]'}`}>{c.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Selected-trade rail ─────────────────────────────────────────────────────────
function DetailStat({ label, value, cls, sub }: { label: string; value: React.ReactNode; cls?: string; sub?: string }) {
  return (
    <div className="min-w-0 px-3 py-2 border-b border-r border-[var(--border-subtle)]">
      <div className="text-[8px] uppercase tracking-[0.16em] text-[var(--text-muted)] truncate">{label}</div>
      <div className={`mt-0.5 text-[13px] font-semibold slayer-num leading-tight ${cls ?? 'text-[var(--text-primary)]'}`}>{value}</div>
      {sub && <div className="text-[8px] text-[var(--text-faint)] tracking-wide truncate">{sub}</div>}
    </div>
  );
}

function LabelBadge({ children }: { children: React.ReactNode }) {
  return <span className="rounded border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">{children}</span>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)] mb-1.5">{children}</div>;
}

function SelectedTradePanel({ row, onCancel, onLoad }: { row: AuditRow; onCancel: (id: string) => void; onLoad: (c: string) => void }) {
  const t = row.archive;
  const s = row.tracked;
  const open = row.status === 'OPEN';

  // Thesis (real fields only).
  const thesis = useMemo(() => {
    if (t) {
      return `${t.recommendation} · ${t.structureState}. ${t.vwapState}, ${t.rsiState}. ${t.dealerPositioning}. Model: +${t.expectedReturn}% expected return vs -${t.expectedDrawdown}% expected drawdown · P(win) ${t.probabilityPositive}% · stability ${t.thesisStability}%.`;
    }
    if (s) {
      const bits = [s.dealerReason, s.volatilityReason].filter(x => x && x !== '—');
      const extra = [
        `Setup score ${s.setupScore}`, `confidence ${s.confidence}%`,
        s.fairValue != null ? `fair value $${s.fairValue.toFixed(2)}` : null,
        s.expectedMovePct != null ? `expected move ±${s.expectedMovePct.toFixed(1)}%` : null,
        `liquidity ${s.liquidityGrade}`,
      ].filter(Boolean).join(' · ');
      return `${bits.join('. ')}${bits.length ? '. ' : ''}${extra}.`;
    }
    return '';
  }, [t, s]);

  // Target ladder (real). Archive → T1–T4 (targets + stretch). Tracked → single target-gain rung.
  const ladder = useMemo(() => {
    if (t) {
      const risk = row.riskPct;
      const rows = [
        { label: 'T4', price: t.stretchTarget, hit: t.stretchTargetHit, time: t.stretchTargetHitTime },
        { label: 'T3', price: t.target3, hit: t.target3Hit, time: t.target3HitTime },
        { label: 'T2', price: t.target2, hit: t.target2Hit, time: t.target2HitTime },
        { label: 'T1', price: t.target1, hit: t.target1Hit, time: t.target1HitTime },
      ];
      return rows.map(r => {
        const retPct = t.entryPrice > 0 ? ((r.price - t.entryPrice) / t.entryPrice) * 100 : null;
        return { ...r, r: rMultiple(retPct, risk) };
      });
    }
    if (s && s.expectedMovePct != null) {
      const gain = Math.max(15, Math.min(300, s.expectedMovePct));
      const price = s.premiumAtTrack * (1 + gain / 100);
      return [{ label: 'T1', price, hit: s.targetReached, time: null, r: rMultiple(gain, row.riskPct) }];
    }
    return [];
  }, [t, s, row.riskPct]);

  const stop = useMemo(() => {
    if (t) return { level: `$${t.stopLoss.toFixed(2)}`, breached: row.outcome === 'loss', label: 'Premium stop' };
    if (s && s.invalidationLevel != null) return { level: s.invalidationLevel.toLocaleString('en-US', { maximumFractionDigits: 0 }), breached: s.invalidationTouched, label: 'Invalidation (spot)' };
    return null;
  }, [t, s, row.outcome]);

  const maxR = rMultiple(row.maxGainPct, row.riskPct);
  const maxAdverseR = rMultiple(row.maxAdversePct, row.riskPct);

  // Tags — real provenance + regime, deduped.
  const tags = useMemo(() => {
    const out: string[] = [row.optionType === 'C' ? 'CALL' : 'PUT'];
    if (t) { out.push('SERVER ARCHIVE'); if (t.gexState) out.push(t.gexState); if (t.rvolState) out.push(t.rvolState); }
    if (s) { out.push(trackModeLabel(s.dataMode)); out.push(s.source === 'skyvision' ? 'SKYVISION' : 'PINPOINT'); if (s.liquidityGrade && s.liquidityGrade !== '—') out.push(`LIQ ${s.liquidityGrade}`); }
    return Array.from(new Set(out));
  }, [row, t, s]);

  const notes = useMemo(() => {
    if (t) return t.failureReasons && t.failureReasons.length ? t.failureReasons : [];
    if (s) return [s.dealerReason, s.volatilityReason].filter(x => x && x !== '—');
    return [];
  }, [t, s]);

  const canCancel = !!s && !isTerminal(s.status);

  return (
    <div className="divide-y divide-[var(--border-subtle)]">
      {/* Identity + headline R / PnL */}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {row.direction === 'BULLISH' ? <TrendingUp className="w-4 h-4 text-[#2f9d45]" /> : <TrendingDown className="w-4 h-4 text-[#d94646]" />}
              <span className="text-[15px] font-bold text-[var(--text-primary)] truncate">{row.contract}</span>
              <StatusBadge tone={open ? 'warning' : row.outcome === 'win' ? 'positive' : 'negative'} dot={open}>{open ? 'OPEN' : row.outcome === 'win' ? 'WIN' : 'LOSS'}</StatusBadge>
            </div>
            <div className="mt-0.5 text-[10px] text-[var(--text-muted)] tracking-wide truncate">{row.symbol} · {row.setup} · {row.time}</div>
          </div>
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <div className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] px-3 py-2">
            <div className="text-[8px] uppercase tracking-[0.16em] text-[var(--text-muted)]">{open ? 'Return (open)' : 'Return R'}</div>
            <div className={`text-[20px] font-bold slayer-num leading-tight ${signClass(row.r)}`}>{fmtR(row.r)}</div>
            <div className={`text-[9px] slayer-num ${signClass(row.returnPct)}`}>{fmtPct(row.returnPct)}{open ? ' unrealized' : ''}</div>
          </div>
          <div className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] px-3 py-2">
            <div className="text-[8px] uppercase tracking-[0.16em] text-[var(--text-muted)]">{open ? 'PnL (unreal.)' : 'PnL'}<span className="text-[var(--text-faint)]"> /contract</span></div>
            <div className={`text-[20px] font-bold slayer-num leading-tight ${signClass(row.pnlPerContract)}`}>{fmtUsd(row.pnlPerContract)}</div>
            <div className="text-[9px] text-[var(--text-faint)] slayer-num">1 contract ×100</div>
          </div>
        </div>
      </div>

      {/* Entry / Current / Risk */}
      <div className="grid grid-cols-3 border-t border-l border-[var(--border-subtle)]">
        <DetailStat label="Entry" value={fmtPrem(row.entry)} />
        <DetailStat label={open ? 'Current' : 'Exit'} value={fmtPrem(row.exitOrCurrent)} cls="text-[var(--text-secondary)]" />
        <DetailStat label="Risk (1R)" value={row.riskPct == null ? '—' : `-${row.riskPct.toFixed(1)}%`} cls="text-[#d94646]" sub={stop ? stop.label : undefined} />
      </div>

      {/* Thesis */}
      {thesis && (
        <div className="p-3">
          <SectionTitle>Thesis</SectionTitle>
          <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">{thesis}</p>
        </div>
      )}

      {/* Target ladder */}
      {ladder.length > 0 && (
        <div className="p-3">
          <SectionTitle>Target Ladder</SectionTitle>
          <div className="space-y-1">
            {ladder.map((l) => (
              <div key={l.label} className="flex items-center gap-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] px-2 py-1.5">
                <span className="w-6 text-[9px] font-bold text-[var(--text-muted)]">{l.label}</span>
                <span className="slayer-num text-[11px] font-semibold text-[var(--text-primary)]">${l.price.toFixed(2)}</span>
                <span className={`slayer-num text-[10px] ml-auto ${signClass(l.r)}`}>{fmtR(l.r)}</span>
                {l.hit ? (
                  <span className="rounded border border-[#2f9d45]/40 bg-[var(--positive-soft)] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-[#2f9d45]">Hit{typeof l.time === 'number' ? ` ${l.time}m` : ''}</span>
                ) : (
                  <span className="text-[8px] font-bold uppercase tracking-widest text-[var(--text-faint)]">Pending</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stop */}
      {stop && (
        <div className="p-3">
          <SectionTitle>Stop</SectionTitle>
          <div className="flex items-center gap-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] px-2 py-1.5">
            <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">{stop.label}</span>
            <span className="slayer-num text-[11px] font-semibold text-[var(--text-primary)]">{stop.level}</span>
            <span className="slayer-num text-[10px] ml-auto text-[#d94646]">-1.00R</span>
            {stop.breached
              ? <span className="rounded border border-[var(--slayer-red)]/50 bg-[var(--negative-soft)] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-[#d94646]">Breached</span>
              : <span className="text-[8px] font-bold uppercase tracking-widest text-[var(--text-faint)]">{open ? 'Live' : 'Held'}</span>}
          </div>
        </div>
      )}

      {/* Result summary */}
      <div className="p-3">
        <SectionTitle>Result Summary</SectionTitle>
        <div className="grid grid-cols-3 border-t border-l border-[var(--border-subtle)]">
          <DetailStat label="Max R" value={fmtR(maxR)} cls={signClass(maxR)} />
          <DetailStat label="Max Adverse R" value={fmtR(maxAdverseR)} cls={signClass(maxAdverseR)} />
          <DetailStat label="Current R" value={fmtR(row.r)} cls={signClass(row.r)} />
          <DetailStat label="Realized PnL" value={row.realized ? fmtUsd(row.pnlPerContract) : '—'} cls={row.realized ? signClass(row.pnlPerContract) : 'text-[var(--text-faint)]'} sub="per contract" />
          <DetailStat label="Fees" value="—" cls="text-[var(--text-faint)]" sub="not tracked" />
          <DetailStat label="Net PnL" value={row.realized ? fmtUsd(row.pnlPerContract) : '—'} cls={row.realized ? signClass(row.pnlPerContract) : 'text-[var(--text-faint)]'} sub="= realized (fees n/a)" />
        </div>
      </div>

      {/* Journal notes */}
      <div className="p-3">
        <SectionTitle>Journal Notes</SectionTitle>
        {notes.length ? (
          <ul className="space-y-1 text-[11px] leading-relaxed text-[var(--text-secondary)]">
            {notes.map((n, i) => <li key={i} className="flex gap-2"><span className="text-[var(--text-faint)] select-none">•</span><span>{n}</span></li>)}
          </ul>
        ) : (
          <p className="text-[11px] text-[var(--text-faint)]">No exit notes recorded for this trade.</p>
        )}
      </div>

      {/* Tags */}
      <div className="p-3">
        <SectionTitle>Tags</SectionTitle>
        <div className="flex flex-wrap gap-1.5">{tags.map(tag => <LabelBadge key={tag}>{tag}</LabelBadge>)}</div>
      </div>

      {/* Actions */}
      <div className="p-3 flex flex-col gap-2">
        <button
          onClick={() => onLoad(row.contract)}
          className="flex items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[#050505] py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-mid)] transition-colors cursor-pointer focus:outline-none focus-visible:border-[var(--border-strong)]"
        >
          <ArrowUpRight className="w-3.5 h-3.5" /> Load contract in analyzer
        </button>
        {canCancel && (
          <button
            onClick={() => onCancel(row.id)}
            className="flex items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--slayer-red)]/40 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#d94646] hover:bg-[var(--negative-soft)] transition-colors cursor-pointer focus:outline-none focus-visible:border-[var(--border-strong)]"
          >
            <X className="w-3.5 h-3.5" /> Stop tracking
          </button>
        )}
      </div>
    </div>
  );
}
