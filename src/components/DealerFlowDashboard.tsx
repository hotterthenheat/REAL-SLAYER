/**
 * DealerFlowDashboard — the Dealer Flow OVERVIEW: a dense, Bloomberg-grade dealer-
 * positioning cockpit over the live server state, built from the same streamed GEX
 * profile (serverState.gex_profile), candles, option_chain, dealer gauge and live
 * spot map that the Home terminal and the Pinpoint page read — so every surface
 * agrees on one instrument at one scale. It reuses the Home dashboard's atoms
 * (KpiStrip, NotesAlertsPanel, DashboardStatusBar, format helpers) and the shared
 * InteractiveChart. Nothing is fabricated: absent levels render "—", the order-flow
 * proxy is badged MODELED, and cross-ticker cells that cannot be sourced read "—".
 *
 * Layout (top → bottom): KPI strip · dealer-flow chart | pressure matrix · order
 * flow | key levels | options chain · real-time flow | market notes · status bar.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useContractStore } from '../lib/store';
import type { Candle } from '../types';
import { KpiStrip, type KpiCell } from './home/KpiStrip';
import { NotesAlertsPanel } from './home/NotesAlertsPanel';
import { DashboardStatusBar } from './home/DashboardStatusBar';
import { DealerFlowChartPanel } from './dealerflow/DealerFlowChartPanel';
import { DealerPressureMatrix } from './dealerflow/DealerPressureMatrix';
import { OrderFlowPanel } from './dealerflow/OrderFlowPanel';
import { KeyLevelsRail } from './dealerflow/KeyLevelsRail';
import { OptionsChainPanel } from './dealerflow/OptionsChainPanel';
import { RealTimeFlowPanel, type FlowRow } from './dealerflow/RealTimeFlowPanel';
import { fmtBnSigned, fmtCompact, fmtLevel, fmtPct, fmtPrice2, fmtPts, nyClock, signTone, type Tone } from './home/format';

type FeedStatus = 'connecting' | 'live' | 'offline' | 'stale';

export default function DealerFlowDashboard({ feedStatus }: { feedStatus: FeedStatus }) {
  const selectedAsset = useContractStore((s) => s.selectedAsset);
  const setActiveTab = useContractStore((s) => s.setActiveTab);
  const rawServerState = useContractStore((s) => s.serverState);

  // Gate the streamed state to the asset in view so a ticker switch can't paint the
  // previous ticker's dealer data (the pattern HomeDashboard / DealerFlowView use).
  const serverState = useMemo(() => {
    if (!rawServerState) return null;
    const ticker = rawServerState.contract?.replace('-', ' ').split(' ')[0];
    if (ticker !== selectedAsset.ticker) return null;
    return rawServerState;
  }, [rawServerState, selectedAsset.ticker]);

  const profile: any = serverState?.gex_profile ?? null;
  const gauge: any = serverState?.dealer_flow ?? null;
  const candles: Candle[] = (serverState?.candles as Candle[]) ?? [];
  const optionChain: any[] | undefined = serverState?.option_chain;

  const spot: number | undefined = profile?.spot;
  const netGex: number | undefined = profile?.netGex;

  // Net DEX / VEX: prefer the server aggregate, else sum per-strike — the exact
  // fallback HomeDashboard / PinpointGexView use so the surfaces never disagree.
  const netAgg = useMemo(() => {
    const strikes: any[] = Array.isArray(profile?.strikes) ? profile.strikes : [];
    const sumBase = (base: 'Dex' | 'Vex'): number | undefined => {
      if (!strikes.length) return undefined;
      let any = false, sum = 0;
      for (const s of strikes) {
        const nd = s?.[`net${base}`];
        let v: number | null = null;
        if (nd != null && isFinite(nd)) v = nd;
        else {
          const c = s?.[`call${base}`], p = s?.[`put${base}`];
          if ((c != null && isFinite(c)) || (p != null && isFinite(p))) v = (c || 0) + (p || 0);
        }
        if (v != null) { any = true; sum += v; }
      }
      return any ? sum : undefined;
    };
    return { dex: sumBase('Dex'), vex: sumBase('Vex') };
  }, [profile]);
  const netDex: number | undefined = profile?.netDex != null && isFinite(profile.netDex) ? profile.netDex : netAgg.dex;
  const netVex: number | undefined = profile?.netVex != null && isFinite(profile.netVex) ? profile.netVex : netAgg.vex;

  const callWall: number | undefined = profile?.callWall;
  const putWall: number | undefined = profile?.putWall;
  const magnet: number | undefined = profile?.magnet;
  const emPct: number | undefined = profile?.expectedMovePct;
  const emAbs = spot != null && emPct != null ? spot * emPct : null;

  // Live frame-over-frame net-gamma trend (a real trend of the streamed figure).
  const prevNetGexRef = useRef<number | null>(null);
  const [netGexTrend, setNetGexTrend] = useState<string>('Stable');
  useEffect(() => {
    if (netGex == null || !isFinite(netGex)) return;
    const prev = prevNetGexRef.current;
    if (prev != null) {
      const prevMag = Math.abs(prev), curMag = Math.abs(netGex);
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

  // Candle-derived order-flow delta + session volume (the DELTA / VOL for the in-view
  // multi-ticker row — a labelled proxy, consistent with the Order Flow panel).
  const flowAgg = useMemo(() => {
    const cs = candles.filter((c) => c && isFinite(c.close) && isFinite(c.open) && isFinite(c.volume)).slice(-120);
    if (!cs.length) return { delta: null as number | null, vol: null as number | null };
    let delta = 0, vol = 0;
    for (const c of cs) { delta += (c.close > c.open ? 1 : c.close < c.open ? -1 : 0) * c.volume; vol += c.volume; }
    return { delta, vol };
  }, [candles]);

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

  // KPI strip — 9 cells (PLOP intentionally omitted: not sourceable).
  const kpiCells: KpiCell[] = [
    {
      label: 'Spot',
      value: fmtPrice2(spot),
      sub: spotChange ? `${fmtPts(spotChange.abs)} (${fmtPct(spotChange.pct)})` : '—',
      tone: 'call',
      subTone: spotChange ? signTone(spotChange.abs) : 'neutral',
    },
    { label: 'Call Wall', value: fmtLevel(callWall), sub: cwSub.text, tone: 'call', subTone: cwSub.tone },
    { label: 'Put Wall', value: fmtLevel(putWall), sub: pwSub.text, tone: 'negative', subTone: pwSub.tone },
    { label: 'Pin Level', value: fmtLevel(magnet), sub: pinDist == null ? '—' : fmtPct(pinDist), tone: 'pin', subTone: pinDist == null ? 'neutral' : signTone(pinDist) },
    { label: 'Dealer Bias', value: bias.word, sub: bias.sub, tone: bias.tone },
    { label: 'Exp Move (1D)', value: emAbs != null ? `±${Math.abs(emAbs).toFixed(2)}` : '—', sub: emPct != null ? `±${(emPct * 100).toFixed(2)}%` : '—', tone: 'warning', subTone: 'warning' },
    { label: 'Net GEX', value: fmtBnSigned(netGex), sub: netGexTrend, tone: signTone(netGex) },
    { label: 'Net DEX', value: fmtCompact(netDex, true), sub: netDex == null ? '—' : netDex < 0 ? 'Downside tilt' : 'Upside tilt', tone: signTone(netDex) },
    { label: 'Net VEX', value: fmtCompact(netVex, true), sub: netVex == null ? '—' : netVex < 0 ? 'Short vega' : 'Long vega', tone: signTone(netVex) },
  ];

  // Real-Time Flow rows: live spots for every tracked ticker; the in-view ticker is
  // fully sourced from its profile / candles / gauge, the rest carry price only.
  const flowRows = useMemo<FlowRow[]>(() => {
    const prices: Record<string, number> = serverState?.liveSpotPrices ?? {};
    const inView = selectedAsset.ticker;
    const totalOi = profile?.totalCallOi != null || profile?.totalPutOi != null
      ? (profile?.totalCallOi ?? 0) + (profile?.totalPutOi ?? 0)
      : null;
    const map = new Map<string, number | null>();
    for (const [t, v] of Object.entries(prices)) if (typeof v === 'number' && isFinite(v)) map.set(t, v);
    if (!map.has(inView) && spot != null) map.set(inView, spot);
    const rows: FlowRow[] = [...map.entries()].map(([ticker, price]) => {
      if (ticker === inView) {
        return {
          ticker, price: price ?? spot ?? null, isInView: true,
          chgPct: spotChange?.pct ?? null,
          delta: flowAgg.delta,
          gex: netGex ?? null,
          dex: netDex ?? null,
          vol: flowAgg.vol,
          oi: totalOi,
          bias: gauge?.pressure != null ? bias.word : null,
          biasTone: bias.tone,
        };
      }
      return { ticker, price, isInView: false, chgPct: null, delta: null, gex: null, dex: null, vol: null, oi: null, bias: null, biasTone: 'neutral' };
    });
    rows.sort((a, b) => (a.isInView === b.isInView ? a.ticker.localeCompare(b.ticker) : a.isInView ? -1 : 1));
    return rows;
  }, [serverState?.liveSpotPrices, selectedAsset.ticker, spot, spotChange, flowAgg, netGex, netDex, gauge, bias, profile]);

  const updated = useMemo(() => nyClock(), [serverState]);
  const eventModel = { spot, magnet, callWall, putWall, netGex, netGexTrend };

  return (
    <div className="w-full min-w-0 space-y-[var(--gap)] p-2 font-mono text-[var(--text-primary)] sm:p-3">
      {/* A · KPI STRIP */}
      <KpiStrip cells={kpiCells} />

      {/* B · MAIN ROW — dealer-flow chart | pressure matrix (~52/48) */}
      <div className="grid grid-cols-1 gap-[var(--gap)] xl:h-[460px] xl:grid-cols-[minmax(0,52fr)_minmax(0,48fr)]">
        <DealerFlowChartPanel ticker={selectedAsset.ticker} candles={candles} profile={profile} />
        <DealerPressureMatrix profile={profile} ticker={selectedAsset.ticker} />
      </div>

      {/* C · MIDDLE ROW — order flow | key levels | options chain */}
      <div className="grid grid-cols-1 items-start gap-[var(--gap)] md:grid-cols-2 xl:grid-cols-[minmax(0,34fr)_minmax(0,26fr)_minmax(0,40fr)]">
        <OrderFlowPanel candles={candles} netGex={netGex} netGexTrend={netGexTrend} />
        <KeyLevelsRail profile={profile} biasWord={bias.word} biasTone={bias.tone} netDex={netDex} />
        <OptionsChainPanel profile={profile} optionChain={optionChain} />
      </div>

      {/* D · BOTTOM ROW — real-time flow | market notes (~60/40) */}
      <div className="grid grid-cols-1 items-start gap-[var(--gap)] xl:grid-cols-[minmax(0,60fr)_minmax(0,40fr)]">
        <RealTimeFlowPanel rows={flowRows} updated={updated} />
        <NotesAlertsPanel model={eventModel} onOpen={() => setActiveTab('pinpoint')} />
      </div>

      {/* E · STATUS BAR */}
      <DashboardStatusBar feedStatus={feedStatus} />
    </div>
  );
}
