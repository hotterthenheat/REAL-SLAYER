import SciChartReact, { type InitChart } from './SciChartReact';

/**
 * IvSmileSciChart — the volatility smile/skew as a SciChart FastMountain, adapted from the
 * SciChart line/mountain reference. Strike on X, implied vol on Y; a vertical marker sits at
 * spot so skew (put-side lift) reads at a glance. Data in = real chain IV points; it draws
 * nothing it wasn't given.
 */

export interface IvPoint { strike: number; iv: number }

function css(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function IvSmileSciChart({ points, spot, className, style }: {
  points: IvPoint[]; spot?: number; className?: string; style?: React.CSSProperties;
}) {
  const initChart: InitChart = async (root) => {
    const sc = await import('scichart');
    const {
      SciChartSurface, NumericAxis, NumberRange, FastMountainRenderableSeries,
      XyDataSeries, EllipsePointMarker, VerticalLineAnnotation, ELabelPlacement,
      SciChartJsNavyTheme, NumericLabelProvider,
    } = sc as any;

    const accent = css('--info', '#60A5FA');
    const text = css('--text-tertiary', '#A3A3A3');
    const surface = css('--surface', '#141414');

    const theme = new SciChartJsNavyTheme();
    theme.sciChartBackground = 'Transparent';
    theme.loadingAnimationBackground = surface;
    theme.axisBandsFill = 'Transparent';

    const { sciChartSurface, wasmContext } = await SciChartSurface.create(root, { theme });

    const xAxis = new NumericAxis(wasmContext, {
      axisTitle: 'Strike',
      labelProvider: new NumericLabelProvider({ formatLabel: (v: number) => v.toFixed(0) }),
    });
    const yAxis = new NumericAxis(wasmContext, {
      axisTitle: 'Implied Vol',
      growBy: new NumberRange(0.08, 0.12),
      labelProvider: new NumericLabelProvider({ formatLabel: (v: number) => `${(v * 100).toFixed(0)}%` }),
    });
    sciChartSurface.xAxes.add(xAxis);
    sciChartSurface.yAxes.add(yAxis);

    const xs = points.map(p => p.strike);
    const ys = points.map(p => p.iv);
    const mountain = new FastMountainRenderableSeries(wasmContext, {
      stroke: accent,
      strokeThickness: 3,
      fillLinearGradient: {
        startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 1 },
        gradientStops: [
          { offset: 0, color: accent + 'AA' },
          { offset: 1, color: 'Transparent' },
        ],
      },
      pointMarker: new EllipsePointMarker(wasmContext, { width: 7, height: 7, stroke: accent, strokeThickness: 1.5, fill: surface }),
      dataSeries: new XyDataSeries(wasmContext, { xValues: xs, yValues: ys, dataSeriesName: 'IV' }),
    });
    sciChartSurface.renderableSeries.add(mountain);

    if (typeof spot === 'number' && isFinite(spot)) {
      sciChartSurface.annotations.add(new VerticalLineAnnotation({
        x1: spot, stroke: text, strokeThickness: 1, strokeDashArray: [4, 4],
        axisLabelFill: text, showLabel: true, labelPlacement: ELabelPlacement.Top,
        labelValue: 'Spot',
      }));
    }

    return { sciChartSurface };
  };

  return <SciChartReact initChart={initChart} deps={[points, spot]} className={className} style={style} />;
}

export default IvSmileSciChart;
