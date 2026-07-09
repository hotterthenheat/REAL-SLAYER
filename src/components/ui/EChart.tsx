import { useEffect, useRef } from 'react';

/**
 * EChart — a thin, dark, self-disposing React wrapper around Apache ECharts.
 *
 * echarts (and echarts-gl when `gl` is set) are dynamically imported so they
 * code-split off the main bundle — the ~1MB GL runtime only loads on the pages
 * that actually use it. A Slayer dark theme is registered once so every chart
 * reads as part of the terminal (mono type, muted grid, transparent surface).
 *
 * `option` may be a plain ECharts option object or a factory `(echarts) => option`
 * — use the factory form when the option needs `echarts.graphic.LinearGradient`,
 * `echarts.time`, `echarts.format`, etc. 3D surfaces use three.js (see ThreeSurface),
 * not echarts-gl — this wrapper is 2D only.
 */

type EChartsModule = typeof import('echarts');
type OptionOrFactory = any | ((echarts: EChartsModule) => any);

interface EChartProps {
  option: OptionOrFactory;
  className?: string;
  style?: React.CSSProperties;
  /** Replace the whole option on update instead of merging (default false). */
  notMerge?: boolean;
  onInit?: (chart: any, echarts: EChartsModule) => void;
}

let themeRegistered = false;
function registerSlayerTheme(echarts: EChartsModule) {
  if (themeRegistered) return;
  themeRegistered = true;
  // Data font is a neutral system mono (tabular digits, clean axes) — the brand
  // face (JetBrains Mono) is reserved for the wordmark, never chart data.
  const dataFont = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const axis = {
    axisLine: { lineStyle: { color: 'rgba(255,255,255,0.14)' } },
    axisTick: { lineStyle: { color: 'rgba(255,255,255,0.14)' } },
    axisLabel: { color: '#8A8A92', fontFamily: dataFont, fontSize: 10 },
    splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
    splitArea: { areaStyle: { color: ['rgba(255,255,255,0.012)', 'transparent'] } },
  };
  // Series palette = the terminal's semantic data accents (steel/amber/green/red
  // + muted greek/dealer tones), not generic bright chart hues.
  echarts.registerTheme('slayer-dark', {
    color: ['#6A93B5', '#C79350', '#3F9C79', '#B23B3B', '#7C6DA8', '#5E8C8C', '#8A8A92', '#A66FA0'],
    backgroundColor: 'transparent',
    textStyle: { fontFamily: dataFont, color: '#A3A3A3' },
    title: { textStyle: { color: '#E5E5E5', fontWeight: 700 }, subtextStyle: { color: '#71717A' } },
    legend: { textStyle: { color: '#A3A3A3', fontFamily: dataFont }, inactiveColor: '#3f3f46' },
    tooltip: {
      backgroundColor: 'rgba(10,10,11,0.96)',
      borderColor: 'rgba(255,255,255,0.10)',
      borderWidth: 1,
      textStyle: { color: '#E5E5E5', fontFamily: dataFont, fontSize: 11 },
      extraCssText: 'border-radius: 7px;',
    },
    axisPointer: { lineStyle: { color: '#3f3f46' }, crossStyle: { color: '#3f3f46' }, label: { backgroundColor: '#1c1c1e' } },
    categoryAxis: axis,
    valueAxis: axis,
    timeAxis: axis,
    logAxis: axis,
    grid: { borderColor: 'rgba(255,255,255,0.06)' },
    toolbox: { iconStyle: { borderColor: '#71717A' }, emphasis: { iconStyle: { borderColor: '#E5E5E5' } } },
    dataZoom: {
      borderColor: 'rgba(255,255,255,0.08)',
      fillerColor: 'rgba(106,147,181,0.12)',
      handleStyle: { color: '#6A93B5' },
      moveHandleStyle: { color: '#6A93B5' },
      dataBackground: { lineStyle: { color: '#3f3f46' }, areaStyle: { color: 'rgba(255,255,255,0.04)' } },
      textStyle: { color: '#71717A' },
    },
  });
}

export default function EChart({ option, className, style, notMerge, onInit }: EChartProps) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const echartsRef = useRef<EChartsModule | null>(null);
  const optionRef = useRef<OptionOrFactory>(option);
  optionRef.current = option;

  // Init once (async so echarts code-splits). Re-init if `gl` toggles.
  useEffect(() => {
    let disposed = false;
    let ro: ResizeObserver | null = null;
    (async () => {
      const echarts = (await import('echarts')) as unknown as EChartsModule;
      if (disposed || !elRef.current) return;
      registerSlayerTheme(echarts);
      const chart = echarts.init(elRef.current, 'slayer-dark', { renderer: 'canvas' });
      echartsRef.current = echarts;
      chartRef.current = chart;
      const resolved = typeof optionRef.current === 'function' ? optionRef.current(echarts) : optionRef.current;
      chart.setOption(resolved, { notMerge: true });
      onInit?.(chart, echarts);
      ro = new ResizeObserver(() => chart.resize());
      ro.observe(elRef.current);
    })();
    return () => {
      disposed = true;
      ro?.disconnect();
      chartRef.current?.dispose();
      chartRef.current = null;
      echartsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply option updates once the chart exists.
  useEffect(() => {
    const chart = chartRef.current;
    const echarts = echartsRef.current;
    if (!chart || !echarts) return;
    const resolved = typeof option === 'function' ? option(echarts) : option;
    chart.setOption(resolved, { notMerge: notMerge ?? false });
  }, [option, notMerge]);

  return <div ref={elRef} className={className} style={{ width: '100%', height: '100%', ...style }} />;
}
