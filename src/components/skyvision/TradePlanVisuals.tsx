import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  TrendingUp, TrendingDown, Minus, Zap, Gauge, ChevronDown,
  ArrowRight, Waves, LineChart,
} from 'lucide-react';
import type { PlanTarget } from '../../lib/tradePlan';

/**
 * SkyVision trade-plan visuals — presentational only. Every visual encodes REAL
 * plan data (composite/engine scores, target ladder, technical read). No fabricated
 * values; each component takes the numbers straight off the TradePlan and draws them.
 */

export const REASON_TONE: Record<PlanTarget['reason'], string> = {
  'EMA Projection': '#60A5FA',
  'Liquidity Sweep': '#C084FC',
  'Loaded Strike': '#D9A15C',
  'GEX Wall': '#F87171',
};

// ── Composite gauge — the confidence/composite as a radial gauge + hero number ──
export function CompositeGauge({ score, tone, label = 'Composite' }: { score: number; tone: string; label?: string }) {
  const clamped = Math.max(0, Math.min(100, score));
  const R = 40;
  const L = Math.PI * R; // semicircle length
  const frac = clamped / 100;
  return (
    <div className="relative flex flex-col items-center justify-center bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-3">
      <svg viewBox="0 0 100 58" className="w-[132px] max-w-full" role="img" aria-label={`${label} ${clamped} of 100`}>
        <path d="M 8 50 A 42 42 0 0 1 92 50" fill="none" stroke="var(--surface-3)" strokeWidth="9" strokeLinecap="round" />
        <path
          d="M 8 50 A 42 42 0 0 1 92 50"
          fill="none"
          stroke={tone}
          strokeWidth="9"
          strokeLinecap="round"
          style={{ strokeDasharray: `${frac * L * 1.05} ${L * 1.05}`, transition: 'stroke-dasharray 0.6s ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-end pb-2 pointer-events-none">
        <span className="text-[26px] leading-none font-black tabular-nums" style={{ color: tone }}>{clamped}</span>
        <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-tertiary)] mt-1 flex items-center gap-1">
          <Gauge className="w-2.5 h-2.5" />{label}
        </span>
      </div>
    </div>
  );
}

