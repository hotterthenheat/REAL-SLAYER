import { lazy, Suspense, useMemo, useState } from 'react';
import { TrendingUp, Radio, FlaskConical } from 'lucide-react';
import { isTerminal, type TrackedSetup } from '../lib/trackedSetups';
import { cumulativePnlOption, type PnlPoint } from './quant/echartOptions';
import { DataStateBadge } from './ui/DataStateBadge';

const EChart = lazy(() => import('./ui/EChart'));

/**
 * TrackedPnlCurve — an HONEST "if you took every SkyVision/Pinpoint callout" equity curve.
 *
 * It plots ONLY realized outcomes: the running sum of each resolved setup's finalReturnPct,
 * equal-weight, in resolution order. It never invents data — with no resolved setups it shows
 * an awaiting state. Live and model/sample callouts are kept on separate curves (toggle) so a
 * demo run can never be shown as real P&L. Units are cumulative % return (equal-weight per
 * callout), not dollars — we don't know position size, and we say so.
 */

function readVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function hexToRgba(hex: string, a: number): string {
  const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function buildCurve(setups: TrackedSetup[]): PnlPoint[] {
  const resolved = setups
    .filter(s => isTerminal(s.status) && s.status !== 'CANCELLED' && s.finalReturnPct != null && s.resolvedAt != null)
    .sort((a, b) => (a.resolvedAt! - b.resolvedAt!));
  if (resolved.length === 0) return [];
  let cum = 0;
  const pts: PnlPoint[] = [{ date: 'Start', cum: 0 }];
  for (const s of resolved) {
    cum += s.finalReturnPct!;
    const d = new Date(s.resolvedAt!);
    pts.push({ date: `${d.getMonth() + 1}/${d.getDate()}`, cum });
  }
  return pts;
}

const CARD = 'bg-[var(--surface)] border border-[var(--border)] rounded-lg';

export function TrackedPnlCurve({ live, modelSample }: { live: TrackedSetup[]; modelSample: TrackedSetup[] }) {
  const liveCurve = useMemo(() => buildCurve(live), [live]);
  const modelCurve = useMemo(() => buildCurve(modelSample), [modelSample]);

  const hasLive = liveCurve.length > 1;
  const hasModel = modelCurve.length > 1;
  // Default to the live curve when there's real performance; otherwise fall back to model/sample.
  const [bucket, setBucket] = useState<'live' | 'model'>('live');
  const active = bucket === 'live' ? (hasLive ? liveCurve : modelCurve) : (hasModel ? modelCurve : liveCurve);
  const showingLive = bucket === 'live' ? hasLive : !hasModel && hasLive;

  if (!hasLive && !hasModel) {
    return (
      <div className={`${CARD} p-5`}>
        <Header />
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <TrendingUp className="w-6 h-6 text-[var(--text-tertiary)]" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">No resolved callouts yet</span>
          <span className="text-[10px] text-[var(--text-tertiary)] leading-relaxed max-w-xs">
            Once tracked setups reach a target or invalidation, your cumulative return builds here — the honest running total of taking every callout, equal-weight.
          </span>
        </div>
      </div>
    );
  }

  const cum = active[active.length - 1]?.cum ?? 0;
  const up = cum >= 0;
  const lineHex = readVar(up ? '--success' : '--danger', up ? '#4ADE80' : '#F87171');
  const chartColors = {
    line: lineHex,
    areaTop: hexToRgba(lineHex, 0.28),
    areaBottom: hexToRgba(lineHex, 0.02),
    axis: readVar('--border', 'rgba(255,255,255,0.10)'),
    grid: readVar('--border', 'rgba(255,255,255,0.06)'),
    text: readVar('--text-tertiary', '#A3A3A3'),
    zero: readVar('--text-tertiary', '#A3A3A3'),
  };
  const resolvedCount = active.length - 1;

  return (
    <div className={`${CARD} p-5`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <Header />
        {hasLive && hasModel && (
          <div className="flex rounded-md border border-[var(--border)] overflow-hidden shrink-0" role="group" aria-label="Performance source">
            <button
              onClick={() => setBucket('live')}
              aria-pressed={bucket === 'live'}
              className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-widest flex items-center gap-1 transition-colors ${bucket === 'live' ? 'bg-[var(--success)]/15 text-[var(--success)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
            >
              <Radio className="w-2.5 h-2.5" /> Live
            </button>
            <button
              onClick={() => setBucket('model')}
              aria-pressed={bucket === 'model'}
              className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-widest flex items-center gap-1 border-l border-[var(--border)] transition-colors ${bucket === 'model' ? 'bg-[var(--info)]/15 text-[var(--info)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
            >
              <FlaskConical className="w-2.5 h-2.5" /> Model
            </button>
          </div>
        )}
      </div>

      {/* Hero cumulative return + provenance */}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2 mb-3">
        <div>
          <div className="text-[9px] text-[var(--text-tertiary)] uppercase font-bold tracking-widest mb-1">Cumulative return</div>
          <div className={`text-4xl font-black leading-none ${up ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
            {up ? '+' : ''}{cum.toFixed(1)}%
          </div>
        </div>
        <div className="flex items-center gap-3 pb-1">
          <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest tabular-nums">{resolvedCount} callout{resolvedCount === 1 ? '' : 's'}</span>
          <DataStateBadge state={showingLive ? 'live' : 'model'} label={showingLive ? 'Live Performance' : 'Model / Sample'} />
        </div>
      </div>

      <div style={{ height: 220 }} className="w-full">
        <Suspense fallback={<div className="w-full h-full animate-pulse bg-[var(--surface-2)] rounded" />}>
          <EChart option={(echarts) => cumulativePnlOption(active, chartColors, echarts)} notMerge />
        </Suspense>
      </div>
      <p className="mt-2 text-[9px] text-[var(--text-tertiary)] leading-relaxed uppercase tracking-wider">
        Equal-weight sum of each resolved callout's realized % return, in resolution order. Not dollar P&amp;L — position size isn't known{showingLive ? '' : ' · model/sample tracks, not live performance'}.
      </p>
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-center gap-2">
      <TrendingUp className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
      <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-primary)]">Callout Equity Curve</span>
    </div>
  );
}

export default TrackedPnlCurve;
