import React, { useMemo, useState } from 'react';
import {
  Activity,
  Crosshair,
  Layers,
  ListTree,
  Radio,
  StickyNote,
  Target,
  TrendingDown,
  TrendingUp,
  Waves,
} from 'lucide-react';
import { useContractStore } from '../lib/store';
import {
  useTrackingStore,
  STATUS_LABEL,
  isTerminal,
  type TrackStatus,
  type TrackedSetup,
} from '../lib/trackedSetups';
import { ASSET_LIST } from '../data';
import { fmtNum } from '../lib/format';
import { AssetInfo } from '../types';
import { TerminalPanel } from './ui/terminal/TerminalPanel';
import { MetricStrip, type Metric } from './ui/terminal/MetricStrip';
import { DataTable, type Column } from './ui/terminal/DataTable';
import { StatusBadge, type BadgeTone } from './ui/terminal/StatusBadge';
import { InteractiveChart } from './InteractiveChart';
import { TerminalShell } from './layout/TerminalShell';
import { TerminalSidebar } from './layout/TerminalSidebar';
import { TerminalTopBar } from './layout/TerminalTopBar';

/** Live wall-clock for the top bar (real time, ticking each second). */
function useClock(): string {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}

/**
 * SlayerHomeTerminal — the authenticated-user Home dashboard.
 *
 * Every figure is read from the LIVE store: `useContractStore.serverState` (the streamed
 * market payload — GEX profile, expected move, dealer dynamics, strike gravity, quant edge,
 * sky-vision ranking, discovery) and `useTrackingStore` (the user's real tracked setups).
 * Nothing is hardcoded: any genuinely-absent field renders as "—". Guests still get the
 * marketing <SlayerIntro/> — this view is gated to authenticated sessions in App.tsx.
 */

// ── small pure helpers ────────────────────────────────────────────────────────
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const isNum = (v: unknown): v is number => typeof v === 'number' && isFinite(v);

/** Format a price/strike with thousands separators; "—" when absent. */
const fmtLevel = (v: unknown, decimals?: number): string => {
  if (!isNum(v)) return '—';
  const d = decimals ?? (Number.isInteger(v) ? 0 : 2);
  return fmtNum(v, d);
};
/** Signed percentage of `v` relative to `spot`; "—" when either is missing. */
const signedPct = (v: unknown, spot: unknown): string => {
  if (!isNum(v) || !isNum(spot) || spot === 0) return '—';
  const p = ((v - spot) / spot) * 100;
  return `${p >= 0 ? '+' : ''}${p.toFixed(2)}%`;
};
const pctVal = (v: unknown, spot: unknown): number | null => {
  if (!isNum(v) || !isNum(spot) || spot === 0) return null;
  return ((v - spot) / spot) * 100;
};
/** Net-GEX rendered in billions of $ notional. */
const fmtBn = (v: unknown): string => {
  if (!isNum(v)) return '—';
  const bn = v / 1e9;
  return `${bn >= 0 ? '+' : '−'}$${Math.abs(bn).toFixed(2)}B`;
};

// ── strength bar ───────────────────────────────────────────────────────────────
function StrengthBar({ pct, tone }: { pct: number | null; tone: string }) {
  const w = pct == null ? 0 : clamp(pct, 0, 100);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--border-subtle)]">
      <div className="h-full rounded-full" style={{ width: `${w}%`, background: tone }} />
    </div>
  );
}

// tracked-setup status → brand badge tone (never color alone: STATUS_LABEL supplies the word).
const trackTone = (s: TrackStatus): BadgeTone =>
  s === 'RESOLVED_WIN' ? 'positive'
    : s === 'RESOLVED_LOSS' || s === 'INVALIDATED' ? 'negative'
      : s === 'EXPIRED' ? 'warning'
        : s === 'ACTIVE' || s === 'TRACKED' ? 'pin'
          : 'neutral';

type OppRow = {
  id: string;
  ticker: string;
  setup: string;
  isCall: boolean;
  level: number | null;
  price: number | null;
  conf: number | null;
  status: string;
  ts: number | null;
  category: 'BREAKOUTS' | 'REVERSALS' | 'GAMMA PLAYS' | 'EARNINGS';
  asset: AssetInfo;
};

const OPP_FILTERS = ['ALL', 'BREAKOUTS', 'REVERSALS', 'GAMMA PLAYS', 'EARNINGS'] as const;
type OppFilter = (typeof OPP_FILTERS)[number];

const TF_OPTS: { label: string; val: string }[] = [
  { label: '5m', val: '5m' },
  { label: '15m', val: '15m' },
  { label: '1H', val: '1h' },
  { label: '1D', val: '1D' },
];

