import { useEffect } from 'react';
import { MarketDataProvider, useMarketData } from '../pinpoint/context/MarketDataContext';
import FlowMap from '../pinpoint/pages/gex/FlowMap';

/**
 * PinpointTerminal — PinPoint's "Flow Map" chart page transplanted into Slayer as
 * the Terminal sub-view of the Pinpoint GEX tab. It renders the candlestick chart
 * with the GEX-node heatmap, the strike × expiry heatmap (the pink/blue grid), and
 * the multi-ticker flow board (mini candle panes + net-GEX strike ladders).
 *
 * Fully self-contained: `MarketDataProvider` drives a built-in Simulator that
 * generates OHLC bars + GEX snapshots, so the chart renders live WITHOUT any API
 * keys. That keeps the terminal working today and — because the Simulator
 * synthesizes data for any symbol — it follows whatever ticker the Terminal's asset
 * selector is on.
 *
 * LIVE-DATA SEAM: once real market API keys/data are available, feed the real feed
 * into `src/pinpoint/core/simulator.ts` (or have `MarketDataProvider` publish a real
 * `MarketSnapshot` each tick). `FlowMap` and the chart components consume whatever
 * the provider / Simulator return, so going live needs no changes to chart code.
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