// ── Weight stack — the 40/30/20/10 blend as a single stacked bar whose filled
//    length literally sums to the composite, decomposed by each engine's contribution. ──
interface Engine { label: string; weight: number; score: number; tone: string }
export function WeightStack({ engines, composite }: { engines: Engine[]; composite: number }) {
  return (
    <div className="flex flex-col gap-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-3">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-tertiary)]">Signal Blend</span>
        <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-tertiary)] tabular-nums">Filled = {composite}</span>
      </div>
      {/* Stacked contribution bar (out of 100) */}
      <div className="flex w-full h-3 rounded-sm overflow-hidden bg-[var(--surface-3)] border border-[var(--border)]">
        {engines.map((e) => {
          const contribution = (e.weight / 100) * e.score; // 0..weight, sums to composite
          return (
            <div
              key={e.label}
              title={`${e.label} ${e.weight}% × ${e.score} = ${contribution.toFixed(0)}`}
              style={{ width: `${contribution}%`, background: e.tone }}
              className="h-full"
            />
          );
        })}
      </div>
      {/* Legend — colour · label · weight · score */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {engines.map((e) => (
          <div key={e.label} className="flex items-center gap-1.5 min-w-0">
            <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: e.tone }} />
            <span className="text-[9px] font-black uppercase tracking-wider text-[var(--text-tertiary)] truncate">{e.label}</span>
            <span className="text-[9px] font-bold text-[var(--text-tertiary)] tabular-nums ml-auto">{e.weight}%</span>
            <span className="text-[10px] font-black tabular-nums w-6 text-right" style={{ color: e.tone }}>{e.score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Price ladder — vertical rail with current price marked and TP/stop zones shaded ──
interface LadderLevel { price: number; label: string; sub: string; tone: string; kind: 'target' | 'stop' }
export function PriceLadder({
  spot, entryZone, stop, targets, tp1, tp2, isCall, fmt,
}: {
  spot: number;
  entryZone: [number, number];
  stop: number;
  targets: PlanTarget[];
  tp1: number;
  tp2: number;
  isCall: boolean;
  fmt: (v: number) => string;
}) {
  const targetLevels: LadderLevel[] = targets.length
    ? targets.map((t, i) => ({ price: t.price, label: `TP${i + 1}`, sub: t.reason, tone: REASON_TONE[t.reason], kind: 'target' }))
    : [
        { price: tp1, label: 'TP1', sub: '0.5σ move', tone: '#4ADE80', kind: 'target' },
        { price: tp2, label: 'TP2', sub: '1.0σ move', tone: '#4ADE80', kind: 'target' },
      ];
  const stopLevel: LadderLevel = { price: stop, label: 'Stop', sub: '−0.5σ move', tone: 'var(--danger)', kind: 'stop' };
  const all = [...targetLevels, stopLevel];

  const prices = [spot, entryZone[0], entryZone[1], ...all.map((l) => l.price)].filter((v) => isFinite(v));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const PAD = 8; // % padding top/bottom so extreme markers aren't clipped
  const top = (p: number) => ((max - p) / range) * (100 - 2 * PAD) + PAD;

  const furthestTarget = targetLevels.reduce((a, b) => (Math.abs(b.price - spot) > Math.abs(a.price - spot) ? b : a), targetLevels[0]);
  // Green (profit) band: spot → furthest target. Red (risk) band: spot → stop.
  const greenTop = Math.min(top(spot), top(furthestTarget.price));
  const greenBot = Math.max(top(spot), top(furthestTarget.price));
  const redTop = Math.min(top(spot), top(stop));
  const redBot = Math.max(top(spot), top(stop));

  const RAIL_X = 10; // px

  return (
    <div className="relative w-full" style={{ height: 208 }}>
      {/* Entry band (neutral) across full width */}
      <div
        className="absolute left-0 right-0 rounded-sm bg-[var(--text-tertiary)]/8 border-y border-dashed border-[var(--border)]"
        style={{ top: `${top(entryZone[1])}%`, height: `${Math.max(6, top(entryZone[0]) - top(entryZone[1]))}%` }}
      />
      {/* Rail zones */}
      <div className="absolute rounded-full bg-[var(--success)]/25" style={{ left: RAIL_X, width: 6, top: `${greenTop}%`, height: `${greenBot - greenTop}%` }} />
      <div className="absolute rounded-full bg-[var(--danger)]/25" style={{ left: RAIL_X, width: 6, top: `${redTop}%`, height: `${redBot - redTop}%` }} />

      {/* Target + stop ticks and labels (right side) */}
      {all.map((lvl) => (
        <div key={lvl.label} className="absolute flex items-center gap-2" style={{ top: `${top(lvl.price)}%`, left: RAIL_X - 3, right: 0, transform: 'translateY(-50%)' }}>
          <span className="w-3 h-[2px] rounded-full shrink-0" style={{ background: lvl.tone }} />
          <span className="text-[10px] font-black uppercase tracking-wider tabular-nums shrink-0" style={{ color: lvl.tone }}>{lvl.label}</span>
          <span className="text-[11px] font-black tabular-nums text-[var(--text-primary)] shrink-0">{fmt(lvl.price)}</span>
          <span className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)] truncate">{lvl.sub}</span>
        </div>
      ))}

      {/* NOW marker — current price / entry mid */}
      <div className="absolute left-0 right-0 flex items-center gap-1.5" style={{ top: `${top(spot)}%`, transform: 'translateY(-50%)' }}>
        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-[var(--text-primary)] bg-[var(--surface-3)] border border-[var(--border-strong)] shrink-0">
          {isCall ? <TrendingUp className="w-2.5 h-2.5 text-[var(--success)]" /> : <TrendingDown className="w-2.5 h-2.5 text-[var(--danger)]" />}
          Now {fmt(spot)}
        </span>
        <span className="flex-1 border-t border-dashed border-[var(--border-strong)]" />
      </div>
    </div>
  );
}

// ── Signal chip — a technical read as an at-a-glance icon + coloured state ──
type ChipTone = 'bull' | 'bear' | 'warn' | 'neutral';
const CHIP_COLOR: Record<ChipTone, string> = {
  bull: 'var(--success)', bear: 'var(--danger)', warn: 'var(--warning)', neutral: 'var(--text-secondary)',
};
export function SignalChip({ label, value, tone, icon }: { label: string; value: string; tone: ChipTone; icon: React.ReactNode }) {
  const color = CHIP_COLOR[tone];
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-[var(--surface)] px-2.5 py-2" style={{ borderColor: tone === 'neutral' ? 'var(--border)' : `color-mix(in srgb, ${color} 30%, transparent)` }}>
      <span className="text-[8px] font-black uppercase tracking-widest text-[var(--text-tertiary)] truncate">{label}</span>
      <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-tight" style={{ color }}>
        <span aria-hidden="true">{icon}</span>{value}
      </span>
    </div>
  );
}

