import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MarketDataProvider, useMarketData } from '../pinpoint/context/MarketDataContext';
import { buildGexView, fmtUsd } from '../pinpoint/data/gex';
import SegmentedControl from '../pinpoint/components/ui/SegmentedControl';
import StrikeChart from '../pinpoint/components/gex/StrikeChart';
import GexMatrix from '../pinpoint/components/gex/GexMatrix';
import MiniPane from '../pinpoint/components/gex/MiniPane';
import StrikeLadder from '../pinpoint/components/gex/StrikeLadder';
import { TIMEFRAMES, type Timeframe } from '../pinpoint/data/timeframe';
import type { GexMetric, OverlayMode, StrikeRange } from '../pinpoint/types/gex';
import { Term } from './ui/Tooltip';
import { ChartSkeleton, MatrixSkeleton } from './ui/Skeleton';

/**
 * PinpointTerminal — the Live Terminal page, rebuilt CHART-FIRST.
 *
 * Structure: one dominant chart stage (~72vh, full width) whose panel header
 * carries the merged symbol / timeframe / metric / overlay / range toolbar and
 * whose top edge carries the overlay legend chip-row (rendered by StrikeChart).
 * Directly under the chart sits a slim LEVEL DOCK — value-first readout cells
 * for Net GEX / spot / flip / call wall / put wall / king. Secondary surfaces
 * (strike × expiry matrix, multi-ticker flow board) stack below the fold.
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

const METRIC_OPTIONS = [
  { value: 'GEX', label: 'GEX' },
  { value: 'VEX', label: 'VEX' },
  { value: 'GEX+VEX', label: 'GEX+VEX' },
] as const;

const OVERLAY_OPTIONS = [
  { value: 'NODES', label: 'Nodes' },
  { value: 'LEVELS', label: 'Levels' },
  { value: 'BOTH', label: 'Both' },
] as const;

const RANGE_OPTIONS = [
  { value: '10', label: '±10' },
  { value: '20', label: '±20' },
] as const;

const TIMEFRAME_OPTIONS = TIMEFRAMES.map(t => ({ value: t.value, label: t.label }));

/** One value-first cell in the level dock: number carries the read, label steps down. */
function DockCell({
  label,
  value,
  sub,
  ink,
  emphasis = false,
}: {
  label: ReactNode;
  value: string;
  sub: string;
  ink?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="min-w-0 px-3 py-2.5 sm:px-4">
      <div
        className={`truncate font-mono font-semibold leading-none tabular-nums ${emphasis ? 'text-[20px] sm:text-[22px]' : 'text-[15px] sm:text-[17px]'}`}
        style={{ color: ink ?? 'var(--text-primary)' }}
      >
        {value}
      </div>
      <div
        className="mt-1.5 truncate font-mono text-[9px] uppercase tracking-[0.14em]"
        style={{ color: 'var(--text-secondary)' }}
      >
        {label}
      </div>
      <div className="mt-0.5 truncate text-[9px] leading-tight" style={{ color: 'var(--text-tertiary)' }}>
        {sub}
      </div>
    </div>
  );
}

/** Section heading used below the fold — quieter than a panel header. */
function FoldHeading({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
      <h3
        className="font-mono text-[11px] font-bold uppercase tracking-[0.16em]"
        style={{ color: 'var(--text-primary)' }}
      >
        {title}
      </h3>
      <span
        className="min-w-0 truncate font-mono text-[10px] uppercase tracking-wider"
        style={{ color: 'var(--text-tertiary)' }}
      >
        {meta}
      </span>
    </div>
  );
}

