/**
 * DealerFlowSection — the Dealer Flow tab shell. Holds a top-right segmented control
 * that switches between the new dense OVERVIEW cockpit (DealerFlowDashboard) and the
 * existing FLOW SCREENER (OptionsFlowTape, passed in unchanged). Overview is the
 * default. The inactive view is not mounted, so the heavy screener only loads when
 * selected. Brand-silver marks the active segment (brand/selection only — never data).
 */
import { useState, type ReactNode } from 'react';
import DealerFlowDashboard from './DealerFlowDashboard';
import { cx } from '../lib/cx';

type FeedStatus = 'connecting' | 'live' | 'offline' | 'stale';
type View = 'overview' | 'screener';

export default function DealerFlowSection({ feedStatus, screener }: { feedStatus: FeedStatus; screener: ReactNode }) {
  const [view, setView] = useState<View>('overview');

  const seg = (v: View, label: string) => (
    <button
      key={v}
      type="button"
      onClick={() => setView(v)}
      aria-pressed={view === v}
      className={cx(
        'rounded-[var(--radius-control)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]',
        view === v
          ? 'bg-[var(--surface-2)] text-[var(--text-primary)] shadow-[inset_0_0_0_1px_var(--accent-color)]'
          : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="w-full min-w-0">
      <div className="flex items-center justify-between gap-3 px-2 pt-2 sm:px-3">
        <span className="slayer-title-page text-[13px] text-[var(--text-secondary)]">Dealer Flow</span>
        <div className="flex items-center gap-0.5 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[#050505] p-0.5">
          {seg('overview', 'Overview')}
          {seg('screener', 'Flow Screener')}
        </div>
      </div>
      {view === 'overview' ? <DealerFlowDashboard feedStatus={feedStatus} /> : screener}
    </div>
  );
}