// ── RSI meter — a compact 0-100 track with a dot per timeframe + 30/70 guides ──
export function RsiMeter({ m1, m5, m15, allRising }: { m1: number; m5: number; m15: number; allRising: boolean }) {
  const dots = [
    { tf: '1m', v: m1 },
    { tf: '5m', v: m5 },
    { tf: '15m', v: m15 },
  ];
  const dotColor = (v: number) => (v >= 70 ? 'var(--danger)' : v <= 30 ? 'var(--success)' : 'var(--text-primary)');
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2">
      <div className="flex items-center justify-between">
        <span className="text-[8px] font-black uppercase tracking-widest text-[var(--text-tertiary)]">RSI · 1/5/15m</span>
        {allRising && <span className="text-[8px] font-black uppercase tracking-widest text-[var(--success)] flex items-center gap-0.5"><TrendingUp className="w-2.5 h-2.5" />Rising</span>}
      </div>
      <div className="relative h-2.5 w-full rounded-full bg-gradient-to-r from-[var(--success)]/20 via-[var(--surface-3)] to-[var(--danger)]/20 border border-[var(--border)]">
        {/* 30 / 70 guides */}
        <span className="absolute top-0 bottom-0 w-px bg-[var(--border-strong)]" style={{ left: '30%' }} />
        <span className="absolute top-0 bottom-0 w-px bg-[var(--border-strong)]" style={{ left: '70%' }} />
        {dots.map((d) => (
          <span
            key={d.tf}
            title={`${d.tf} RSI ${Math.round(d.v)}`}
            className="absolute top-1/2 w-2 h-2 rounded-full border border-[var(--surface)] shadow"
            style={{ left: `${Math.max(0, Math.min(100, d.v))}%`, background: dotColor(d.v), transform: 'translate(-50%, -50%)' }}
          />
        ))}
      </div>
      <div className="flex items-center justify-between text-[9px] font-bold tabular-nums text-[var(--text-tertiary)]">
        {dots.map((d) => (
          <span key={d.tf} className="flex items-center gap-1">
            <span className="opacity-70">{d.tf}</span>
            <span style={{ color: dotColor(d.v) }}>{Math.round(d.v)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Mini meter — a small labelled 0-100 gauge (win rate, etc.) ──
export function MiniMeter({ label, value, tone, suffix = '%' }: { label: string; value: number; tone: string; suffix?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2">
      <div className="flex items-center justify-between">
        <span className="text-[8px] font-black uppercase tracking-widest text-[var(--text-tertiary)] truncate">{label}</span>
        <span className="text-[11px] font-black tabular-nums" style={{ color: tone }}>{Math.round(value)}{suffix}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-[var(--surface-3)] overflow-hidden border border-[var(--border)]">
        <div className="h-full rounded-full" style={{ width: `${clamped}%`, background: tone }} />
      </div>
    </div>
  );
}

// ── Why disclosure — collapse the composite/rationale prose behind a toggle ──
export function WhyDisclosure({ rationale }: { rationale: string[] }) {
  const [open, setOpen] = useState(false);
  if (!rationale.length) return null;
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] rounded-lg"
      >
        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">Why this read</span>
        <ChevronDown className={`w-3.5 h-3.5 text-[var(--text-tertiary)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="px-3 pb-3 flex flex-col gap-1.5 overflow-hidden"
        >
          {rationale.map((r, i) => (
            <span key={i} className="text-[10px] leading-snug text-[var(--text-tertiary)] flex gap-1.5">
              <ArrowRight className="w-3 h-3 mt-0.5 shrink-0 text-[var(--text-tertiary)]" />{r}
            </span>
          ))}
        </motion.div>
      )}
    </div>
  );
}

// Re-exported icons so the card can build chip states without re-importing everywhere.
export const SignalIcons = { TrendingUp, TrendingDown, Minus, Zap, Waves, LineChart };
