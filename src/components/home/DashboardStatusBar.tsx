/**
 * DashboardStatusBar — the thin operational strip closing the Home terminal. Every
 * value is honest: the data-source label reflects the real `feedStatus` transport,
 * the scanned universe is the actual asset count, and unknowable fields (latency)
 * render "—". The auto-refresh toggle and refresh control are visual/state-local.
 */
import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ASSET_LIST } from '../../data';
import { fmtNum } from '../../lib/format';
import { nyClock } from './format';

type FeedStatus = 'connecting' | 'live' | 'offline' | 'stale';

const SOURCE_META: Record<FeedStatus, { label: string; color: string }> = {
  live: { label: 'Real-Time', color: 'var(--positive-ink)' },
  stale: { label: 'Delayed', color: 'var(--warning-ink)' },
  offline: { label: 'Offline', color: 'var(--negative-ink)' },
  connecting: { label: 'Connecting', color: 'var(--text-muted)' },
};

export function DashboardStatusBar({ feedStatus }: { feedStatus: FeedStatus }) {
  const [clock, setClock] = useState<string>(() => nyClock(true));
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [spin, setSpin] = useState(false);

  useEffect(() => {
    if (feedStatus !== 'live') return; // freeze the scan stamp when the feed isn't live
    const t = window.setInterval(() => setClock(nyClock(true)), 1000);
    return () => window.clearInterval(t);
  }, [feedStatus]);

  const src = SOURCE_META[feedStatus];
  const cell = 'flex items-center gap-1.5 whitespace-nowrap';
  const label = 'text-[8.5px] font-semibold uppercase tracking-[0.13em] text-[var(--text-muted)]';
  const val = 'text-[8.5px] font-semibold uppercase tracking-[0.13em] slayer-num text-[var(--text-primary)]';

  return (
    <div className="slayer-panel slayer-scrollbar flex items-center gap-4 overflow-x-auto px-3 py-1.5">
      <span className={cell}>
        <span className={label}>Last Scan</span>
        <span className={val}>{clock} ET</span>
      </span>
      <span className="h-3 w-px shrink-0 bg-[var(--border-subtle)]" aria-hidden="true" />
      <span className={cell}>
        <span className={label}>Data Source</span>
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: src.color }} aria-hidden="true" />
        <span className="text-[8.5px] font-semibold uppercase tracking-[0.13em]" style={{ color: src.color }}>{src.label}</span>
      </span>
      <span className="hidden h-3 w-px shrink-0 bg-[var(--border-subtle)] sm:block" aria-hidden="true" />
      <span className={`${cell} hidden sm:flex`}>
        <span className={label}>Latency</span>
        <span className={val}>—</span>
      </span>
      <span className="hidden h-3 w-px shrink-0 bg-[var(--border-subtle)] md:block" aria-hidden="true" />
      <span className={`${cell} hidden md:flex`}>
        <span className={label}>Scanned Universe</span>
        <span className={val}>{fmtNum(ASSET_LIST.length)}</span>
      </span>

      <span className="ml-auto flex shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={() => setAutoRefresh((v) => !v)}
          aria-pressed={autoRefresh}
          className="inline-flex items-center gap-1.5 text-[8.5px] font-semibold uppercase tracking-[0.13em] text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)] focus-visible:outline-none"
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: autoRefresh ? 'var(--positive-ink)' : 'var(--text-tertiary)' }} />
          Auto-refresh
        </button>
        <button
          type="button"
          onClick={() => {
            setSpin(true);
            window.setTimeout(() => setSpin(false), 600);
          }}
          aria-label="Refresh"
          className="text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none"
        >
          <RefreshCw className={`h-3 w-3 ${spin ? 'animate-spin' : ''}`} />
        </button>
      </span>
    </div>
  );
}

export default DashboardStatusBar;
