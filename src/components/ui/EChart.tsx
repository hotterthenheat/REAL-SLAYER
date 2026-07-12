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
  // Cool-tinted axis furniture for the Glacier canvas.
  const axis = {
    axisLine: { lineStyle: { color: 'rgba(163,196,224,0.16)' } },
    axisTick: { lineStyle: { color: 'rgba(163,196,224,0.16)' } },
    axisLabel: { color: '#8FA0B0', fontFamily: dataFont, fontSize: 10 },
    splitLine: { lineStyle: { color: 'rgba(163,196,224,0.05)' } },
    splitArea: { areaStyle: { color: ['rgba(163,196,224,0.012)', 'transparent'] } },
  };
  // Series palette = the Glacier semantic data accents (steel/amber/green/red +
  // muted greek/dealer tones) with the ice accent in reach for emphasis series.
  echarts.registerTheme('slayer-dark', {
    color: ['#5BA8DC', '#E8A33D', '#2FBF83', '#E8564F', '#8F6FB8', '#46AECE', '#3FC1FF', '#93A7B8'],
    backgroundColor: 'transparent',
    textStyle: { fontFamily: dataFont, color: '#C3CFDA' },
    title: { textStyle: { color: '#EAF1F7', fontWeight: 700 }, subtextStyle: { color: '#8FA0B0' } },
    legend: { textStyle: { color: '#C3CFDA', fontFamily: dataFont }, inactiveColor: '#4A5866' },
    tooltip: {
      backgroundColor: 'rgba(13,18,24,0.96)',
      borderColor: 'rgba(163,196,224,0.14)',
      borderWidth: 1,
      textStyle: { color: '#EAF1F7', fontFamily: dataFont, fontSize: 11 },
      extraCssText: 'border-radius: 8px; box-shadow: 0 10px 30px -12px rgba(0,0,0,0.75);',
    },
    axisPointer: { lineStyle: { color: '#4A5866' }, crossStyle: { color: '#4A5866' }, label: { backgroundColor: '#1B2531' } },
    categoryAxis: axis,
    valueAxis: axis,
    timeAxis: axis,
    logAxis: axis,
    grid: { borderColor: 'rgba(163,196,224,0.06)' },
    toolbox: { iconStyle: { borderColor: '#8FA0B0' }, emphasis: { iconStyle: { borderColor: '#3FC1FF' } } },
    dataZoom: {
      borderColor: 'rgba(163,196,224,0.08)',
      fillerColor: 'rgba(63,193,255,0.12)',
      handleStyle: { color: '#3FC1FF' },
      moveHandleStyle: { color: '#3FC1FF' },
      dataBackground: { lineStyle: { color: '#4A5866' }, areaStyle: { color: 'rgba(163,196,224,0.04)' } },
      textStyle: { color: '#8FA0B0' },
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