/** The chart-first deck: stage + dock above the fold, matrix + flow board below. */
function TerminalDeck() {
  const { activeTicker, marketData } = useMarketData();
  const [metric, setMetric] = useState<GexMetric>('GEX');
  const [overlay, setOverlay] = useState<OverlayMode>('BOTH');
  const [rangeKey, setRangeKey] = useState<'10' | '20'>('10');
  const [timeframe, setTimeframe] = useState<Timeframe>('1m');

  const revRef = useRef(0);
  const revision = useMemo(() => ++revRef.current, [marketData]);

  const view = useMemo(
    () => (marketData ? buildGexView(marketData, metric, Number(rangeKey) as StrikeRange) : null),
    [marketData, metric, rangeKey]
  );

  if (!view || !marketData) {
    // Real loading state — a chart-first skeleton mirrors the page it stands in for.
    return (
      <div className="flex min-w-0 flex-col gap-4">
        <ChartSkeleton label="Awaiting feed initialization…" bars={44} />
        <MatrixSkeleton rows={8} cols={6} label="Loading strike matrix…" />
      </div>
    );
  }

  const { levels, matrix, board } = view;
  const netGex = marketData.chain.reduce((a, n) => a + n.netGex, 0);
  const longGamma = netGex >= 0;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* ================= CHART STAGE — the dominant surface ================= */}
      <section className="slayer-panel flex min-w-0 flex-col overflow-hidden">
        {/* Merged toolbar: symbol block + every chart control in one header row */}
        <header
          className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-3 py-2.5 sm:px-4"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full"
              style={{ background: 'var(--positive-ink)' }}
              aria-hidden
            />
            <span
              className="font-mono text-[15px] font-bold leading-none tracking-wide"
              style={{ color: 'var(--text-primary)' }}
            >
              {activeTicker}
            </span>
            <span
              className="rounded-[5px] px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em]"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent-color)' }}
            >
              Live
            </span>
          </div>
          <div className="hidden h-4 w-px sm:block" style={{ background: 'var(--border)' }} aria-hidden />
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <SegmentedControl<Timeframe> ariaLabel="Timeframe" options={TIMEFRAME_OPTIONS} value={timeframe} onChange={setTimeframe} />
            <SegmentedControl<GexMetric> ariaLabel="Metric" options={METRIC_OPTIONS} value={metric} onChange={setMetric} />
            <SegmentedControl<OverlayMode> ariaLabel="Overlay" options={OVERLAY_OPTIONS} value={overlay} onChange={setOverlay} />
            <SegmentedControl<'10' | '20'> ariaLabel="Strike range" options={RANGE_OPTIONS} value={rangeKey} onChange={setRangeKey} />
          </div>
          <span
            className="ml-auto hidden font-mono text-[10px] uppercase tracking-wider md:inline"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {matrix.strikes.length} strikes · {matrix.expiries.length} expirations
          </span>
        </header>

        {/* The chart owns the viewport (~72vh). StrikeChart renders the overlay
            legend chip-row on its own top edge — walls / flip / king / node toggles. */}
        <div
          className="flex min-w-0 flex-col p-2.5 sm:p-3"
          style={{ height: 'clamp(420px, 72vh, 920px)' }}
        >
          <StrikeChart
            ticker={activeTicker}
            revision={revision}
            levels={levels}
            overlay={overlay}
            timeframe={timeframe}
            height={360}
          />
        </div>

        {/* LEVEL DOCK — slim strip of value-first readouts riding the chart's
            bottom edge. Three cells per row on mobile (two rows), six across on lg. */}
        <div
          className="grid grid-cols-3 border-t lg:grid-cols-6"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
          role="group"
          aria-label="Key dealer levels"
        >
          <DockCell
            label={<Term id="netGex">Net GEX</Term>}
            value={fmtUsd(netGex)}
            sub={longGamma ? 'long gamma' : 'short gamma'}
            ink={longGamma ? 'var(--positive-ink)' : 'var(--negative-ink)'}
            emphasis
          />
          <DockCell label="Spot" value={`$${levels.spot.toFixed(2)}`} sub="underlying" />
          <DockCell
            label={<Term id="gammaFlip">Flip</Term>}
            value={`$${levels.flip.toFixed(2)}`}
            sub={levels.spot > levels.flip ? 'spot above' : 'spot below'}
            ink="var(--pin)"
          />
          <DockCell
            label={<Term id="callWall">Call Wall</Term>}
            value={`$${levels.callWall.toFixed(2)}`}
            sub="dealer supply"
            ink="var(--call)"
          />
          <DockCell
            label={<Term id="putWall">Put Wall</Term>}
            value={`$${levels.putWall.toFixed(2)}`}
            sub="dealer support"
            ink="var(--negative-ink)"
          />
          <DockCell
            label={<Term id="king">King</Term>}
            value={`$${levels.king.toFixed(2)}`}
            sub="max |exposure|"
            ink="var(--pin)"
          />
        </div>
      </section>

      {/* ================= BELOW THE FOLD — secondary surfaces ================= */}

      {/* Strike × Expiry matrix, now full width under the stage */}
      <section className="slayer-panel flex min-w-0 flex-col overflow-hidden">
        <header className="border-b px-3 py-2.5 sm:px-4" style={{ borderColor: 'var(--border)' }}>
          <FoldHeading title="Strike × Expiry" meta={`${metric} per strike per expiration · ${activeTicker}`} />
        </header>
        <div className="h-[440px] min-w-0 p-2">
          <GexMatrix data={matrix} spot={levels.spot} />
        </div>
      </section>

      {/* Multi-ticker flow board, split into its two natural reads */}
      <section className="slayer-panel flex min-w-0 flex-col overflow-hidden">
        <header className="border-b px-3 py-2.5 sm:px-4" style={{ borderColor: 'var(--border)' }}>
          <FoldHeading title="Multi-Ticker Flow Board" meta="dark pool prints · king nodes · net gex ladders" />
        </header>
        <div className="flex min-w-0 flex-col gap-3 p-3">
          <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-4">
            {board.map(item => (
              <MiniPane
                key={item.ticker}
                ticker={item.ticker}
                spot={item.spot}
                changePercent={item.changePercent}
                prints={item.prints}
                revision={revision}
              />
            ))}
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-4">
            {board.map(item => (
              <StrikeLadder key={item.ticker} board={item} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export default function PinpointTerminal({ ticker }: PinpointTerminalProps) {
  return (
    <MarketDataProvider>
      <TickerSync ticker={ticker} />
      <div
        className="h-full min-h-0 overflow-y-auto rounded-lg border"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-base)', color: 'var(--text-primary)' }}
      >
        <div className="min-w-0 p-3 sm:p-4">
          <TerminalDeck />
        </div>
      </div>
    </MarketDataProvider>
  );
}
