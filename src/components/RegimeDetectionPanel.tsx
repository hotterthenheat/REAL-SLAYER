/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * MARKET REGIME DETECTION
 * -----------------------
 * Surfaces the existing validated regime engine (src/lib/regimeEngine.ts) — NOT
 * a second copy. The classification is driven entirely by MEASURABLE features,
 * never arbitrary labels:
 *
 *   • Hurst exponent (R/S persistence)      → trending vs mean-reverting
 *   • Ornstein-Uhlenbeck half-life          → speed of pull-to-equilibrium
 *   • realized-vol term ratio (near/base)   → vol expansion vs compression
 *   • EMA-pinch percentile + ATR expansion  → coiling vs breaking
 *   • return kurtosis                        → tail risk
 *
 * Each feature is shown with its raw value so the regime read is fully auditable.
 */
import { useMemo, useRef } from 'react';
import {
  classifyRegime, ornsteinUhlenbeck, volCompression, volExpansion, forwardVolMatrix,
  type RegimeState,
} from '../lib/regimeEngine';
import { ChartTools } from './quant/chartInteraction';

/** Minimal OHLC shape — decoupled from the two platform Candle types; the engine only reads these fields. */
interface CandleLike { open: number; high: number; low: number; close: number; volume: number; timestamp?: number }

interface RegimeDetectionPanelProps {
  candles: CandleLike[];
  intervalMinutes?: number;
  ticker?: string;
}

const STATE_META: Record<RegimeState, { label: string; color: string; note: string }> = {
  TREND_EXPANSION: { label: 'Trend / Expansion', color: 'var(--success)', note: 'persistent, directional — momentum favored' },
  MEAN_REVERSION: { label: 'Mean Reversion', color: 'var(--info)', note: 'anti-persistent — fade extremes to equilibrium' },
  TAIL_RISK: { label: 'Tail Risk', color: 'var(--danger)', note: 'fat-tailed / vol shock — size down, respect gaps' },
};

