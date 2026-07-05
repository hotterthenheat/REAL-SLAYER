import { useEffect, useRef, useState } from 'react';
import { initSciChart } from './initSciChart';

/**
 * SciChartReact — a thin, self-disposing React host for a SciChart surface.
 *
 * You give it an `initChart(rootElement)` that builds and returns a surface (or `{ sciChartSurface }`);
 * this handles WASM init, the async create, teardown on unmount, and a loading state. It never
 * leaks a surface: the returned surface is deleted on cleanup, and a create that resolves after
 * unmount is deleted immediately.
 *
 * `initChart` receives the div and must resolve to something with a `.delete()` (a SciChartSurface)
 * or `{ sciChartSurface }`. Keep the heavy work (data, series) inside it.
 */

type Deletable = { delete: () => void };
type InitResult = Deletable | { sciChartSurface: Deletable };
export type InitChart = (root: HTMLDivElement) => Promise<InitResult>;

function surfaceOf(r: InitResult): Deletable {
  return 'sciChartSurface' in r ? r.sciChartSurface : r;
}

interface Props {
  initChart: InitChart;
  className?: string;
  style?: React.CSSProperties;
  /** Re-create the surface when any of these change. */
  deps?: unknown[];
  fallback?: React.ReactNode;
}

export default function SciChartReact({ initChart, className, style, deps = [], fallback }: Props) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let disposed = false;
    let surface: Deletable | null = null;
    setStatus('loading');
    (async () => {
      try {
        await initSciChart();
        if (disposed || !elRef.current) return;
        const res = await initChart(elRef.current);
        surface = surfaceOf(res);
        if (disposed) { surface.delete(); surface = null; return; }
        setStatus('ready');
      } catch (e) {
        if (!disposed) setStatus('error');
        // eslint-disable-next-line no-console
        console.error('[SciChart] init failed', e);
      }
    })();
    return () => {
      disposed = true;
      try { surface?.delete(); } catch { /* already gone */ }
      surface = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return (
    <div className={className} style={{ position: 'relative', width: '100%', height: '100%', ...style }}>
      <div ref={elRef} style={{ width: '100%', height: '100%' }} />
      {status !== 'ready' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {status === 'error'
            ? (fallback ?? <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--danger)]">Chart failed to load</span>)
            : <div className="w-6 h-6 rounded-full border-2 border-[var(--border)] border-t-[var(--accent-color)] animate-spin" />}
        </div>
      )}
    </div>
  );
}
