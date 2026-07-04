import { useEffect, useMemo, useRef } from 'react';
import { MarketDataProvider, useMarketData } from '../pinpoint/context/MarketDataContext';
import { buildGexView } from '../pinpoint/data/gex';
import StrikeChart from '../pinpoint/components/gex/StrikeChart';
import type { OverlayMode, StrikeRange } from '../pinpoint/types/gex';
import type { Timeframe } from '../pinpoint/data/timeframe';

/**
 * PinpointChart — the compact, chart-only cut of the PinPoint Flow Map: just the
 * candlestick chart with the GEX-node heatmap and call/put/flip/king level lines,
 * sized to fill whatever panel it's dropped into. Use this in tight chart slots
 * (SkyVision's contract cockpit, the Pinpoint Profile view) where the full Flow
 * Map page would be cramped; use PinpointTerminal for full-page placements.
 *
 * Self-contained: MarketDataProvider drives the built-in Simulator, so it renders
 * live with no API keys and follows the surrounding asset selector.
 */

interface PinpointChartProps {
  ticker?: string;
  /** Minimum chart height in px; the chart flex-grows to fill taller slots. */
  height?: number;
  timeframe?: Timeframe;
  overlay?: OverlayMode;
}

function PinpointChartInner({ ticker, height = 200, timeframe = '1m', overlay = 'BOTH' }: PinpointChartProps) {
  const { activeTicker, marketData, changeTicker } = useMarketData();

  useEffect(() => {
    if (ticker && ticker.toUpperCase() !== activeTicker) changeTicker(ticker);
  }, [ticker, activeTicker, changeTicker]);

  const revRef = useRef(0);
  const revision = useMemo(() => ++revRef.current, [marketData]);
  const view = useMemo(
    () => (marketData ? buildGexView(marketData, 'GEX', 10 as StrikeRange) : null),
    [marketData]
  );

  if (!view || !marketData) {
    return (
      <div className="h-full w-full flex items-center justify-center rounded-md border border-borderSubtle bg-inset">
        <div className="h-6 w-6 rounded-full border-t-2 border-textSecondary animate-spin" aria-label="Loading chart" />
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col text-textPrimary">
      <StrikeChart
        ticker={activeTicker}
        revision={revision}
        levels={view.levels}
        overlay={overlay}
        timeframe={timeframe}
        height={height}
      />
    </div>
  );
}

export default function PinpointChart(props: PinpointChartProps) {
  return (
    <MarketDataProvider>
      <PinpointChartInner {...props} />
    </MarketDataProvider>
  );
}
