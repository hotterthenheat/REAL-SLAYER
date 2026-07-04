import React, { useMemo, useState } from 'react';
import { RefreshCw, Box, Activity, TrendingUp, Waves, Boxes } from 'lucide-react';
import EChart from '../ui/EChart';
import { ToggleGroup } from '../ui/ToggleGroup';
import { Term } from '../ui/Tooltip';
import { toast } from '../ui/toast';
import { candleMaVolumeOption, equityCurveOption } from './echartOptions';
import ThreeSurface from './ThreeSurface';
import LazyMount from './LazyMount';
import { ivSurfaceGrid, riskCloudPoints, hedgingPressureGrid } from './surfaces';

/**
 * QuantVizLab — a visual analytics strip for the Quant page. 2D panels (intraday
 * candles, equity curve) use ECharts; the 3D surfaces (IV surface, IV×GEX risk cloud,
 * dealer hedging-pressure) use three.js via <ThreeSurface>, each wrapped in <LazyMount>
 * so only on-screen surfaces hold a WebGL context (bounding the context count that used
 * to blank the panels). Every panel renders live-looking model data out of the box; the
 * generators (echartOptions.ts / surfaces.ts) are the single seam to swap for a feed.
 */

function VizPanel({
  title,
  term,
  subtitle,
  icon,
  actions,
  height = 360,
  children,
}: {
  title: React.ReactNode;
  term?: React.ReactNode;
  subtitle?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  height?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          {icon && <span className="text-[var(--text-tertiary)] [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>}
          <span className="font-mono text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] truncate">
            {term ?? title}
          </span>
          {subtitle && <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-tertiary)] truncate hidden sm:inline">{subtitle}</span>}
        </div>
        {actions}
      </div>
      <div style={{ height }} className="relative w-full">
        {children}
      </div>
    </div>
  );
}

const TICKERS = ['SPY', 'QQQ', 'IWM', 'NVDA'] as const;
type Ticker = typeof TICKERS[number];

export default function QuantVizLab() {
  const [seed, setSeed] = useState(0);
  const [ticker, setTicker] = useState<Ticker>('SPY');

  // Options are regenerated when seed/ticker change (the "refresh" re-rolls mock).
  const candle = useMemo(() => candleMaVolumeOption(ticker), [ticker, seed]);
  const equity = useMemo(() => (echarts: any) => equityCurveOption(echarts), [seed]);
  const ivGrid = useMemo(() => ivSurfaceGrid(), [seed]);
  const riskCloud = useMemo(() => riskCloudPoints(), [seed]);
  const hedgeGrid = useMemo(() => hedgingPressureGrid(), [seed]);

  const refresh = () => { setSeed(s => s + 1); toast.info('Regenerated mock feed', { description: 'Swap generators for a live feed once API keys are set.' }); };

  return (
    <section className="space-y-4" id="quant-viz-lab" aria-label="Quant visual analytics">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Boxes className="h-4 w-4 text-[var(--accent-color)]" />
          <h2 className="font-mono text-xs font-black uppercase tracking-widest text-[var(--text-primary)]">Quant Lab · Visual Analytics</h2>
          <span className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-[var(--text-tertiary)]">mock feed</span>
        </div>
        <button
          onClick={refresh}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]"
        >
          <RefreshCw className="h-3 w-3" /> Regenerate
        </button>
      </div>

      {/* Row 1: intraday price (wide) + equity curve */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <VizPanel
          title="Intraday Price"
          subtitle="candles · MA20 · MA60 · volume"
          icon={<Activity />}
          height={380}
          actions={
            <ToggleGroup<Ticker>
              ariaLabel="Ticker"
              size="sm"
              value={ticker}
              onChange={setTicker}
              options={TICKERS.map(t => ({ value: t, label: t }))}
            />
          }
        >
          <EChart option={candle} />
        </VizPanel>

        <VizPanel title="Cumulative P&L" subtitle="equity curve" icon={<TrendingUp />} height={380}>
          <EChart option={equity} />
        </VizPanel>
      </div>

      {/* Row 2: two real 3D surfaces (three.js) — drag to orbit · scroll to zoom */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <VizPanel
          title="Implied Vol Surface"
          term={<Term id="iv">Implied Vol Surface</Term>}
          subtitle="moneyness × tenor × IV (model)"
          icon={<Box />}
          height={380}
        >
          <LazyMount minHeight={380}>
            <ThreeSurface grid={ivGrid} axisLabels={['Moneyness', 'Tenor', 'IV']} height={380} />
          </LazyMount>
        </VizPanel>
        <VizPanel
          title="Strike × IV × GEX"
          term={<><Term id="iv">IV</Term> × <Term id="gex">GEX</Term> risk cloud</>}
          subtitle="per-strike exposure scatter"
          icon={<Box />}
          height={380}
        >
          <LazyMount minHeight={380}>
            <ThreeSurface points={riskCloud} axisLabels={['Strike Δ', 'IV %', 'Net GEX']} height={380} />
          </LazyMount>
        </VizPanel>
      </div>

      {/* Row 3: dealer hedging-pressure surface (hero) */}
      <VizPanel title="Dealer Hedging Pressure" subtitle="strike × time-to-close × |hedging flow| (model)" icon={<Waves />} height={320}>
        <LazyMount minHeight={320}>
          <ThreeSurface grid={hedgeGrid} axisLabels={['Strike', 'Time → Close', 'Pressure']} height={320} />
        </LazyMount>
      </VizPanel>
    </section>
  );
}