export function RegimeDetectionPanel({ candles, intervalMinutes = 5, ticker }: RegimeDetectionPanelProps) {
  const m = useMemo(() => {
    if (!Array.isArray(candles) || candles.length < 30) return null;
    const closes = candles.map((c) => c.close).filter((x) => x > 0 && isFinite(x));
    const cs = candles as any[]; // engine reads OHLC only
    const regime = classifyRegime(cs);
    const ou = ornsteinUhlenbeck(closes, intervalMinutes);
    const comp = volCompression(cs);
    const exp = volExpansion(cs);
    const rvTerm = forwardVolMatrix(cs);
    return { regime, ou, comp, exp, rvTerm };
  }, [candles, intervalMinutes]);

  const wrapRef = useRef<HTMLDivElement>(null);

  if (!m) {
    return (
      <div className="h-[200px] rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] flex items-center justify-center">
        <span className="text-[11px] text-[var(--text-muted)] uppercase tracking-[0.14em]">Regime needs more candle history</span>
      </div>
    );
  }

  const { regime, ou, comp, exp, rvTerm } = m;
  const meta = STATE_META[regime.state];
  const hurst = regime.hurst;
  const persistence = hurst > 0.55 ? 'persistent (trending)' : hurst < 0.45 ? 'anti-persistent (reverting)' : 'random walk';
  const hl = isFinite(ou.halfLifeMinutes) ? `${ou.halfLifeMinutes < 600 ? `${ou.halfLifeMinutes.toFixed(0)}m` : `${(ou.halfLifeMinutes / 60).toFixed(1)}h`}` : '—';

  const order: RegimeState[] = ['TREND_EXPANSION', 'MEAN_REVERSION', 'TAIL_RISK'];

  const Cell = ({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) => (
    <div className="flex flex-col gap-0.5 px-2.5 py-1.5 rounded-[var(--radius-control)] bg-[var(--bg-panel-soft)] border border-[var(--border-subtle)]">
      <span className="text-[9px] uppercase tracking-[0.14em] text-[var(--text-muted)] leading-none">{label}</span>
      <span className="text-[12px] font-bold tabular-nums leading-tight slayer-num" style={{ color: tone || 'var(--text-primary)' }}>{value}</span>
      {sub && <span className="text-[9px] text-[var(--text-faint)] leading-tight">{sub}</span>}
    </div>
  );

  return (
    <div ref={wrapRef} className="flex flex-col">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2 mb-0.5">
        <span className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[var(--text-muted)]">
          Candle-Series Classifier{ticker ? ` · ${ticker}` : ''}
        </span>
        <div className="flex items-center gap-2">
          <ChartTools name={`regime-${ticker || 'spx'}`} fullscreenRef={wrapRef}
            csv={() => ({
              headers: ['feature', 'value'],
              rows: [
                ['regime', regime.state],
                ['confidence_pct', regime.transitionProb],
                ['hurst', hurst.toFixed(4)],
                ['ou_half_life_min', isFinite(ou.halfLifeMinutes) ? ou.halfLifeMinutes.toFixed(1) : 'inf'],
                ['ou_mean_reverting', ou.meanReverting ? 1 : 0],
                ['vol_compression_score', comp.score.toFixed(4)],
                ['vol_expansion_score', exp.score.toFixed(4)],
                ['rv_term_ratio_score', rvTerm.score.toFixed(4)],
                ['posterior_trend', regime.posteriors.TREND_EXPANSION.toFixed(4)],
                ['posterior_mean_reversion', regime.posteriors.MEAN_REVERSION.toFixed(4)],
                ['posterior_tail_risk', regime.posteriors.TAIL_RISK.toFixed(4)],
              ],
            })} />
          <span className="text-[9px] font-semibold tracking-[0.14em] px-1.5 py-0.5 rounded-[var(--radius-control)] uppercase" style={{ color: 'var(--info)', background: 'color-mix(in srgb, var(--info) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--info) 30%, transparent)' }} title="Gaussian-feature classifier over Hurst / realized-vol / kurtosis — measurable, not labeled by hand.">Model</span>
        </div>
      </div>

      {/* Classified regime + confidence */}
      <div className="py-3 flex items-center gap-3 border-b border-[var(--border-subtle)]">
        <span className="w-1 self-stretch rounded-[1px] shrink-0" style={{ background: meta.color }} />
        <div className="flex flex-col">
          <span className="text-[15px] font-bold tracking-wide" style={{ color: meta.color }}>{meta.label}</span>
          <span className="text-[10px] text-[var(--text-muted)]">{meta.note}</span>
        </div>
        <span className="ml-auto text-[12px] font-bold tabular-nums slayer-num text-[var(--text-primary)]">{regime.transitionProb}%<span className="text-[9px] text-[var(--text-faint)] font-medium"> conf</span></span>
      </div>

      {/* Posteriors */}
      <div className="py-2.5 border-b border-[var(--border-subtle)] flex flex-col gap-1.5">
        {order.map((s) => {
          const p = regime.posteriors[s];
          const c = STATE_META[s].color;
          return (
            <div key={s} className="flex items-center gap-2">
              <span className="text-[9px] uppercase tracking-[0.14em] text-[var(--text-muted)] w-28 shrink-0">{STATE_META[s].label}</span>
              <div className="flex-1 h-2 rounded-[2px] bg-[var(--bg-panel-soft)] overflow-hidden">
                <div className="h-full rounded-[1px]" style={{ width: `${Math.max(2, p * 100)}%`, background: c, opacity: s === regime.state ? 1 : 0.5 }} />
              </div>
              <span className="text-[10px] tabular-nums slayer-num text-[var(--text-secondary)] w-9 text-right">{(p * 100).toFixed(0)}%</span>
            </div>
          );
        })}
      </div>

      {/* Measurable features */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 py-2.5">
        <Cell label="Hurst exponent" value={hurst.toFixed(3)} sub={persistence} tone={hurst > 0.55 ? 'var(--success)' : hurst < 0.45 ? 'var(--info)' : 'var(--text-primary)'} />
        <Cell label="OU half-life" value={hl} sub={ou.meanReverting ? 'mean-reverting' : 'non-reverting'} tone={ou.meanReverting ? 'var(--info)' : 'var(--text-secondary)'} />
        <Cell label="Vol compression" value={comp.score.toFixed(2)} sub={comp.detail} tone={comp.active ? 'var(--warning)' : 'var(--text-secondary)'} />
        <Cell label="Vol expansion" value={exp.score.toFixed(2)} sub={exp.detail} tone={exp.active ? 'var(--danger)' : 'var(--text-secondary)'} />
        <Cell label="RV term ratio" value={rvTerm.detail.match(/[\d.]+×/)?.[0] ?? rvTerm.score.toFixed(2)} sub="near / baseline realized vol" tone={rvTerm.active ? 'var(--warning)' : 'var(--text-secondary)'} />
      </div>

      <div className="py-2 border-t border-[var(--border-subtle)] text-[9px] text-[var(--text-muted)] leading-relaxed">
        <span className="font-semibold text-[var(--text-secondary)]">Features</span> Hurst R/S persistence · OU pull-to-equilibrium half-life · EMA-pinch percentile · ATR expansion · near/baseline realized-vol ratio · return kurtosis ·{' '}
        <span className="font-semibold text-[var(--text-secondary)]">Method</span> Gaussian-feature softmax over the measurable state energies (keyless HMM-equivalent) — every input above is observable, none hand-labeled
      </div>
    </div>
  );
}
