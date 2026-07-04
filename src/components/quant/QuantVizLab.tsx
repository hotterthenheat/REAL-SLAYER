import React, { useMemo, useState } from 'react';
import { RefreshCw, Box, Activity, TrendingUp, Waves, Boxes } from 'lucide-react';
import EChart from '../ui/EChart';
import { ToggleGroup } from '../ui/ToggleGroup';
import { Term } from '../ui/Tooltip';
import { toast } from '../ui/toast';
import {
  candleMaVolumeOption,
  equityCurveOption,
  volSurfaceOption,
  riskScatter3DOption,
  dealerFlowFieldOption,
} from './echartOptions';

/**
 * QuantVizLab — a visual analytics strip for the Quant page, powered by ECharts /
 * echarts-gl. Every panel renders live-looking mock data out of the box (no API
 * keys); the generators in echartOptions.ts are the single seam to swap for a real
 * feed. GL panels code-split, so the ~1MB 3D runtime only loads on this page.
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
  const surface = useMemo(() => volSurfaceOption(), [seed]);
  const scatter = useMemo(() => riskScatter3DOption(), [seed]);
  const flow = useMemo(() => dealerFlowFieldOption(), [seed]);

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

      {/* Row 2: two GL surfaces */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <VizPanel
          title="Implied Vol Surface"
          term={<Term id="iv">Implied Vol Surface</Term>}
          subtitle="moneyness × tenor × IV (model)"
          icon={<Box />}
          height={380}
        >
          <EChart option={surface} gl />
        </VizPanel>
        <VizPanel
          title="Strike × IV × GEX"
          term={<><Term id="iv">IV</Term> × <Term id="gex">GEX</Term> risk cloud</>}
          subtitle="per-strike exposure scatter"
          icon={<Box />}
          height={380}
        >
          <EChart option={scatter} gl />
        </VizPanel>
      </div>

      {/* Row 3: dealer flow field (hero) */}
      <VizPanel title="Dealer Flow Field" subtitle="vector field · hedging pressure" icon={<Waves />} height={300}>
        <EChart option={flow} gl />
      </VizPanel>
    </section>
  );
}
