import { useMemo, useRef, useState } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildGexView, fmtUsd } from '../../data/gex';
import SegmentedControl from '../../components/ui/SegmentedControl';
import MetricGrid from '../../components/ui/MetricGrid';
import StatCard from '../../components/ui/StatCard';
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
      </div>

      {/* Key level stats */}
      <MetricGrid min="140px">
        <StatCard label="Spot" value={`$${levels.spot.toFixed(2)}`} sub="live tick" />
        <StatCard label={<Term id="king">King</Term>} value={`$${levels.king.toFixed(2)}`} tone="warn" sub="max |exposure| strike" />
        <StatCard label={<Term id="callWall">Call Wall</Term>} value={`$${levels.callWall.toFixed(2)}`} tone="bull" sub="dealer supply" />
        <StatCard label={<Term id="putWall">Put Wall</Term>} value={`$${levels.putWall.toFixed(2)}`} tone="bear" sub="dealer support" />
        <StatCard
          label={<Term id="gammaFlip">Gamma Flip</Term>}
          value={`$${levels.flip.toFixed(2)}`}
          sub={levels.spot > levels.flip ? 'spot above — stabilizing' : 'spot below — accelerating'}
        />
        <StatCard
          label={<Term id="netGex">Net GEX</Term>}
          value={fmtUsd(netGex)}
          tone={netGex >= 0 ? 'bull' : 'bear'}
          sub="book total"
        />
      </MetricGrid>

      {/* Product 1: strike chart + strike×expiry matrix — trader-resizable split. */}
      <ResizableSplit
        storageKey="slayer.flowmap.split"
        defaultRatio={0.58}
        min={0.4}
        max={0.72}
        left={
          <Panel
            title={`${activeTicker} — ${metric} nodes + levels`}
            subtitle="live tick feed"
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
