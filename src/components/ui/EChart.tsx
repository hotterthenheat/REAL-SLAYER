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
 * `echarts.time`, `echarts.format`, etc.
 */

type EChartsModule = typeof import('echarts');
type OptionOrFactory = any | ((echarts: EChartsModule) => any);

interface EChartProps {
  option: OptionOrFactory;
  /** Load echarts-gl for 3D / GL series (scatter3D, surface, flowGL, …). */
  gl?: boolean;
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
  const axis = {
    axisLine: { lineStyle: { color: 'rgba(255,255,255,0.14)' } },
    axisTick: { lineStyle: { color: 'rgba(255,255,255,0.14)' } },
    axisLabel: { color: '#8A8A92', fontFamily: 'JetBrains Mono, ui-monospace, monospace', fontSize: 10 },
    splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
    splitArea: { areaStyle: { color: ['rgba(255,255,255,0.012)', 'transparent'] } },
  };
  echarts.registerTheme('slayer-dark', {
    color: ['#4ADE80', '#60A5FA', '#F87171', '#FBBF24', '#B06FE6', '#29B6F6', '#34D399', '#F472B6'],
    backgroundColor: 'transparent',
    textStyle: { fontFamily: 'JetBrains Mono, ui-monospace, monospace', color: '#A3A3A3' },
    title: { textStyle: { color: '#E5E5E5', fontWeight: 700 }, subtextStyle: { color: '#71717A' } },
    legend: { textStyle: { color: '#A3A3A3', fontFamily: 'JetBrains Mono, monospace' }, inactiveColor: '#3f3f46' },
    tooltip: {
      backgroundColor: 'rgba(10,10,11,0.96)',
      borderColor: 'rgba(255,255,255,0.10)',
      borderWidth: 1,
      textStyle: { color: '#E5E5E5', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 },
      extraCssText: 'backdrop-filter: blur(8px); border-radius: 8px;',
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
      fillerColor: 'rgba(74,222,128,0.10)',
      handleStyle: { color: '#4ADE80' },
      moveHandleStyle: { color: '#4ADE80' },
      dataBackground: { lineStyle: { color: '#3f3f46' }, areaStyle: { color: 'rgba(255,255,255,0.04)' } },
      textStyle: { color: '#71717A' },
    },
  });
}

export default function EChart({ option, gl, className, style, notMerge, onInit }: EChartProps) {
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
      if (gl) await import('echarts-gl');
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
  }, [gl]);

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
