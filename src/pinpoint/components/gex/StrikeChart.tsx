import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type UTCTimestamp,
} from 'lightweight-charts';
import Simulator from '../../core/simulator';
import {
  aggregateCandles,
  aggregateSnapshots,
  snapshotsMaxAbs,
  tfMinutes,
  INTRADAY_MAX_MINUTES,
  type Timeframe,
} from '../../data/timeframe';
import { GexNodesPrimitive } from './gexNodesPrimitive';
import { candleTheme } from './candleTheme';
import type { Candle } from '../../types/market';
import type { KeyLevels, OverlayMode } from '../../types/gex';

interface StrikeChartProps {
  ticker: string;
  /** Bumped every simulator tick so the chart folds in the newest bar */
  revision: number;
  levels: KeyLevels;
  overlay: OverlayMode;
  timeframe: Timeframe;
  height?: number;
}

// Wall / flip / king overlay colors (independent of candle theme).
// Premium dealer-structure palette: steel call, muted red put, amber pin (king),
// #3fc1ff accent flip — tuned to read clearly over the cool candles.
const CALL_WALL = '#78A5B8'; // var(--call) steel
const PUT_WALL = '#E0576A'; // var(--negative-ink) red
const PIN = '#E6A93C'; // var(--pin) amber
const FLIP = '#3FC1FF'; // var(--accent-color) accent

const toCandle = (b: Candle) => ({
  time: b.time as UTCTimestamp,
  open: b.open,
  high: b.high,
  low: b.low,
  close: b.close,
});
const toVolume = (b: Candle) => ({
  time: b.time as UTCTimestamp,
  value: b.volume,
  color: b.close >= b.open ? candleTheme.volUp : candleTheme.volDown,
});

/**
 * TradingView-grade candlestick chart with dealer-structure overlays and the
 * net-GEX node heatmap. Smoothness contract: created once; ticks arrive as
 * series.update() on the last (current-bucket) bar; full setData + fitContent
 * only on ticker/timeframe change. Pan/zoom is never fought.
 */
