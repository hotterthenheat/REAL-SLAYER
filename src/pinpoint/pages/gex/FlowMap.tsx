import { useMemo, useRef, useState } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildGexView, fmtUsd } from '../../data/gex';
import SegmentedControl from '../../components/ui/SegmentedControl';
import Panel from '../../components/ui/Panel';
import StrikeChart from '../../components/gex/StrikeChart';
import GexMatrix from '../../components/gex/GexMatrix';
import MiniPane from '../../components/gex/MiniPane';
import StrikeLadder from '../../components/gex/StrikeLadder';
import { TIMEFRAMES, type Timeframe } from '../../data/timeframe';
import type { GexMetric, OverlayMode, StrikeRange } from '../../types/gex';
import { Term } from '../../../components/ui/Tooltip';
import { ChartSkeleton, MatrixSkeleton } from '../../../components/ui/Skeleton';
import { ResizableSplit } from '../../../components/ui/Resizable';

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

const FlowMap = () => {
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
    // Real loading state — skeleton mirrors the page it stands in for.
    return (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <ChartSkeleton label="Awaiting feed initialization…" />
        </div>
        <div className="xl:col-span-5">
          <MatrixSkeleton rows={12} cols={5} label="Loading strike matrix…" />
        </div>
      </div>
    );
  }

  const { levels, matrix, board } = view;
  const netGex = marketData.chain.reduce((a, n) => a + n.netGex, 0);

  return (
    <>
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <SegmentedControl<Timeframe> ariaLabel="Timeframe" options={TIMEFRAME_OPTIONS} value={timeframe} onChange={setTimeframe} />
        <SegmentedControl<GexMetric> ariaLabel="Metric" options={METRIC_OPTIONS} value={metric} onChange={setMetric} />
        <SegmentedControl<OverlayMode> ariaLabel="Overlay" options={OVERLAY_OPTIONS} value={overlay} onChange={setOverlay} />
        <SegmentedControl<'10' | '20'> ariaLabel="Strike range" options={RANGE_OPTIONS} value={rangeKey} onChange={setRangeKey} />
        <span className="font-mono text-[10px] text-textMuted uppercase tracking-wider">
          {matrix.strikes.length} strikes · {matrix.expiries.length} expirations
        </span>
        {/* Honest data-provenance badge: this surface runs on the built-in
            simulator until a live feed is wired — never label it "live". Warn
            tone (theme token) reads as a caution chip, never a green live badge. */}
        <span className="ml-auto rounded-[7px] border border-warn/30 bg-warn/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-warn">
          Simulated Feed
        </span>
      </div>

      {/* Key levels — one dominant figure (Net GEX) carries the read; the walls,
          flip, king and spot step down as hairline-separated supporters. Not a
          row of equal cards. */}
      <div className="grid grid-cols-2 overflow-hidden rounded-[10px] border border-borderSubtle bg-panel md:grid-cols-3 lg:grid-cols-6">
        <div className="min-w-0 px-4 py-3">
          <div className="font-mono text-[10px] uppercase tracking-widest text-textSecondary truncate">
            <Term id="netGex">Net GEX</Term>
          </div>
          <div className={`mt-1.5 font-mono text-[22px] font-semibold leading-none tnum ${netGex >= 0 ? 'text-bull' : 'text-bear'}`}>
            {fmtUsd(netGex)}
          </div>
          <div className="mt-1 text-[10px] leading-tight text-textMuted truncate">
            book total · {netGex >= 0 ? 'long gamma' : 'short gamma'}
          </div>
        </div>
        {([
          { label: 'Spot', value: `$${levels.spot.toFixed(2)}`, cls: 'text-textPrimary', sub: 'simulated tick' },
          { label: <Term id="gammaFlip">Gamma Flip</Term>, value: `$${levels.flip.toFixed(2)}`, cls: 'text-textPrimary', sub: levels.spot > levels.flip ? 'spot above' : 'spot below' },
          { label: <Term id="callWall">Call Wall</Term>, value: `$${levels.callWall.toFixed(2)}`, cls: 'text-bull', sub: 'dealer supply' },
          { label: <Term id="putWall">Put Wall</Term>, value: `$${levels.putWall.toFixed(2)}`, cls: 'text-bear', sub: 'dealer support' },
          { label: <Term id="king">King</Term>, value: `$${levels.king.toFixed(2)}`, cls: 'text-warn', sub: 'max |exposure|' },
        ]).map((m, i) => (
          <div key={i} className="min-w-0 border-l border-borderSubtle px-4 py-3">
            <div className="font-mono text-[10px] uppercase tracking-widest text-textSecondary truncate">{m.label}</div>
            <div className={`mt-1.5 font-mono text-[15px] font-semibold leading-none tnum ${m.cls}`}>{m.value}</div>
            <div className="mt-1 text-[10px] leading-tight text-textMuted truncate">{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Product 1: strike chart + strike×expiry matrix — trader-resizable split. */}
      <ResizableSplit
        storageKey="slayer.flowmap.split"
        defaultRatio={0.58}
        min={0.4}
        max={0.72}
        left={
          <Panel
            title={`${activeTicker} — GEX nodes + levels`}
            subtitle="simulated feed · metric toggle drives the matrix"
            className="h-full w-full"
            bodyClassName="flex flex-col"
          >
            <StrikeChart
              ticker={activeTicker}
              revision={revision}
              levels={levels}
              overlay={overlay}
              timeframe={timeframe}
              height={470}
            />
          </Panel>
        }
        right={
          <Panel
            title="Strike × Expiry"
            subtitle={`${metric} per strike per expiration`}
            flush
            className="h-full w-full"
            bodyClassName="p-2 h-[530px]"
          >
            <GexMatrix data={matrix} spot={levels.spot} />
          </Panel>
        }
      />

      {/* Product 2: multi-ticker flow board */}
      <Panel
        title="Multi-Ticker Flow Board"
        subtitle="dark pool prints · king nodes · net gex ladders"
        flush
        className="w-full"
        bodyClassName="p-3"
      >
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 items-stretch">
          <div className="xl:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-3 content-start">
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
          <div className="xl:col-span-5 grid grid-cols-2 md:grid-cols-4 gap-3">
            {board.map(item => (
              <StrikeLadder key={item.ticker} board={item} />
            ))}
          </div>
        </div>
      </Panel>
    </>
  );
};

export default FlowMap;
