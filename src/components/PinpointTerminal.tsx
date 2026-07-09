import { useEffect } from 'react';
import { MarketDataProvider, useMarketData } from '../pinpoint/context/MarketDataContext';
import FlowMap from '../pinpoint/pages/gex/FlowMap';

/**
 * PinpointTerminal — the Live Terminal page: candlestick chart with the GEX-node
 * heatmap, the strike × expiry heatmap, and the multi-ticker flow board.
 *
 * Self-contained: `MarketDataProvider` drives a built-in Simulator so the chart
 * renders live without API keys and follows the active ticker. Live-data seam:
 * feed real data through `src/pinpoint/core/simulator.ts` (or publish a real
 * `MarketSnapshot` from the provider) — no chart-code changes needed.
 */

interface PinpointTerminalProps {
  /** Symbol to display. The self-contained Simulator synthesizes data for any
   *  symbol, so any ticker renders. Defaults to the Simulator's active ticker. */
  ticker?: string;
}

/** Keeps the self-contained Simulator's active ticker in sync with the Terminal's
 *  asset selector, so switching assets in Slayer switches the chart too. */
function TickerSync({ ticker }: { ticker?: string }) {
  const { activeTicker, changeTicker } = useMarketData();
  useEffect(() => {
    if (ticker && ticker.toUpperCase() !== activeTicker) {
      changeTicker(ticker);
    }
  }, [ticker, activeTicker, changeTicker]);
  return null;
}

export default function PinpointTerminal({ ticker }: PinpointTerminalProps) {
  return (
    <MarketDataProvider>
      <TickerSync ticker={ticker} />
      <div className="h-full min-h-0 overflow-y-auto rounded-lg border border-borderSubtle bg-canvas">
        <div className="space-y-4 p-4 text-textPrimary">
          <FlowMap />
        </div>
      </div>
    </MarketDataProvider>
  );
}
