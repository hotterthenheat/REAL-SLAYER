import React, { useId, useState } from 'react';
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
  'EMA Projection': 'var(--call)',       // price-derived projection — steel-blue
  'Liquidity Sweep': 'var(--greek)',     // purple, keyed distinct from price/wall
  'Loaded Strike': 'var(--pin)',         // premium/OI-loaded strike — gold
  'GEX Wall': 'var(--negative-ink)',     // dealer wall — rose
};

// ── Composite gauge — the confidence/composite as a radial gauge + hero number ──
export function CompositeGauge({ score, tone, label = 'Composite' }: { score: number; tone: string; label?: string }) {
  const clamped = Math.max(0, Math.min(100, score));
  const R = 40;
  const L = Math.PI * R; // semicircle length
  const frac = clamped / 100;
  const gid = useId().replace(/[:]/g, '');
  return (
    <div className="relative flex flex-col items-center justify-center bg-[var(--surface)] border border-[var(--border)] rounded-sm px-3 py-3 min-w-0">
      <svg viewBox="0 0 100 58" className="w-[132px] max-w-full" role="img" aria-label={`${label} ${clamped} of 100`}>
        <defs>
          <linearGradient id={`cg-${gid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={tone} stopOpacity="0.55" />
            <stop offset="1" stopColor={tone} stopOpacity="1" />
          </linearGradient>
        </defs>
        {/* Track */}
        <path d="M 8 50 A 42 42 0 0 1 92 50" fill="none" stroke="var(--surface-3)" strokeWidth="9" strokeLinecap="butt" />
        {/* Faint tick scale over the track */}
        <path d="M 8 50 A 42 42 0 0 1 92 50" fill="none" stroke="var(--border-strong)" strokeWidth="9" strokeLinecap="butt" style={{ strokeDasharray: '0.75 7.85', opacity: 0.6 }} />
        {/* Value arc */}
        <path
          d="M 8 50 A 42 42 0 0 1 92 50"
          fill="none"
          stroke={`url(#cg-${gid})`}
          strokeWidth="9"
          strokeLinecap="butt"
          className="transition-[stroke-dasharray] duration-700 ease-out motion-reduce:transition-none"
          style={{ strokeDasharray: `${frac * L * 1.05} ${L * 1.05}` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-end pb-2 pointer-events-none">
        <span className="flex items-end gap-0.5">
          <span className="text-[26px] leading-none font-black tabular-nums" style={{ color: tone }}>{clamped}</span>
          <span className="text-[9px] font-bold tabular-nums text-[var(--text-tertiary)] mb-0.5">/100</span>
        </span>
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
  const clampedComposite = Math.max(0, Math.min(100, composite));
  return (
    <div className="flex flex-col gap-2 bg-[var(--surface)] border border-[var(--border)] rounded-sm px-3 py-3 min-w-0">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-tertiary)]">Signal Blend</span>
        <span className="inline-flex items-baseline gap-1 rounded-sm border border-[var(--border)] bg-[var(--surface-3)] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-[var(--text-tertiary)] tabular-nums">
          Filled <span className="text-[var(--text-secondary)]">{composite}</span>
        </span>
      </div>
      {/* Stacked contribution bar (out of 100) with a composite end-marker */}
      <div className="relative">
        <div className="flex w-full h-4 rounded-sm overflow-hidden bg-[var(--surface-3)] border border-[var(--border)]">
          {engines.map((e) => {
            const contribution = (e.weight / 100) * e.score; // 0..weight, sums to composite
            return (
              <div
                key={e.label}
                title={`${e.label} ${e.weight}% × ${e.score} = ${contribution.toFixed(0)}`}
                style={{ width: `${contribution}%`, background: `linear-gradient(180deg, color-mix(in srgb, ${e.tone} 78%, #fff 22%), ${e.tone})`, boxShadow: 'inset -1px 0 0 rgba(0,0,0,0.28)' }}
                className="h-full"
              />
            );
          })}
        </div>
        {/* composite fill terminus + baseline scale */}
        <span
          className="absolute -top-0.5 -bottom-0.5 w-px bg-[var(--text-primary)]/60 pointer-events-none"
          style={{ left: `calc(${clampedComposite}% - 0.5px)` }}
          aria-hidden="true"
        />
        <div className="absolute inset-x-0 -bottom-2 flex justify-between pointer-events-none" aria-hidden="true">
          {[0, 25, 50, 75, 100].map((t) => (
            <span key={t} className="w-px h-1 bg-[var(--border-strong)]" />
          ))}
        </div>
      </div>
      {/* Legend — colour · label · weight · score */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-1.5">
        {engines.map((e) => (
          <div key={e.label} className="flex items-center gap-1.5 min-w-0">
            <span className="w-2 h-2 rounded-[1px] shrink-0" style={{ background: e.tone }} />
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
        { price: tp1, label: 'TP1', sub: '0.5σ move', tone: 'var(--positive-ink)', kind: 'target' },
        { price: tp2, label: 'TP2', sub: '1.0σ move', tone: 'var(--positive-ink)', kind: 'target' },
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

  // Reward / risk as a compact proportional ratio (pure visual read of the same prices).
  const reward = Math.abs(furthestTarget.price - spot);
  const risk = Math.abs(spot - stop);
  const rrDenom = reward + risk || 1;
  const rr = risk > 0 ? reward / risk : 0;

  const RAIL_X = 12; // px — vertical scale axis position

  return (
    <div className="flex flex-col gap-2.5 w-full min-w-0">
      <div className="relative w-full min-w-0" style={{ height: 208 }}>
        {/* Zone tints — profit (green) / risk (red) columns behind the rail */}
        <div
          className="absolute rounded-sm pointer-events-none"
          style={{ left: 0, width: 54, top: `${greenTop}%`, height: `${greenBot - greenTop}%`, background: 'color-mix(in srgb, var(--positive-ink) 9%, transparent)' }}
          aria-hidden="true"
        />
        <div
          className="absolute rounded-sm pointer-events-none"
          style={{ left: 0, width: 54, top: `${redTop}%`, height: `${redBot - redTop}%`, background: 'color-mix(in srgb, var(--negative-ink) 9%, transparent)' }}
          aria-hidden="true"
        />

        {/* Vertical scale axis */}
        <span className="absolute top-0 bottom-0 w-px bg-[var(--border-strong)]" style={{ left: RAIL_X }} aria-hidden="true" />

        {/* Entry band (neutral) across full width */}
        <div
          className="absolute left-0 right-0 rounded-sm bg-[var(--text-tertiary)]/8 border-y border-dashed border-[var(--border)]"
          style={{ top: `${top(entryZone[1])}%`, height: `${Math.max(6, top(entryZone[0]) - top(entryZone[1]))}%` }}
        />

        {/* Rail zone fills — bright ink segments riding the axis */}
        <div className="absolute rounded-full" style={{ left: RAIL_X - 2, width: 5, top: `${greenTop}%`, height: `${greenBot - greenTop}%`, background: 'var(--positive-ink)', opacity: 0.85 }} aria-hidden="true" />
        <div className="absolute rounded-full" style={{ left: RAIL_X - 2, width: 5, top: `${redTop}%`, height: `${redBot - redTop}%`, background: 'var(--negative-ink)', opacity: 0.85 }} aria-hidden="true" />

        {/* Target + stop pins — marker on rail, leader line, dense mono label */}
        {all.map((lvl) => (
          <div key={lvl.label} className="absolute flex items-center" style={{ top: `${top(lvl.price)}%`, left: 0, right: 0, transform: 'translateY(-50%)' }}>
            {/* pin diamond on the axis */}
            <span className="absolute w-2 h-2 rotate-45 rounded-[1px] border border-[var(--surface)] shrink-0" style={{ left: RAIL_X - 4, background: lvl.tone }} />
            {/* leader line */}
            <span className="absolute h-px border-t border-dashed" style={{ left: RAIL_X + 6, width: 14, borderColor: `color-mix(in srgb, ${lvl.tone} 55%, transparent)` }} />
            <span className="flex items-center gap-2 pl-[34px] min-w-0">
              <span className="text-[10px] font-black uppercase tracking-wider tabular-nums shrink-0" style={{ color: lvl.tone }}>{lvl.label}</span>
              <span className="text-[11px] font-black tabular-nums text-[var(--text-primary)] shrink-0">{fmt(lvl.price)}</span>
              <span className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)] truncate">{lvl.sub}</span>
            </span>
          </div>
        ))}

        {/* NOW marker — current price / entry mid (fair value) */}
        <div className="absolute left-0 right-0 flex items-center gap-1.5" style={{ top: `${top(spot)}%`, transform: 'translateY(-50%)' }}>
          <span className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-[var(--text-primary)] bg-[var(--surface-3)] border border-[var(--border-strong)] shrink-0">
            {isCall ? <TrendingUp className="w-2.5 h-2.5 text-[var(--positive-ink)]" /> : <TrendingDown className="w-2.5 h-2.5 text-[var(--negative-ink)]" />}
            Now {fmt(spot)}
          </span>
          <span className="flex-1 border-t border-dashed border-[var(--border-strong)]" />
        </div>
      </div>

      {/* Reward : Risk — compact proportional ratio bar */}
      <div className="flex items-center gap-2 min-w-0 border-t border-[var(--border)] pt-2">
        <span className="text-[8px] font-black uppercase tracking-widest text-[var(--text-tertiary)] shrink-0">R : R</span>
        <div className="flex-1 flex h-2.5 rounded-sm overflow-hidden border border-[var(--border)] min-w-0" role="img" aria-label={`Reward to risk ${rr.toFixed(1)} to 1`}>
          <div
            className="h-full min-w-0"
            style={{ width: `${(reward / rrDenom) * 100}%`, background: 'linear-gradient(90deg, color-mix(in srgb, var(--positive-ink) 55%, transparent), var(--positive-ink))' }}
            title={`Reward ${fmt(reward)}`}
          />
          <div
            className="h-full min-w-0"
            style={{ width: `${(risk / rrDenom) * 100}%`, background: 'linear-gradient(90deg, var(--negative-ink), color-mix(in srgb, var(--negative-ink) 55%, transparent))' }}
            title={`Risk ${fmt(risk)}`}
          />
        </div>
        <span className="text-[10px] font-black tabular-nums shrink-0" style={{ color: 'var(--positive-ink)' }}>{rr.toFixed(1)}<span className="text-[var(--text-tertiary)]">:1</span></span>
      </div>
    </div>
  );
}

// ── Signal chip — a technical read as an at-a-glance icon + coloured state ──
type ChipTone = 'bull' | 'bear' | 'warn' | 'neutral';
const CHIP_COLOR: Record<ChipTone, string> = {
  bull: 'var(--positive-ink)', bear: 'var(--negative-ink)', warn: 'var(--warning)', neutral: 'var(--text-secondary)',
};
export function SignalChip({ label, value, tone, icon }: { label: string; value: string; tone: ChipTone; icon: React.ReactNode }) {
  const color = CHIP_COLOR[tone];
  return (
    <div
      className="relative flex flex-col gap-1 rounded-sm border bg-[var(--surface)] pl-3 pr-2.5 py-2 min-w-0 overflow-hidden"
      style={{ borderColor: tone === 'neutral' ? 'var(--border)' : `color-mix(in srgb, ${color} 30%, transparent)` }}
    >
      {/* accent spine keys the chip state */}
      <span className="absolute inset-y-0 left-0 w-0.5" style={{ background: tone === 'neutral' ? 'var(--border-strong)' : color }} aria-hidden="true" />
      <span className="text-[8px] font-black uppercase tracking-widest text-[var(--text-tertiary)] truncate">{label}</span>
      <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-tight" style={{ color }}>
        <span aria-hidden="true">{icon}</span><span className="truncate">{value}</span>
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
  const dotColor = (v: number) => (v >= 70 ? 'var(--negative-ink)' : v <= 30 ? 'var(--positive-ink)' : 'var(--text-primary)');
  return (
    <div className="flex flex-col gap-1.5 rounded-sm border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 min-w-0">
      <div className="flex items-center justify-between">
        <span className="text-[8px] font-black uppercase tracking-widest text-[var(--text-tertiary)]">RSI · 1/5/15m</span>
        {allRising && <span className="text-[8px] font-black uppercase tracking-widest text-[var(--positive-ink)] flex items-center gap-0.5"><TrendingUp className="w-2.5 h-2.5" />Rising</span>}
      </div>
      <div className="relative h-2.5 w-full rounded-sm bg-gradient-to-r from-[var(--positive-soft)] via-[var(--surface-3)] to-[var(--negative-soft)] border border-[var(--border)]">
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
    <div className="flex flex-col gap-1 rounded-sm border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 min-w-0">
      <div className="flex items-center justify-between">
        <span className="text-[8px] font-black uppercase tracking-widest text-[var(--text-tertiary)] truncate">{label}</span>
        <span className="inline-flex items-baseline rounded-sm border px-1 py-px text-[11px] font-black tabular-nums" style={{ color: tone, borderColor: `color-mix(in srgb, ${tone} 32%, transparent)`, background: `color-mix(in srgb, ${tone} 10%, transparent)` }}>{Math.round(value)}{suffix}</span>
      </div>
      <div className="relative h-2 w-full rounded-sm bg-[var(--surface-3)] overflow-hidden border border-[var(--border)]">
        {/* faint 25/50/75 scale */}
        {[25, 50, 75].map((t) => (
          <span key={t} className="absolute top-0 bottom-0 w-px bg-[var(--border-strong)]/60" style={{ left: `${t}%` }} aria-hidden="true" />
        ))}
        <div className="relative h-full rounded-sm" style={{ width: `${clamped}%`, background: `linear-gradient(90deg, color-mix(in srgb, ${tone} 50%, transparent), ${tone})` }} />
      </div>
    </div>
  );
}

// ── Why disclosure — collapse the composite/rationale prose behind a toggle ──
export function WhyDisclosure({ rationale }: { rationale: string[] }) {
  const [open, setOpen] = useState(false);
  if (!rationale.length) return null;
  return (
    <div className="rounded-sm border border-[var(--border)] bg-[var(--surface)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] rounded-sm"
      >
        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">Why this read</span>
        <ChevronDown className={`w-3.5 h-3.5 text-[var(--text-tertiary)] transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
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
