/**
 * HomeDashboard — the in-shell Home terminal: a dense, Bloomberg-grade multi-widget
 * grid over the live server state. Every figure is sourced from the streamed GEX
 * profile (serverState.gex_profile), the tracked-setups store, the discovery scan,
 * and the realized-vol suite — the exact derivations the Pinpoint page uses, so the
 * two surfaces agree. Nothing is fabricated: absent levels render "—", model/sample
 * data is badged, and inferred reads carry a provenance tag.
 *
 * Layout (top → bottom): KPI strip · price chart | dealer positioning map ·
 * key levels | tracked setups | market summary | market insight · opportunity
 * queue | notes & alerts · status bar.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useContractStore } from '../lib/store';
import type { Candle } from '../types';
import { KpiStrip, type KpiCell } from './home/KpiStrip';
import { PriceOverviewPanel } from './home/PriceOverviewPanel';
import { DealerPositioningPanel } from './home/DealerPositioningPanel';
import { KeyLevelsPanel } from './home/KeyLevelsPanel';
import { TrackedSetupsPanel } from './home/TrackedSetupsPanel';
import { MarketSummaryPanel } from './home/MarketSummaryPanel';
import { MarketInsightPanel } from './home/MarketInsightPanel';
import { OpportunityQueuePanel } from './home/OpportunityQueuePanel';
import { NotesAlertsPanel } from './home/NotesAlertsPanel';
import { DashboardStatusBar } from './home/DashboardStatusBar';
import { fmtBnSigned, fmtCompact, fmtLevel, fmtPct, fmtPrice2, fmtPts, nyClock, signTone, type Tone } from './home/format';

type FeedStatus = 'connecting' | 'live' | 'offline' | 'stale';

interface HomeDashboardProps {
  feedStatus: FeedStatus;
  discovery?: any;
}

export default function HomeDashboard({ feedStatus, discovery }: HomeDashboardProps) {
  const selectedAsset = useContractStore((s) => s.selectedAsset);
  const setActiveTab = useContractStore((s) => s.setActiveTab);
  const rawServerState = useContractStore((s) => s.serverState);

  // Gate the streamed state to the asset in view so a ticker switch can't paint the
  // previous ticker's dealer data (the pattern PinpointGexView / DealerFlowView use).
  const serverState = useMemo(() => {
    if (!rawServerState) return null;
    const ticker = rawServerState.contract?.replace('-', ' ').split(' ')[0];
    if (ticker !== selectedAsset.ticker) return null;
    return rawServerState;
  }, [rawServerState, selectedAsset.ticker]);

  const profile: any = serverState?.gex_profile ?? null;
  const gauge: any = serverState?.dealer_flow ?? null;
  const candles: Candle[] = (serverState?.candles as Candle[]) ?? [];

  const spot: number | undefined = profile?.spot;
  const netGex: number | undefined = profile?.netGex;

  // Net DEX / VEX: prefer the server's top-level aggregate, but fall back to the
  // per-strike sum when it's absent — the exact fallback PinpointGexView uses, so the
  // dashboard and the Pinpoint page never disagree (one showing a value, the other "—").
  const netAgg = useMemo(() => {
    const strikes: any[] = Array.isArray(profile?.strikes) ? profile.strikes : [];
    const sumBase = (base: 'Dex' | 'Vex'): number | undefined => {
      if (!strikes.length) return undefined;
      let any = false;
      let sum = 0;
      for (const s of strikes) {
        const nd = s?.[`net${base}`];
        let v: number | null = null;
        if (nd != null && isFinite(nd)) v = nd;
        else {
          const c = s?.[`call${base}`];
          const p = s?.[`put${base}`];
          if ((c != null && isFinite(c)) || (p != null && isFinite(p))) v = (c || 0) + (p || 0);
        }
        if (v != null) { any = true; sum += v; }
      }
      return any ? sum : undefined;
    };
    return { dex: sumBase('Dex'), vex: sumBase('Vex') };
  }, [profile]);
  const netDex: number | undefined =
    profile?.netDex != null && isFinite(profile.netDex) ? profile.netDex : netAgg.dex;
  const netVex: number | undefined =
    profile?.netVex != null && isFinite(profile.netVex) ? profile.netVex : netAgg.vex;

  const callWall: number | undefined = profile?.callWall;
  const putWall: number | undefined = profile?.putWall;
  const magnet: number | undefined = profile?.magnet;
  const emPct: number | undefined = profile?.expectedMovePct;
  const emAbs = spot != null && emPct != null ? spot * emPct : null;
  const positiveGamma = netGex != null && isFinite(netGex) ? netGex >= 0 : null;

  // Live frame-over-frame net-gamma trend (a real trend of the streamed figure, not
  // a fabricated label) — the same derivation the Pinpoint KPI strip uses.
  const prevNetGexRef = useRef<number | null>(null);
  const [netGexTrend, setNetGexTrend] = useState<string>('Stable');
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

  // Spot session change referenced to the oldest streamed candle.
  const spotChange = useMemo(() => {
    if (spot == null || candles.length === 0) return null;
    const ref = candles[0]?.open ?? candles[0]?.close;
    if (ref == null || !isFinite(ref) || ref === 0) return null;
    const abs = spot - ref;
    return { abs, pct: (abs / ref) * 100 };
  }, [spot, candles]);

  // Dealer bias direction + qualifier from the real signed dealer-pressure index.
  const bias = useMemo(() => {
    const pressure: number | undefined = gauge?.pressure;
    let word = 'NEUTRAL';
    let tone: Tone = 'neutral';
    let sub = '—';
    if (pressure != null && isFinite(pressure)) {
      if (pressure > 5) { word = 'BULLISH'; tone = 'positive'; }
      else if (pressure < -5) { word = 'BEARISH'; tone = 'negative'; }
      const mag = Math.abs(pressure);
      const qual = mag > 60 ? 'Strongly' : mag > 25 ? 'Moderately' : 'Slightly';
      const dir = pressure > 0 ? 'positive' : pressure < 0 ? 'negative' : 'neutral';
      sub = `${qual} ${dir}`;
    }
    return { word, tone, sub };
  }, [gauge]);

  const updatedAt = useMemo(() => nyClock(), [serverState]);

  // ── KPI strip cells (~10) ─────────────────────────────────────────────────
  const distPct = (price?: number): number | null =>
    price != null && isFinite(price) && spot ? ((price - spot) / spot) * 100 : null;
  const wallSub = (price?: number): { text: string; tone: Tone } => {
    const d = distPct(price);
    if (d == null) return { text: '—', tone: 'neutral' };
    return { text: `${Math.abs(d).toFixed(2)}% ${d >= 0 ? 'above' : 'below'}`, tone: d >= 0 ? 'positive' : 'negative' };
  };
  const cwSub = wallSub(callWall);
  const pwSub = wallSub(putWall);
  const pinDist = distPct(magnet);

  const kpiCells: KpiCell[] = [
    { label: 'Net GEX', value: fmtBnSigned(netGex), sub: netGexTrend, tone: signTone(netGex) },
    {
      label: 'Spot',
      value: fmtPrice2(spot),
      sub: spotChange ? `${fmtPts(spotChange.abs)} (${fmtPct(spotChange.pct)})` : '—',
      tone: 'neutral',
      subTone: spotChange ? signTone(spotChange.abs) : 'neutral',
    },
    { label: 'Call Wall', value: fmtLevel(callWall), sub: cwSub.text, tone: 'call', subTone: cwSub.tone },
    { label: 'Put Wall', value: fmtLevel(putWall), sub: pwSub.text, tone: 'negative', subTone: pwSub.tone },
    { label: 'Pin Level', value: fmtLevel(magnet), sub: pinDist == null ? '—' : fmtPct(pinDist), tone: 'pin', subTone: pinDist == null ? 'neutral' : signTone(pinDist) },
    { label: 'Exp Move (1D)', value: emAbs != null ? `±${Math.abs(emAbs).toFixed(2)}` : '—', sub: emPct != null ? `±${(emPct * 100).toFixed(2)}%` : '—', tone: 'warning', subTone: 'warning' },
    { label: 'Net DEX', value: fmtCompact(netDex, true), sub: netDex == null ? '—' : netDex < 0 ? 'Downside tilt' : 'Upside tilt', tone: signTone(netDex) },
    { label: 'Net VEX', value: fmtCompact(netVex, true), sub: netVex == null ? '—' : netVex < 0 ? 'Short vega' : 'Long vega', tone: signTone(netVex) },
    { label: 'Gamma Regime', value: positiveGamma == null ? '—' : positiveGamma ? 'LONG γ' : 'SHORT γ', sub: positiveGamma == null ? '—' : positiveGamma ? 'Dampens moves' : 'Amplifies moves', tone: positiveGamma == null ? 'neutral' : positiveGamma ? 'positive' : 'negative' },
    { label: 'Dealer Bias', value: bias.word, sub: bias.sub, tone: bias.tone },
  ];

  const summaryModel = { netGex, netDex, netVex, emAbs, emPct, netGexTrend, profile, candles };
  const insightModel = { spot, netGex, callWall, putWall, magnet, netGexTrend, positiveGamma };
  const eventModel = { spot, magnet, callWall, putWall, netGex, netGexTrend };

  return (
    <div className="w-full min-w-0 space-y-[var(--gap)] p-2 font-mono text-[var(--text-primary)] sm:p-3">
      {/* A · KPI STRIP */}
      <KpiStrip cells={kpiCells} />

      {/* B · MAIN ROW — price chart | dealer positioning map (~58/42) */}
      <div className="grid grid-cols-1 gap-[var(--gap)] xl:h-[460px] xl:grid-cols-[minmax(0,58fr)_minmax(0,42fr)]">
        <PriceOverviewPanel ticker={selectedAsset.ticker} candles={candles} profile={profile} />
        <DealerPositioningPanel profile={profile} ticker={selectedAsset.ticker} />
      </div>

      {/* C · MIDDLE ROW — key levels | tracked setups | market summary | insight */}
      <div className="grid grid-cols-1 gap-[var(--gap)] sm:grid-cols-2 xl:grid-cols-4">
        <KeyLevelsPanel profile={profile} onOpen={() => setActiveTab('pinpoint')} />
        <TrackedSetupsPanel onOpen={() => setActiveTab('auditor')} />
        <MarketSummaryPanel model={summaryModel} onOpen={() => setActiveTab('quant')} />
        <MarketInsightPanel model={insightModel} updatedAt={updatedAt} />
      </div>

      {/* D · BOTTOM ROW — opportunity queue | notes & alerts (~60/40) */}
      <div className="grid grid-cols-1 gap-[var(--gap)] xl:grid-cols-[minmax(0,60fr)_minmax(0,40fr)]">
        <OpportunityQueuePanel discovery={discovery} onOpen={() => setActiveTab('skyvision')} />
        <NotesAlertsPanel model={eventModel} onOpen={() => setActiveTab('auditor')} />
      </div>

      {/* E · STATUS BAR */}
      <DashboardStatusBar feedStatus={feedStatus} />
    </div>
  );
}
