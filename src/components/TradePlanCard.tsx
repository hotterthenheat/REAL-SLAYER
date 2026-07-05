import { useContractStore } from '../lib/store';
import { Crosshair, TrendingUp, TrendingDown, Minus, Clock, CheckCircle2, XCircle, Activity } from 'lucide-react';
import type { TradePlan } from '../lib/tradePlan';
import { optionExpiryLabel } from '../data';
import {
  CompositeGauge, WeightStack, PriceLadder, SignalChip, RsiMeter, MiniMeter, WhyDisclosure,
} from './skyvision/TradePlanVisuals';

/**
 * Sky's Vision Trade Plan — visual-first. The composite blend (40/30/20/10),
 * the reasoned target ladder, and the technical read are all rendered as
 * gauges / rails / status chips instead of prose. Every visual encodes the same
 * REAL numbers the plan carries; the long-form rationale is tucked behind a "Why"
 * disclosure so the default view is scannable, not a paragraph dump.
 */
export function TradePlanCard() {
  const serverState = useContractStore((s) => s.serverState);
  const selectedAsset = useContractStore((s) => s.selectedAsset);
  const plan = serverState?.trade_plan as TradePlan | undefined;
  const decimals = selectedAsset?.decimals ?? 2;
  const fmt = (v: number) => (isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: decimals }) : '—');

  if (!plan) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-center">
        <p className="text-[10px] uppercase tracking-widest text-[var(--text-tertiary)] animate-pulse">Building trade plan…</p>
      </div>
    );
  }

  const dirTone = plan.direction === 'BULLISH' ? '#4ADE80' : plan.direction === 'BEARISH' ? '#F87171' : '#60A5FA';
  const DirIcon = plan.direction === 'BULLISH' ? TrendingUp : plan.direction === 'BEARISH' ? TrendingDown : Minus;
  const e = plan.engineScores;
  const t = plan.technical;
  const spot = (plan.entryZone[0] + plan.entryZone[1]) / 2;

  // Technical read → chip states (bull / bear / warn / neutral).
  const emaTone = t.emaAlignment === 'BULLISH' ? 'bull' : t.emaAlignment === 'BEARISH' ? 'bear' : 'neutral';
  const EmaIcon = t.emaAlignment === 'BULLISH' ? TrendingUp : t.emaAlignment === 'BEARISH' ? TrendingDown : Minus;
  const squeezeLabel = t.squeeze.firing ? 'FIRING' : t.squeeze.squeezeOn ? 'COMPRESSED' : 'OFF';
  const squeezeTone = t.squeeze.firing ? 'bull' : t.squeeze.squeezeOn ? 'warn' : 'neutral';
  const vwapTone = t.vwapPosition === 'ABOVE' ? 'bull' : t.vwapPosition === 'BELOW' ? 'bear' : 'neutral';
  const VwapIcon = t.vwapPosition === 'ABOVE' ? TrendingUp : t.vwapPosition === 'BELOW' ? TrendingDown : Minus;

  const engines = [
    { label: 'Technical', weight: 40, score: e.technical, tone: '#4ADE80' },
    { label: 'Dealer', weight: 30, score: e.dealer, tone: '#C084FC' },
    { label: 'Contract', weight: 20, score: e.contract, tone: '#D9A15C' },
    { label: 'Learning', weight: 10, score: e.learning, tone: '#60A5FA' },
  ];

  return (
    <div className="rounded-xl border p-4 flex flex-col gap-4 shadow-2xl" style={{ borderColor: `${dirTone}55`, background: `linear-gradient(180deg, ${dirTone}0D, var(--surface))` }}>
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <Crosshair className="w-4 h-4" style={{ color: dirTone }} />
        <h2 className="text-xs font-black tracking-widest uppercase text-[var(--text-primary)]">Sky's Vision Plan — {plan.ticker} {optionExpiryLabel(selectedAsset)}</h2>
        <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-sm border ml-auto" style={{ color: dirTone, borderColor: `${dirTone}66`, background: `${dirTone}14` }}>
          <DirIcon className="w-3 h-3" /> {plan.direction}
        </span>
      </div>

      {/* Hero: composite gauge + signal-blend stacked bar */}
      <div className="grid grid-cols-1 sm:grid-cols-[132px_1fr] gap-3">
        <CompositeGauge score={e.composite} tone={dirTone} label="Composite" />
        <WeightStack engines={engines} composite={e.composite} />
      </div>

      {/* Headline contract */}
      <div className="flex items-center justify-between rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-tertiary)]">Target Contract</span>
        <span className="text-[16px] font-black tabular-nums" style={{ color: dirTone }}>{plan.ticker} {plan.contract}</span>
      </div>

      {/* Reasoned target ladder — vertical price rail */}
      <div className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">Price Ladder</span>
          <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-tertiary)]">Entry {fmt(plan.entryZone[0])}–{fmt(plan.entryZone[1])}</span>
        </div>
        <PriceLadder
          spot={spot}
          entryZone={plan.entryZone}
          stop={plan.stop}
          targets={plan.targets}
          tp1={plan.tp1}
          tp2={plan.tp2}
          isCall={plan.isCall}
          fmt={fmt}
        />
      </div>

      {/* Technical read — status chips + RSI meter */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <SignalChip label="EMA Stack" value={t.emaAlignment} tone={emaTone} icon={<EmaIcon className="w-3 h-3" />} />
        <SignalChip label="TTM Squeeze" value={squeezeLabel} tone={squeezeTone} icon={<Activity className="w-3 h-3" />} />
        <SignalChip label="VWAP" value={t.vwapPosition} tone={vwapTone} icon={<VwapIcon className="w-3 h-3" />} />
        <RsiMeter m1={t.rsi.m1} m5={t.rsi.m5} m15={t.rsi.m15} allRising={t.rsi.allRising} />
      </div>

      {/* Context meters — win rate + hold + flow + confirm + regime */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <MiniMeter label="Win Rate" value={plan.winRate} tone={plan.winRate >= 65 ? 'var(--success)' : plan.winRate >= 50 ? 'var(--warning)' : 'var(--danger)'} />
        <div className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2">
          <span className="text-[8px] font-black uppercase tracking-widest text-[var(--text-tertiary)] flex items-center gap-1"><Clock className="w-3 h-3" />Hold</span>
          <span className="text-[11px] font-black tabular-nums text-[var(--text-secondary)]">{plan.expectedHoldMin}m</span>
        </div>
        <div className="flex items-center justify-between rounded-lg border bg-[var(--surface)] px-2.5 py-2" style={{ borderColor: plan.dealerFlow.includes('Positive') ? 'color-mix(in srgb, var(--success) 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)' }}>
          <span className="text-[8px] font-black uppercase tracking-widest text-[var(--text-tertiary)]">Dealer Flow</span>
          <span className="text-[10px] font-black uppercase" style={{ color: plan.dealerFlow.includes('Positive') ? 'var(--success)' : 'var(--danger)' }}>{plan.dealerFlow.split(' ')[0]} γ</span>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2">
          <span className="text-[8px] font-black uppercase tracking-widest text-[var(--text-tertiary)]">Flow Confirm</span>
          <span className="flex items-center gap-1 text-[10px] font-black uppercase" style={{ color: plan.flowConfirmation ? 'var(--success)' : 'var(--text-tertiary)' }}>
            {plan.flowConfirmation ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}{plan.flowConfirmation ? 'Yes' : 'No'}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 col-span-2 sm:col-span-2">
          <span className="text-[8px] font-black uppercase tracking-widest text-[var(--text-tertiary)] flex items-center gap-1"><Activity className="w-3 h-3" />Regime</span>
          <span className="text-[10px] font-black uppercase text-[var(--text-secondary)] truncate ml-2">{plan.trendRegime}</span>
        </div>
      </div>

      {/* Long-form rationale, collapsed by default */}
      <WhyDisclosure rationale={plan.rationale} />

      <span className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-widest">Composite engine · technical confirmed by dealer flow · not financial advice</span>
    </div>
  );
}