type HomeNote = { id: string; text: string; ts: number };
const NOTES_KEY = 'slayer.homeNotes.v1';
const loadNotes = (): HomeNote[] => {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(NOTES_KEY) : null;
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export default function SlayerHomeTerminal() {
  const rawServerState = useContractStore((s) => s.serverState);
  const selectedAsset = useContractStore((s) => s.selectedAsset);
  const selectedTimeframe = useContractStore((s) => s.selectedTimeframe);
  const setSelectedTimeframe = useContractStore((s) => s.setSelectedTimeframe);
  const activeTab = useContractStore((s) => s.activeTab);
  const setActiveTab = useContractStore((s) => s.setActiveTab);
  const clock = useClock();

  // Only trust the stream once it matches the ticker in view (same guard SlayerIntro /
  // DealerFlowView use) so switching assets never paints the prior ticker's dealer data.
  const serverState: any = useMemo(() => {
    if (!rawServerState) return null;
    const t = rawServerState.contract?.replace('-', ' ').split(' ')[0];
    return t === selectedAsset.ticker ? rawServerState : null;
  }, [rawServerState, selectedAsset.ticker]);

  const setups = useTrackingStore((s) => s.setups);

  const [oppFilter, setOppFilter] = useState<OppFilter>('ALL');
  const [notes, setNotes] = useState<HomeNote[]>(loadNotes);
  const [noteInput, setNoteInput] = useState('');

  const addNote = () => {
    const text = noteInput.trim();
    if (!text) return;
    const next = [{ id: `n_${Date.now().toString(36)}`, text, ts: Date.now() }, ...notes].slice(0, 50);
    setNotes(next);
    setNoteInput('');
    try { window.localStorage.setItem(NOTES_KEY, JSON.stringify(next)); } catch { /* quota */ }
  };

  // ── derive the live read ──────────────────────────────────────────────────────
  const d = useMemo(() => {
    const gp = serverState?.gex_profile ?? null;
    const candles: any[] = serverState?.candles ?? [];
    const spot: number | null = isNum(gp?.spot)
      ? gp.spot
      : isNum(serverState?.pinpoint_map?.spot_price)
        ? serverState.pinpoint_map.spot_price
        : candles.length ? candles[candles.length - 1].close : null;

    const netGex: number | null = isNum(gp?.netGex) ? gp.netGex : null;
    const callWall: number | null = isNum(gp?.callWall) ? gp.callWall : null;
    const putWall: number | null = isNum(gp?.putWall) ? gp.putWall : null;
    const gammaFlip: number | null = isNum(gp?.gammaFlip) ? gp.gammaFlip : null;
    const magnet: number | null = isNum(gp?.magnet) ? gp.magnet : null;
    const king: number | null = isNum(serverState?.strike_gravity?.primary?.strike)
      ? serverState.strike_gravity.primary.strike
      : null;

    const emPct: number | null = isNum(gp?.expectedMovePct) ? gp.expectedMovePct : null; // fraction
    const emPts: number | null = emPct != null && spot != null ? spot * emPct : null;

    // Window change from the real candle series (first open → last close).
    let changeAbs: number | null = null;
    let changePctV: number | null = null;
    if (candles.length >= 2 && isNum(candles[0].open) && spot != null) {
      changeAbs = spot - candles[0].open;
      changePctV = candles[0].open ? (changeAbs / candles[0].open) * 100 : null;
    }

    // Market control (dealer-control composite) — replicates the DealerFlow header engine.
    let controlScore: number | null = null;
    let positiveGamma = false;
    if (netGex != null && spot != null) {
      positiveGamma = netGex >= 0;
      const pin = magnet ?? gammaFlip;
      const em = (emPct ?? 0) || 0.01;
      let pinRiskPct: number | null = null;
      if (pin != null && spot) {
        const distFrac = Math.abs(spot - pin) / spot;
        pinRiskPct = clamp(95 - (distFrac / em) * 65, 5, 95);
      }
      const gammaPts = positiveGamma ? 55 : 25;
      const pinPts = pinRiskPct != null ? (pinRiskPct / 100) * 30 : 15;
      const calmPts = Math.max(0, 15 - Math.min(15, em * 100 * 3));
      controlScore = clamp(Math.round(gammaPts + pinPts + calmPts), 0, 100);
    }

    // Market-summary extras.
    const totalCallOi: number | null = isNum(gp?.totalCallOi) ? gp.totalCallOi : null;
    const totalPutOi: number | null = isNum(gp?.totalPutOi) ? gp.totalPutOi : null;
    const putCall = totalCallOi && totalPutOi != null && totalCallOi > 0 ? totalPutOi / totalCallOi : null;

    let optVolume = 0;
    for (const s of gp?.strikes ?? []) optVolume += (s.callVolume || 0) + (s.putVolume || 0);
    if (optVolume === 0) for (const c of candles) optVolume += c.volume || 0;
    const volume = optVolume > 0 ? optVolume : null;

    let adv = 0, dec = 0;
    for (const c of candles) { if (c.close > c.open) adv++; else if (c.close < c.open) dec++; }

    const vix: number | null = isNum(serverState?.liveSpotPrices?.VIX) ? serverState.liveSpotPrices.VIX : null;
    const skew = serverState?.quant_edge?.skew ?? null; // { riskReversal25, bias, ... }
    const rv: number | null = isNum(serverState?.quant_edge?.realizedVol?.primary)
      ? serverState.quant_edge.realizedVol.primary
      : null;
    const gammaState: string | null = serverState?.dealer_dynamics?.gamma?.state ?? null;

    const bias: string = serverState?.sky_vision?.direction
      ?? serverState?.dealer_flow?.bias
      ?? 'NEUTRAL';
    const expiryLabel: string | null = gp?.expiryLabel ?? null;
    const systemScore: number | null = isNum(serverState?.system_score?.total)
      ? Math.round(serverState.system_score.total)
      : null;

    // Feed provenance.
    const dataSource: string = serverState?.data_source ?? '';
    const chainLive: boolean = !!serverState?.chain_live;
    const feed: { value: string; sub: string; tone: Metric['tone'] } = (() => {
      if (!serverState) return { value: '—', sub: 'Awaiting frame', tone: 'warning' };
      if (chainLive || dataSource.startsWith('LIVE')) return { value: 'Normal', sub: 'Live feed', tone: 'positive' };
      if (dataSource === 'SANDBOX_SYNTHETIC') return { value: 'Sim', sub: 'Model feed', tone: 'warning' };
      return { value: 'Delayed', sub: dataSource || 'Model feed', tone: 'warning' };
    })();

    // Strike-gravity strength map for the KEY LEVELS bars.
    const ranked: any[] = serverState?.strike_gravity?.ranked ?? [];
    const gravityAt = (price: number | null): number | null => {
      if (price == null || !ranked.length) return null;
      let best: any = null; let bestD = Infinity;
      for (const r of ranked) {
        const dd = Math.abs(r.strike - price);
        if (dd < bestD) { bestD = dd; best = r; }
      }
      return best && isNum(best.gravityScore) ? best.gravityScore * 100 : null;
    };

    return {
      gp, candles, spot, netGex, callWall, putWall, gammaFlip, magnet, king,
      emPct, emPts, changeAbs, changePctV, controlScore, positiveGamma,
      putCall, volume, adv, dec, vix, skew, rv, gammaState, bias, expiryLabel,
      systemScore, feed, gravityAt,
    };
  }, [serverState]);

  const dec = selectedAsset.decimals ?? 2;

  // ── METRIC STRIP (8) ────────────────────────────────────────────────────────
  const metrics: Metric[] = useMemo(() => {
    const spotTone: Metric['tone'] = d.changeAbs == null ? 'neutral' : d.changeAbs >= 0 ? 'positive' : 'negative';
    const spotSub = d.changeAbs == null
      ? '—'
      : `${d.changeAbs >= 0 ? '+' : ''}${d.changeAbs.toFixed(2)} (${d.changePctV != null ? `${d.changePctV >= 0 ? '+' : ''}${d.changePctV.toFixed(2)}%` : '—'})`;
    return [
      { label: 'Net GEX', value: fmtBn(d.netGex), sub: d.netGex == null ? '—' : d.positiveGamma ? 'Long gamma' : 'Short gamma', tone: d.netGex != null && d.netGex < 0 ? 'negative' : 'positive' },
      { label: 'Spot', value: fmtLevel(d.spot, 2), sub: spotSub, tone: spotTone },
      { label: 'Call Wall', value: fmtLevel(d.callWall, dec), sub: pctVal(d.callWall, d.spot) != null ? `${Math.abs(pctVal(d.callWall, d.spot)!).toFixed(2)}% above` : '—', tone: 'call' },
      { label: 'Put Wall', value: fmtLevel(d.putWall, dec), sub: pctVal(d.putWall, d.spot) != null ? `${Math.abs(pctVal(d.putWall, d.spot)!).toFixed(2)}% below` : '—', tone: 'negative' },
      { label: 'Pin Level', value: fmtLevel(d.magnet, dec), sub: signedPct(d.magnet, d.spot), tone: 'pin' },
      { label: 'Expected Move', value: d.emPts != null ? `±${d.emPts.toFixed(1)}` : '—', sub: d.emPct != null ? `±${(d.emPct * 100).toFixed(2)}%` : '—', tone: 'warning' },
      { label: 'Market Control', value: d.controlScore != null ? `${d.controlScore}/100` : '—', sub: d.controlScore == null ? '—' : d.positiveGamma ? 'Dealers' : 'Traders', tone: 'neutral' },
      { label: 'Feed Status', value: d.feed.value, sub: d.feed.sub, tone: d.feed.tone },
    ];
  }, [d, dec]);

  // ── KEY LEVELS ────────────────────────────────────────────────────────────────
  const keyLevels = useMemo(() => {
    const rows: { name: string; price: number | null; type: string; color: string }[] = [
      { name: 'Call Wall', price: d.callWall, type: 'Resistance', color: 'var(--call)' },
      { name: 'King', price: d.king, type: 'Critical', color: '#eab308' },
      { name: 'Pin / Magnet', price: d.magnet, type: 'Magnet', color: 'var(--pin)' },
      { name: 'Gamma Flip', price: d.gammaFlip, type: 'Critical', color: 'var(--warning)' },
      { name: 'Put Wall', price: d.putWall, type: 'Support', color: '#d94646' },
    ];
    return rows
      .filter((r) => r.price != null)
      .sort((a, b) => (b.price! - a.price!));
  }, [d]);

  // ── OPPORTUNITY QUEUE (real: discovery → else sky-vision ranking) ──────────────
  const oppRows: OppRow[] = useMemo(() => {
    const rows: OppRow[] = [];
    const findAsset = (ticker: string): AssetInfo =>
      ASSET_LIST.find((a) => a.ticker === ticker) ?? selectedAsset;

    const disc = serverState?.discovery;
    const mCalls: any[] = disc?.mispricedCalls ?? [];
    const mPuts: any[] = disc?.mispricedPuts ?? [];

    if (mCalls.length || mPuts.length) {
      const push = (c: any, isCall: boolean) => {
        const asset: AssetInfo = c.asset ?? selectedAsset;
        rows.push({
          id: `disc-${asset.ticker}-${c.strike}-${isCall ? 'C' : 'P'}`,
          ticker: asset.ticker,
          setup: isNum(c.modelValue) && isNum(c.marketPrice) && c.modelValue > c.marketPrice ? 'Underpriced edge' : 'Model edge',
          isCall,
          level: isNum(c.strike) ? c.strike : null,
          price: isNum(c.marketPrice) ? c.marketPrice : null,
          conf: isNum(c.health) ? Math.round(c.health) : null,
          status: 'Mispriced',
          ts: serverState?.provenance?.timestamp ? Date.parse(serverState.provenance.timestamp) : Date.now(),
          category: isCall ? 'BREAKOUTS' : 'REVERSALS',
          asset,
        });
      };
      mCalls.forEach((c) => push(c, true));
      mPuts.forEach((p) => push(p, false));
    } else {
      // Sky-Vision ranked contracts — real computed opportunities, always present.
      const sv = serverState?.sky_vision;
      const contracts: any[] = sv?.contracts ?? [];
      const tol = d.spot != null ? d.spot * 0.003 : 0;
      const nearWall = (strike: number) =>
        [d.callWall, d.putWall, d.magnet, d.king].some((lv) => isNum(lv) && Math.abs(strike - lv) <= tol);
      [...contracts]
        .sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0))
        .slice(0, 10)
        .forEach((c) => {
          const strike = isNum(c.strike) ? c.strike : null;
          rows.push({
            id: `sv-${c.key}`,
            ticker: sv.ticker ?? selectedAsset.ticker,
            setup: c.label || c.trend || 'Ranked setup',
            isCall: !!c.isCall,
            level: strike,
            price: isNum(c.premium) ? c.premium : null,
            conf: isNum(c.confidence) ? Math.round(c.confidence) : null,
            status: c.strongest ? 'Primary' : c.rank != null ? `Rank ${c.rank}` : '—',
            ts: isNum(sv.updatedAt) ? sv.updatedAt : Date.now(),
            category: strike != null && nearWall(strike) ? 'GAMMA PLAYS' : c.isCall ? 'BREAKOUTS' : 'REVERSALS',
            asset: findAsset(sv.ticker ?? selectedAsset.ticker),
          });
        });
    }
    return rows;
  }, [serverState, selectedAsset, d]);

  const filteredOpps = useMemo(
    () => (oppFilter === 'ALL' ? oppRows : oppRows.filter((r) => r.category === oppFilter)),
    [oppRows, oppFilter],
  );

  const openOpp = (r: OppRow) => {
    if (r.level == null) return;
    useContractStore.getState().selectContractAtomically(r.asset, r.level, r.isCall);
  };

  const oppColumns: Column<OppRow>[] = [
    { key: 'ticker', header: 'Ticker', render: (r) => <span className="font-bold text-[var(--text-primary)]">{r.ticker}</span> },
    { key: 'setup', header: 'Setup', render: (r) => <span className="text-[var(--text-secondary)]">{r.setup}</span> },
    { key: 'type', header: 'Type', align: 'center', render: (r) => <StatusBadge tone={r.isCall ? 'call' : 'negative'}>{r.isCall ? 'Call' : 'Put'}</StatusBadge> },
    { key: 'level', header: 'Level', align: 'right', render: (r) => <span className="slayer-num">{fmtLevel(r.level, r.level != null && Number.isInteger(r.level) ? 0 : 2)}</span> },
    { key: 'price', header: 'Price', align: 'right', render: (r) => <span className="slayer-num">{r.price != null ? `$${r.price.toFixed(2)}` : '—'}</span> },
    {
      key: 'conf', header: 'Conf', align: 'right', render: (r) => (
        <div className="flex items-center justify-end gap-1.5">
          <span className="slayer-num text-[var(--text-primary)]">{r.conf != null ? `${r.conf}%` : '—'}</span>
        </div>
      ),
    },
    {
      key: 'risk', header: 'Risk', align: 'center', render: (r) => {
        const c = r.conf ?? 0;
        const tone: BadgeTone = c >= 80 ? 'positive' : c >= 60 ? 'warning' : 'negative';
        const label = c >= 80 ? 'Low' : c >= 60 ? 'Med' : 'High';
        return <StatusBadge tone={tone}>{r.conf == null ? '—' : label}</StatusBadge>;
      },
    },
    { key: 'status', header: 'Status', render: (r) => <span className="text-[var(--text-muted)]">{r.status}</span> },
    { key: 'time', header: 'Time', align: 'right', render: (r) => <span className="slayer-num text-[var(--text-muted)]">{r.ts ? new Date(r.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</span> },
  ];

  // ── TRACKED SETUPS ──────────────────────────────────────────────────────────
  const trackedVisible = useMemo(
    () => setups.filter((s) => s.status !== 'CANCELLED')
      .sort((a, b) => Number(isTerminal(a.status)) - Number(isTerminal(b.status)) || b.createdAt - a.createdAt),
    [setups],
  );

  // ── MARKET INSIGHT bullets (all real-number derived) ──────────────────────────
  const insights: string[] = useMemo(() => {
    const out: string[] = [];
    if (d.netGex != null && d.spot != null) {
      out.push(
        `Dealers ${d.positiveGamma ? 'net-long' : 'net-short'} gamma (${fmtBn(d.netGex)})${d.gammaFlip != null ? ` ${d.spot >= d.gammaFlip ? 'above' : 'below'} the ${fmtLevel(d.gammaFlip, dec)} flip` : ''} — ${d.positiveGamma ? 'moves fade, range-bound' : 'hedging amplifies moves'}.`,
      );
    }
    const above = pctVal(d.callWall, d.spot);
    if (above != null) out.push(`Call wall ${fmtLevel(d.callWall, dec)} sits ${Math.abs(above).toFixed(2)}% overhead — primary upside cap.`);
    const below = pctVal(d.putWall, d.spot);
    if (below != null) out.push(`Put wall ${fmtLevel(d.putWall, dec)} ${Math.abs(below).toFixed(2)}% below — downside support.`);
    if (d.magnet != null) out.push(`Heaviest gamma pins ${fmtLevel(d.magnet, dec)} (${signedPct(d.magnet, d.spot)} from spot).`);
    if (d.emPct != null) out.push(`Dealer-implied move ±${(d.emPct * 100).toFixed(2)}%${d.emPts != null ? ` (±${d.emPts.toFixed(1)} pts)` : ''}${d.expiryLabel ? ` into ${d.expiryLabel}` : ''}.`);
    if (d.skew?.bias && isNum(d.skew.riskReversal25)) out.push(`25Δ skew ${String(d.skew.bias).toLowerCase()} (${(d.skew.riskReversal25 * 100).toFixed(1)} vol pts) — ${d.skew.bias === 'PUT SKEW' ? 'downside hedging bid' : d.skew.bias === 'CALL SKEW' ? 'upside call demand' : 'balanced wings'}.`);
    if (d.controlScore != null) out.push(`Market-control score ${d.controlScore}/100 — ${d.positiveGamma ? 'dealers stabilizing price' : 'flow-driven, dealers chasing'}.`);
    return out;
  }, [d, dec]);

  // EM range bar geometry.
  const emLower = d.spot != null && d.emPct != null ? d.spot * (1 - d.emPct) : null;
  const emUpper = d.spot != null && d.emPct != null ? d.spot * (1 + d.emPct) : null;

  const biasTone = d.bias === 'BULLISH' ? 'text-[#2f9d45]' : d.bias === 'BEARISH' ? 'text-[#d94646]' : 'text-[var(--text-secondary)]';

  const gexProfileProp = d.gp && d.spot != null ? {
    strikes: d.gp.strikes,
    expectedMovePct: d.gp.expectedMovePct,
    netGex: d.gp.netGex,
    dealerBias: d.netGex != null ? (d.netGex >= 0 ? 'LONG GAMMA' : 'SHORT GAMMA') : undefined,
    aboveFlip: d.gammaFlip != null ? d.spot >= d.gammaFlip : undefined,
    spot: d.spot,
  } : undefined;
  const gexLevelsProp = d.gp ? {
    callWall: d.callWall ?? undefined,
    putWall: d.putWall ?? undefined,
    gammaFlip: d.gammaFlip ?? undefined,
    magnet: d.magnet ?? undefined,
  } : undefined;

  // ── the chart-panel level tags (Call Wall / Spot / Put Wall / Pin / Flip) ──────
  const levelTags: { label: string; price: number | null; color: string }[] = [
    { label: 'Call Wall', price: d.callWall, color: 'var(--call)' },
    { label: 'Flip', price: d.gammaFlip, color: 'var(--warning)' },
    { label: 'Spot', price: d.spot, color: 'var(--text-primary)' },
    { label: 'Pin', price: d.magnet, color: 'var(--pin)' },
    { label: 'Put Wall', price: d.putWall, color: '#d94646' },
  ];

  const activeLevelRows: { name: string; price: number | null; color: string }[] = [
    { name: 'Call Wall', price: d.callWall, color: 'var(--call)' },
    { name: 'Pin', price: d.magnet, color: 'var(--pin)' },
    { name: 'Put Wall', price: d.putWall, color: '#d94646' },
    { name: 'Gamma Flip', price: d.gammaFlip, color: 'var(--warning)' },
    { name: 'King', price: d.king, color: '#eab308' },
  ];

  // small row for MARKET SUMMARY
  const SummaryRow = ({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) => (
    <div className="flex items-center justify-between gap-3 border-b border-[rgba(248,248,255,0.045)] py-2 last:border-b-0">
      <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</span>
      <span className={`slayer-num text-[13px] font-semibold ${tone ?? 'text-[var(--text-primary)]'}`}>{value}</span>
    </div>
  );

  const putCallTone = d.putCall == null ? undefined : d.putCall > 1 ? 'text-[#d94646]' : 'text-[#2f9d45]';
  const skewBiasTone = d.skew?.bias === 'PUT SKEW' ? 'text-[#d94646]' : d.skew?.bias === 'CALL SKEW' ? 'text-[#2f9d45]' : undefined;
  const gammaStateTone = d.gammaState === 'ADDING_HEDGES' ? 'text-[#2f9d45]' : d.gammaState === 'REMOVING_HEDGES' ? 'text-[#d94646]' : undefined;
  const gammaStateLabel = d.gammaState === 'ADDING_HEDGES' ? 'Adding hedges' : d.gammaState === 'REMOVING_HEDGES' ? 'Removing hedges' : d.gammaState === 'STABLE' ? 'Stable' : '—';

  // Top-bar reads — all real: spot/change from the derived frame, feed provenance
  // from the stream flags, the timestamp from the live wall clock.
  const changeStr = d.changeAbs == null
    ? '—'
    : `${d.changeAbs >= 0 ? '+' : ''}${d.changeAbs.toFixed(2)}  ${d.changePctV != null ? `${d.changePctV >= 0 ? '+' : ''}${d.changePctV.toFixed(2)}%` : ''}`;

  return (
    <TerminalShell
      sidebar={
        <TerminalSidebar
          activeId={activeTab}
          onChange={(id) => setActiveTab(id as any)}
        />
      }
      topBar={
        <TerminalTopBar
          symbol={selectedAsset.ticker}
          spot={fmtLevel(d.spot, 2)}
          change={changeStr}
          changeTone={d.changeAbs == null ? 'neutral' : d.changeAbs >= 0 ? 'positive' : 'negative'}
          live={d.feed.value === 'Normal'}
          feedLabel={d.feed.sub}
          timestamp={clock}
          onSettings={() => setActiveTab('settings')}
        />
      }
    >
      {/* 1 · METRIC STRIP */}
      <MetricStrip metrics={metrics} />

      {/* 2 · CHART + ACTIVE SETUP */}
      <div className="grid grid-cols-1 gap-[var(--gap)] lg:grid-cols-[1fr_330px]">
        <TerminalPanel
          title={`${selectedAsset.ticker} · ${selectedTimeframe.toUpperCase()} · Market Overview`}
          subtitle={d.expiryLabel ? `Nearest expiry ${d.expiryLabel}` : undefined}
          bodyClassName="p-0"
          actions={
            <div className="flex items-center gap-1">
              {TF_OPTS.map((t) => (
                <button
                  key={t.val}
                  onClick={() => setSelectedTimeframe(t.val as any)}
                  className={`slayer-control cursor-pointer ${selectedTimeframe === t.val ? 'border-[var(--border-strong)] text-[var(--text-primary)]' : ''}`}
                  style={selectedTimeframe === t.val ? { background: '#111' } : undefined}
                >
                  {t.label}
                </button>
              ))}
            </div>
          }
        >
          {/* dealer level tags */}
          <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-[var(--border-subtle)]">
            {levelTags.map((t) => (
              <span
                key={t.label}
                className="inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[10px] font-semibold slayer-num"
                style={{ borderColor: 'var(--border-subtle)', color: t.color }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.color }} />
                {t.label}
                <span className="text-[var(--text-secondary)]">{fmtLevel(t.price, t.label === 'Spot' ? 2 : dec)}</span>
              </span>
            ))}
          </div>
          <div className="h-[360px] w-full p-2">
            <InteractiveChart
              candles={d.candles}
              timeframe={selectedTimeframe}
              selectedTicker={selectedAsset.ticker}
              priceDecimals={dec}
              gexLevels={gexLevelsProp}
              gexProfile={gexProfileProp}
              watermarkText={d.feed.value === 'Normal' ? 'LIVE CHART' : 'MODEL CHART'}
            />
          </div>
        </TerminalPanel>

        <TerminalPanel title="Active Setup" subtitle={selectedAsset.name}>
          <div className="space-y-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">Primary Bias</div>
                <div className={`text-2xl font-bold ${biasTone}`}>{d.bias}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">Spot</div>
                <div className="slayer-num text-xl font-semibold text-[var(--text-primary)]">{fmtLevel(d.spot, 2)}</div>
              </div>
            </div>

            {/* level list */}
            <div className="space-y-1.5">
              {activeLevelRows.map((r) => (
                <div key={r.name} className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
                    <span className="text-[var(--text-secondary)]">{r.name}</span>
                  </span>
                  <span className="flex items-center gap-2 slayer-num">
                    <span className="text-[var(--text-primary)] font-semibold">{fmtLevel(r.price, dec)}</span>
                    <span className="w-14 text-right text-[var(--text-muted)]">{signedPct(r.price, d.spot)}</span>
                  </span>
                </div>
              ))}
            </div>

            {/* expected-move range bar */}
            <div>
              <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                <span>Expected Move</span>
                <span className="text-[var(--warning)]">{d.emPct != null ? `±${(d.emPct * 100).toFixed(2)}%` : '—'}</span>
              </div>
              <div className="relative h-8 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)]">
                <div className="absolute inset-y-0 left-1/2 w-px bg-[var(--text-faint)]" />
                {emLower != null && emUpper != null && (
                  <div className="absolute inset-y-1.5 left-[12%] right-[12%] rounded-sm" style={{ background: 'linear-gradient(90deg, rgba(196,154,58,0.10), rgba(196,154,58,0.28), rgba(196,154,58,0.10))' }} />
                )}
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] slayer-num text-[#d94646]">{fmtLevel(emLower, dec)}</span>
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] slayer-num text-[var(--text-primary)]">{fmtLevel(d.spot, dec)}</span>
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] slayer-num text-[#2f9d45]">{fmtLevel(emUpper, dec)}</span>
              </div>
            </div>

            {/* Market insight */}
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--text-primary)]">
                <Waves className="h-3.5 w-3.5 text-[var(--pin)]" /> Market Insight
              </div>
              {insights.length === 0 ? (
                <p className="text-[12px] text-[var(--text-muted)]">Awaiting live dealer data…</p>
              ) : (
                <ul className="space-y-2 text-[12px] leading-relaxed text-[var(--text-secondary)]">
                  {insights.map((line, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="select-none text-[var(--text-faint)]">•</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </TerminalPanel>
      </div>

      {/* 3 · KEY LEVELS / TRACKED SETUPS / MARKET SUMMARY */}
      <div className="grid grid-cols-1 gap-[var(--gap)] lg:grid-cols-3">
        <TerminalPanel title="Key Levels" subtitle="Dealer-gravity map" actions={<Crosshair className="h-3.5 w-3.5 text-[var(--text-muted)]" />}>
          {keyLevels.length === 0 ? (
            <p className="text-[12px] text-[var(--text-muted)]">Awaiting GEX profile…</p>
          ) : (
            <div className="space-y-3">
              {keyLevels.map((lv) => {
                const dist = pctVal(lv.price, d.spot);
                const strength = d.gravityAt(lv.price);
                return (
                  <div key={lv.name}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-[12px]">
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: lv.color }} />
                        <span className="font-semibold text-[var(--text-primary)] slayer-num">{fmtLevel(lv.price, dec)}</span>
                        <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">{lv.type}</span>
                      </span>
                      <span className={`slayer-num text-[11px] ${dist == null ? 'text-[var(--text-muted)]' : dist >= 0 ? 'text-[#2f9d45]' : 'text-[#d94646]'}`}>
                        {dist == null ? '—' : `${dist >= 0 ? '+' : ''}${dist.toFixed(2)}%`}
                      </span>
                    </div>
                    <StrengthBar pct={strength} tone={lv.color} />
                  </div>
                );
              })}
            </div>
          )}
        </TerminalPanel>

        <TerminalPanel title="Tracked Setups" subtitle="Your live tracks" actions={<Activity className="h-3.5 w-3.5 text-[var(--text-muted)]" />}>
          {trackedVisible.length === 0 ? (
            <div className="py-6 text-center">
              <ListTree className="mx-auto mb-2 h-5 w-5 text-[var(--text-faint)]" />
              <p className="text-[12px] text-[var(--text-muted)]">No tracked setups yet.</p>
              <p className="mt-1 text-[11px] text-[var(--text-faint)]">Track a setup from SkyVision or Pinpoint to watch it re-price here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {trackedVisible.slice(0, 6).map((s: TrackedSetup) => {
                const reward = isNum(s.expectedMovePct) ? s.expectedMovePct : s.premiumChangePct;
                const DirIcon = s.direction === 'BULLISH' ? TrendingUp : TrendingDown;
                return (
                  <div key={s.id} className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <DirIcon className={`h-3.5 w-3.5 shrink-0 ${s.direction === 'BULLISH' ? 'text-[#2f9d45]' : 'text-[#d94646]'}`} />
                        <span className="truncate text-[12px] font-semibold text-[var(--text-primary)]">{s.contract}</span>
                      </span>
                      <StatusBadge tone={trackTone(s.status)} dot={!isTerminal(s.status)}>{STATUS_LABEL[s.status]}</StatusBadge>
                    </div>
                    <div className="mt-2 grid grid-cols-[1fr_auto] items-center gap-2">
                      <div>
                        <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                          <span>Confidence</span><span className="slayer-num">{isNum(s.confidence) ? `${Math.round(s.confidence)}%` : '—'}</span>
                        </div>
                        <StrengthBar pct={isNum(s.confidence) ? s.confidence : null} tone="var(--pin)" />
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">Reward</div>
                        <div className={`slayer-num text-[13px] font-semibold ${!isNum(reward) ? 'text-[var(--text-muted)]' : reward >= 0 ? 'text-[#2f9d45]' : 'text-[#d94646]'}`}>
                          {isNum(reward) ? `${reward >= 0 ? '+' : ''}${reward.toFixed(1)}%` : '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TerminalPanel>

        <TerminalPanel title="Market Summary" subtitle="Session internals" actions={<Layers className="h-3.5 w-3.5 text-[var(--text-muted)]" />}>
          <div>
            <SummaryRow label="Adv / Dec (bars)" value={`${d.adv} / ${d.dec}`} tone={d.adv === d.dec ? undefined : d.adv > d.dec ? 'text-[#2f9d45]' : 'text-[#d94646]'} />
            <SummaryRow label="VIX" value={d.vix != null ? d.vix.toFixed(2) : '—'} tone={d.vix == null ? undefined : d.vix >= 20 ? 'text-[#d94646]' : 'text-[#2f9d45]'} />
            <SummaryRow label="Volume" value={d.volume != null ? fmtNum(d.volume, 0) : '—'} />
            <SummaryRow label="Put / Call" value={d.putCall != null ? d.putCall.toFixed(2) : '—'} tone={putCallTone} />
            <SummaryRow label="Skew 25Δ" value={d.skew && isNum(d.skew.riskReversal25) ? `${(d.skew.riskReversal25 * 100).toFixed(1)} vp` : '—'} tone={skewBiasTone} />
            <SummaryRow label="Realized Vol" value={d.rv != null ? `${(d.rv * 100).toFixed(1)}%` : '—'} />
            <SummaryRow label="Gamma Exposure" value={fmtBn(d.netGex)} tone={d.netGex == null ? undefined : d.netGex >= 0 ? 'text-[#2f9d45]' : 'text-[#d94646]'} />
            <SummaryRow label="Gamma Trend" value={gammaStateLabel} tone={gammaStateTone} />
          </div>
        </TerminalPanel>
      </div>

      {/* 4 · OPPORTUNITY QUEUE + NOTES */}
      <div className="grid grid-cols-1 gap-[var(--gap)] lg:grid-cols-[1fr_330px]">
        <TerminalPanel
          title="Opportunity Queue"
          subtitle="Ranked live setups"
          actions={<Target className="h-3.5 w-3.5 text-[var(--text-muted)]" />}
        >
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {OPP_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setOppFilter(f)}
                className={`slayer-control cursor-pointer !py-1 text-[10px] uppercase tracking-[0.1em] ${oppFilter === f ? 'border-[var(--border-strong)] text-[var(--text-primary)]' : ''}`}
                style={oppFilter === f ? { background: '#111' } : undefined}
              >
                {f}
              </button>
            ))}
          </div>
          <DataTable
            columns={oppColumns}
            rows={filteredOpps}
            rowKey={(r) => r.id}
            empty={oppFilter === 'EARNINGS' ? 'No earnings-tagged setups in the live feed.' : 'No opportunities in the live feed yet.'}
          />
          {filteredOpps.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {filteredOpps.slice(0, 6).map((r) => (
                <button
                  key={`open-${r.id}`}
                  onClick={() => openOpp(r)}
                  disabled={r.level == null}
                  className="slayer-control cursor-pointer !py-1 text-[10px] disabled:opacity-40"
                >
                  Open {r.ticker} {r.level != null ? fmtLevel(r.level, Number.isInteger(r.level) ? 0 : 2) : ''}{r.isCall ? 'C' : 'P'}
                </button>
              ))}
            </div>
          )}
        </TerminalPanel>

        <TerminalPanel title="Notes & Alerts" subtitle="Your desk log" actions={<StickyNote className="h-3.5 w-3.5 text-[var(--text-muted)]" />}>
          <div className="mb-3 flex items-center gap-2">
            <input
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addNote(); }}
              placeholder="Add a note…"
              className="slayer-control flex-1 bg-[#050505] placeholder:text-[var(--text-faint)] focus:outline-none"
            />
            <button onClick={addNote} className="slayer-control cursor-pointer text-[var(--text-primary)]">Add</button>
          </div>
          {notes.length === 0 ? (
            <div className="py-6 text-center">
              <Radio className="mx-auto mb-2 h-5 w-5 text-[var(--text-faint)]" />
              <p className="text-[12px] text-[var(--text-muted)]">No notes or alerts yet.</p>
              <p className="mt-1 text-[11px] text-[var(--text-faint)]">Jot a thesis or level to watch — it's timestamped and saved locally.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {notes.map((n) => (
                <li key={n.id} className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] px-2.5 py-2">
                  <div className="text-[12px] text-[var(--text-secondary)]">{n.text}</div>
                  <div className="mt-1 slayer-num text-[10px] uppercase tracking-[0.12em] text-[var(--text-faint)]">
                    {new Date(n.ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TerminalPanel>
      </div>
    </TerminalShell>
  );
}
