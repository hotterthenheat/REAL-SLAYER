import { Circle, LayoutGrid, Plus, Settings2 } from 'lucide-react';
import { cx } from '../../lib/cx';

/**
 * TerminalTopBar — the render's top chrome: symbol chip, live spot + change,
 * feed status, timestamp, and Layout / Add Widget / Settings actions. The feed
 * dot is honest: green only when `live` is true; a model/sim feed renders the
 * neutral dot with its real label.
 */
type TerminalTopBarProps = {
  symbol: string;
  spot: string;
  change: string;
  changeTone?: 'positive' | 'negative' | 'neutral';
  live?: boolean;
  feedLabel?: string;
  timestamp: string;
  onLayout?: () => void;
  onAddWidget?: () => void;
  onSettings?: () => void;
  className?: string;
};

export function TerminalTopBar({
  symbol,
  spot,
  change,
  changeTone = 'neutral',
  live = false,
  feedLabel = 'Real-time feed',
  timestamp,
  onLayout,
  onAddWidget,
  onSettings,
  className,
}: TerminalTopBarProps) {
  const changeCls =
    changeTone === 'positive'
      ? 'text-[var(--positive-ink)]'
      : changeTone === 'negative'
        ? 'text-[var(--negative-ink)]'
        : 'text-[var(--text-secondary)]';
  const dotCls = live
    ? 'fill-[var(--positive-ink)] text-[var(--positive-ink)]'
    : 'fill-[var(--text-muted)] text-[var(--text-muted)]';
  return (
    <header className={cx('slayer-panel flex items-center justify-between gap-3 px-4 py-3', className)}>
      <div className="flex min-w-0 items-center gap-4">
        <div className="rounded-[7px] border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
            {symbol}
          </div>
        </div>
        <div className="min-w-0">
          <div className="slayer-num truncate text-[26px] font-semibold leading-none text-[var(--text-primary)]">
            {spot}
          </div>
          <div className={cx('mt-1 truncate text-[12px]', changeCls)}>{change}</div>
        </div>
      </div>
      <div className="hidden items-center gap-8 lg:flex">
        <div className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
          <Circle className={cx('h-2.5 w-2.5', dotCls)} />
          <div>
            <div className="font-semibold uppercase tracking-[0.14em] text-[var(--text-primary)]">
              {live ? 'Live' : 'Model'}
            </div>
            <div>{feedLabel}</div>
          </div>
        </div>
        <div className="slayer-num text-[12px] text-[var(--text-secondary)]">{timestamp}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {onLayout && (
          <button className="slayer-control hidden md:block" onClick={onLayout} type="button">
            <span className="inline-flex items-center gap-2">
              <LayoutGrid className="h-3.5 w-3.5" />
              Layout
            </span>
          </button>
        )}
        {onAddWidget && (
          <button className="slayer-control hidden md:block" onClick={onAddWidget} type="button">
            <span className="inline-flex items-center gap-2">
              <Plus className="h-3.5 w-3.5" />
              Add Widget
            </span>
          </button>
        )}
        {onSettings && (
          <button className="slayer-control" onClick={onSettings} type="button" aria-label="Settings">
            <Settings2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </header>
  );
}

export default TerminalTopBar;