const StrikeChart = ({ ticker, revision, levels, overlay, timeframe, height = 460 }: StrikeChartProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const nodesRef = useRef<GexNodesPrimitive | null>(null);
  const levelLinesRef = useRef<IPriceLine[]>([]);
  const levelsRef = useRef<KeyLevels>(levels);
  const barCountRef = useRef(0);
  const loadedRef = useRef<{ ticker: string; timeframe: Timeframe }>({ ticker: '', timeframe: '1m' });

  // Per-series visibility, toggled by clicking the legend (TradingView-style). A
  // series renders only when its overlay category is on AND it is not hidden here.
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const toggle = useCallback((id: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // Keep the autoscale provider reading the freshest levels without re-mounting
  levelsRef.current = levels;

  const VISIBLE_BARS = 130;
  const showRecent = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const len = barCountRef.current;
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, len - VISIBLE_BARS), to: len + 4 });
  }, []);

  const resetView = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.priceScale('right').applyOptions({ autoScale: true });
    showRecent();
  }, [showRecent]);

  // Mount once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { color: 'transparent' },
        // muted cool grey, mono — scale/axis text reads as instrumentation
        textColor: '#7C8794',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10,
        attributionLogo: true,
      },
      grid: {
        // very faint cool gridlines so the panel shows through
        vertLines: { color: 'rgba(140,165,190,0.045)' },
        horzLines: { color: 'rgba(140,165,190,0.05)' },
      },
      rightPriceScale: { borderColor: '#1E242C' },
      timeScale: { borderColor: '#1E242C', timeVisible: true, secondsVisible: false, rightOffset: 6, barSpacing: 7 },
      crosshair: {
        // clean cool crosshair with tabular-mono labels on a dark cool tag
        vertLine: {
          color: 'rgba(167,184,199,0.28)',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#1A2028',
        },
        horzLine: {
          color: 'rgba(167,184,199,0.28)',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#1A2028',
        },
      },
    });

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: candleTheme.up,
      downColor: candleTheme.down,
      borderUpColor: candleTheme.up,
      borderDownColor: candleTheme.down,
      wickUpColor: candleTheme.wickUp,
      wickDownColor: candleTheme.wickDown,
      priceLineVisible: true,
      // soft cool-ivory last-price line; label rides the price scale
      priceLineColor: 'rgba(220,231,242,0.34)',
      priceLineStyle: LineStyle.Dotted,
      priceLineWidth: 1,
      // Widen the visible price range to always include the walls/king so several
      // strike-node bands are on screen, not just the couple around spot.
      autoscaleInfoProvider: (original: () => { priceRange: { minValue: number; maxValue: number } } | null) => {
        const base = original();
        const lv = levelsRef.current;
        const extras = [lv.putWall, lv.callWall, lv.king, lv.spot].filter(v => Number.isFinite(v));
        let min = base?.priceRange.minValue ?? Math.min(...extras);
        let max = base?.priceRange.maxValue ?? Math.max(...extras);
        for (const v of extras) {
          if (v < min) min = v;
          if (v > max) max = v;
        }
        const pad = Math.max((max - min) * 0.08, 0.01);
        return { priceRange: { minValue: min - pad, maxValue: max + pad } };
      },
    });

    const volume = chart.addSeries(HistogramSeries, {
      priceScaleId: 'vol',
      priceFormat: { type: 'volume' },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });

    const nodes = new GexNodesPrimitive();
    candles.attachPrimitive(nodes);

    chartRef.current = chart;
    candleSeriesRef.current = candles;
    volumeSeriesRef.current = volume;
    nodesRef.current = nodes;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      nodesRef.current = null;
      levelLinesRef.current = [];
      loadedRef.current = { ticker: '', timeframe: '1m' };
    };
  }, []);

  // Candle data + node overlay: full load on ticker/timeframe change, incremental per tick
  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    const nodes = nodesRef.current;
    if (!chart || !candleSeries || !volumeSeries || !nodes) return;

    const base = Simulator.getCandles(ticker);
    const baseGex = Simulator.getGexHistory(ticker);
    if (!base || base.length === 0) return;

    const mins = tfMinutes(timeframe);
    const bars = aggregateCandles(base, mins);
    const snaps = aggregateSnapshots(baseGex ?? [], mins);
    const maxAbs = snapshotsMaxAbs(snaps);
    barCountRef.current = bars.length;

    const loaded = loadedRef.current;
    const changed = loaded.ticker !== ticker || loaded.timeframe !== timeframe;

    if (changed) {
      candleSeries.setData(bars.map(toCandle));
      volumeSeries.setData(bars.map(toVolume));
      showRecent();
      loadedRef.current = { ticker, timeframe };
    } else {
      const last = bars[bars.length - 1];
      candleSeries.update(toCandle(last));
      volumeSeries.update(toVolume(last));
    }

    // Node overlay is intraday-only
    const showNodes = (overlay === 'NODES' || overlay === 'BOTH') && mins <= INTRADAY_MAX_MINUTES;
    nodes.setData(snaps, maxAbs, showNodes);
  }, [ticker, revision, timeframe, overlay, showRecent]);

  // Key-level price lines
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;
    for (const line of levelLinesRef.current) candleSeries.removePriceLine(line);
    levelLinesRef.current = [];

    if (overlay === 'LEVELS' || overlay === 'BOTH') {
      const mk = (price: number, color: string, title: string, style: LineStyle, width: 1 | 2 = 1) =>
        candleSeries.createPriceLine({ price, color, title, lineStyle: style, lineWidth: width, axisLabelVisible: true });
      const defs: Array<[string, number, string, string, LineStyle, (1 | 2)?]> = [
        ['callWall', levels.callWall, CALL_WALL, 'CALL WALL', LineStyle.Dashed],
        ['putWall', levels.putWall, PUT_WALL, 'PUT WALL', LineStyle.Dashed],
        ['flip', levels.flip, FLIP, 'FLIP', LineStyle.Dashed],
        ['king', levels.king, PIN, 'KING', LineStyle.Solid, 2],
      ];
      levelLinesRef.current = defs
        .filter(([id]) => !hidden.has(id))
        .map(([, price, color, title, style, width]) => mk(price, color, title, style, width ?? 1));
    }
  }, [levels, overlay, hidden]);

  // Sync +GEX / −GEX node visibility to the legend toggles (no data reload).
  useEffect(() => {
    nodesRef.current?.setSignVisibility(!hidden.has('posNode'), !hidden.has('negNode'));
  }, [hidden]);

  return (
    <div className="flex flex-col gap-2 h-full">
      <div className="flex items-center gap-3.5 px-1 flex-wrap select-none">
        {([
          { id: 'callWall', label: 'Call Wall', cls: 'bg-bull' },
          { id: 'putWall', label: 'Put Wall', cls: 'bg-bear' },
          { id: 'flip', label: 'Flip', cls: 'bg-warn' },
          { id: 'king', label: 'King', cls: 'bg-[#eab308]' },
          { id: 'posNode', label: '+GEX node', cls: 'bg-[#32CBFF]' },
          { id: 'negNode', label: '−GEX node', cls: 'bg-[#EF9CDA]' },
        ] as const).map(item => {
          const off = hidden.has(item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => toggle(item.id)}
              aria-pressed={!off}
              title={`${off ? 'Show' : 'Hide'} ${item.label}`}
              className={`flex items-center gap-1.5 font-mono text-[10px] rounded px-1 -mx-1 transition-colors hover:bg-panel focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-select/60 ${off ? 'text-textMuted line-through decoration-textMuted/60' : 'text-textSecondary'}`}
            >
              <span className={`inline-block w-3 h-0.5 rounded-full ${item.cls} transition-opacity ${off ? 'opacity-30' : ''}`} />
              {item.label}
            </button>
          );
        })}
        <span className="ml-auto font-mono text-[10px] text-textMuted uppercase tracking-wider">
          scroll zoom · drag pan · dbl-click reset
        </span>
        <button
          onClick={resetView}
          title="Reset view (or double-click the chart)"
          className="inline-flex items-center gap-1.5 border border-borderSubtle hover:border-borderMuted bg-panel rounded-[7px] px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-textSecondary hover:text-textPrimary transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60"
        >
          <RotateCcw className="w-3 h-3" /> Reset
        </button>
      </div>
      <div
        className="relative flex-grow border border-borderSubtle bg-inset rounded-[7px] overflow-hidden"
        style={{ minHeight: height }}
        onDoubleClick={resetView}
      >
        <div ref={containerRef} className="absolute inset-0" />
      </div>
    </div>
  );
};

export default StrikeChart;
