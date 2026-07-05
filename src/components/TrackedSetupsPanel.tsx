import { useMemo } from 'react';
import { Activity, TrendingUp, TrendingDown, X, Radio, FlaskConical } from 'lucide-react';
import {
  useTrackingStore, computeStats, splitByMode, isTerminal,
  STATUS_LABEL, trackModeLabel, type TrackedSetup, type TrackStatus, type TrackStats,
} from '../lib/trackedSetups';
import { SectionHeader } from './ui/SectionHeader';

/**
 * Tracked Setups — the live half of Trade History. Reads the tracking store and shows what
 * the user actually tracked from SkyVision / Pinpoint: active setups re-pricing over time, and
 * resolved outcomes. Live performance is kept strictly apart from model/sample tracks so a
 * demo win-rate can never masquerade as a real one.
 */

const STATUS_TONE: Record<TrackStatus, string> = {
  REVIEWED: 'text-[var(--text-tertiary)] border-[var(--border)] bg-[var(--surface-2)]',
  TRACKED: 'text-[var(--info)] border-[var(--info)]/40 bg-[var(--info)]/10',
  ACTIVE: 'text-[var(--info)] border-[var(--info)]/40 bg-[var(--info)]/10',
  INVALIDATED: 'text-[var(--danger)] border-[var(--danger)]/40 bg-[var(--danger)]/10',
  RESOLVED_WIN: 'text-[var(--success)] border-[var(--success)]/40 bg-[var(--success)]/10',
  RESOLVED_LOSS: 'text-[var(--danger)] border-[var(--danger)]/40 bg-[var(--danger)]/10',
  EXPIRED: 'text-[var(--warning)] border-[var(--warning)]/40 bg-[var(--warning)]/10',
  CANCELLED: 'text-[var(--text-tertiary)] border-[var(--border)] bg-[var(--surface-2)]',
};

function holdTime(from: number, to: number): string {
  const s = Math.max(0, Math.round((to - from) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) return rm ? `${h}h ${rm}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

const pct = (n: number | null) => (n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`);
const pctColor = (n: number) => (n > 0 ? 'text-[var(--success)]' : n < 0 ? 'text-[var(--danger)]' : 'text-[var(--text-secondary)]');

function StatBlock({ title, icon, stats, live }: { title: string; icon: React.ReactNode; stats: TrackStats; live: boolean }) {
  return (
    <div className={`rounded-xl border p-3.5 ${live ? 'border-[var(--success)]/25 bg-[var(--success)]/[0.03]' : 'border-[var(--info)]/25 bg-[var(--info)]/[0.03]'}`}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">
          <span className={live ? 'text-[var(--success)]' : 'text-[var(--info)]'} aria-hidden="true">{icon}</span>
          {title}
        </span>
        {!live && (
          <span className="text-[8px] font-bold uppercase tracking-widest text-[var(--info)]">Not live performance</span>
        )}
      </div>
      <div className="mt-2.5 grid grid-cols-4 gap-2">
        <div>
          <span className="block text-[8px] uppercase tracking-widest text-[var(--text-tertiary)]">Win rate</span>
          <span className="block text-lg font-black tabular-nums text-[var(--text-primary)]">{stats.winRate == null ? '—' : `${stats.winRate}%`}</span>
        </div>
        <div>
          <span className="block text-[8px] uppercase tracking-widest text-[var(--text-tertiary)]">Record</span>
          <span className="block text-lg font-black tabular-nums text-[var(--text-primary)]">{stats.wins}<span className="text-[var(--text-tertiary)]">-</span>{stats.losses}</span>
        </div>
        <div>
          <span className="block text-[8px] uppercase tracking-widest text-[var(--text-tertiary)]">Active</span>
          <span className="block text-lg font-black tabular-nums text-[var(--text-primary)]">{stats.active}</span>
        </div>
        <div>
          <span className="block text-[8px] uppercase tracking-widest text-[var(--text-tertiary)]">Avg result</span>
          <span className={`block text-lg font-black tabular-nums ${stats.avgReturnPct == null ? 'text-[var(--text-primary)]' : pctColor(stats.avgReturnPct)}`}>{pct(stats.avgReturnPct)}</span>
        </div>
      </div>
    </div>
  );
}

function SetupRow({ s, now, onCancel }: { s: TrackedSetup; now: number; onCancel: (id: string) => void }) {
  const terminal = isTerminal(s.status);
  const change = s.premiumChangePct;
  const DirIcon = s.direction === 'BULLISH' ? TrendingUp : TrendingDown;
  const dirColor = s.direction === 'BULLISH' ? 'text-[var(--success)]' : 'text-[var(--danger)]';
  return (
    <div className={`rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 ${terminal ? 'opacity-90' : ''}`}>
      {/* Line 1: identity + status */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <DirIcon className={`w-3.5 h-3.5 shrink-0 ${dirColor}`} />
          <span className="font-black text-[13px] text-[var(--text-primary)] truncate">{s.contract}</span>
          <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-tertiary)] shrink-0">{s.expiry}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`rounded border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest ${STATUS_TONE[s.status]}`}>
            {STATUS_LABEL[s.status]}
          </span>
          {!terminal && (
            <button
              onClick={() => onCancel(s.id)}
              aria-label={`Stop tracking ${s.contract}`}
              className="rounded p-0.5 text-[var(--text-tertiary)] transition-colors hover:text-[var(--danger)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--danger)]"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
      {/* Line 2: premium journey */}
      <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1.5 text-[10px]">
        <div>
          <span className="block text-[8px] uppercase tracking-widest text-[var(--text-tertiary)]">Entry → now</span>
          <span className="block font-mono font-bold tabular-nums text-[var(--text-secondary)]">
            ${s.premiumAtTrack.toFixed(2)} → <span className="text-[var(--text-primary)]">${s.currentPremium.toFixed(2)}</span>
          </span>
        </div>
        <div>
          <span className="block text-[8px] uppercase tracking-widest text-[var(--text-tertiary)]">{terminal ? 'Result' : 'Change'}</span>
          <span className={`block font-mono font-black tabular-nums ${pctColor(terminal ? (s.finalReturnPct ?? change) : change)}`}>
            {pct(terminal ? (s.finalReturnPct ?? change) : change)}
          </span>
        </div>
        <div>
          <span className="block text-[8px] uppercase tracking-widest text-[var(--text-tertiary)]">Max gain / DD</span>
          <span className="block font-mono font-bold tabular-nums">
            <span className="text-[var(--success)]">{pct(s.maxGainPct)}</span>
            <span className="text-[var(--text-tertiary)]"> / </span>
            <span className="text-[var(--danger)]">{pct(s.maxDrawdownPct)}</span>
          </span>
        </div>
        <div>
          <span className="block text-[8px] uppercase tracking-widest text-[var(--text-tertiary)]">Hold</span>
          <span className="block font-mono font-bold tabular-nums text-[var(--text-secondary)]">{holdTime(s.createdAt, s.resolvedAt ?? now)}</span>
        </div>
      </div>
      {/* Line 3: reason + flags + provenance */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-[var(--border)] pt-2">
        <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">Score {s.setupScore}</span>
        <span className="text-[var(--text-tertiary)]">·</span>
        <span className="text-[9px] text-[var(--text-tertiary)]">{s.dealerReason}</span>
        {s.invalidationTouched && (
          <span className="rounded border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-[var(--danger)]">Invalidation hit</span>
        )}
        {s.targetReached && (
          <span className="rounded border border-[var(--success)]/40 bg-[var(--success)]/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-[var(--success)]">Target reached</span>
        )}
        <span className="ml-auto rounded border border-[var(--info)]/30 bg-[var(--info)]/5 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-[var(--info)]" title="How this setup was tracked — model/sample tracks are excluded from live performance.">
          {trackModeLabel(s.dataMode)}
        </span>
      </div>
    </div>
  );
}

export function TrackedSetupsPanel() {
  const setups = useTrackingStore(s => s.setups);
  const cancel = useTrackingStore(s => s.cancel);
  const clearResolved = useTrackingStore(s => s.clearResolved);

  const visible = useMemo(() => setups.filter(s => s.status !== 'CANCELLED'), [setups]);
  const { live, modelSample } = useMemo(() => splitByMode(visible), [visible]);
  const liveStats = useMemo(() => computeStats(live), [live]);
  const modelStats = useMemo(() => computeStats(modelSample), [modelSample]);

  const active = useMemo(
    () => visible.filter(s => !isTerminal(s.status)).sort((a, b) => b.createdAt - a.createdAt),
    [visible],
  );
  const resolved = useMemo(
    () => visible.filter(s => isTerminal(s.status)).sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0)),
    [visible],
  );

  if (visible.length === 0) return null;

  // A stable "now" per render keeps hold-times consistent within this paint; the resolver
  // re-renders us on each tick so it stays current without a local timer.
  const now = Date.now();

  return (
    <section className="space-y-4">
      <SectionHeader
        label="Tracked Setups"
        icon={<Activity className="w-3.5 h-3.5" />}
        description="Setups you tracked from SkyVision / Pinpoint, re-priced from the live feed. Model & sample tracks are kept out of live performance."
        right={resolved.length > 0 ? (
          <button
            onClick={clearResolved}
            className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-tertiary)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] rounded transition-colors"
          >
            Clear resolved
          </button>
        ) : undefined}
      />

      {/* Live vs model/sample — never mixed */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <StatBlock title="Live tracks" icon={<Radio className="w-3 h-3" />} stats={liveStats} live />
        <StatBlock title="Model / Sample" icon={<FlaskConical className="w-3 h-3" />} stats={modelStats} live={false} />
      </div>

      {active.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-3 h-3 text-[var(--success)]" />
            <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)]">Open Positions</span>
            <span className="text-[9px] font-mono text-[var(--text-tertiary)] tabular-nums">{active.length}</span>
            <span className="text-[8px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">· contracts you're in</span>
          </div>
          {active.map(s => <SetupRow key={s.id} s={s} now={now} onCancel={cancel} />)}
        </div>
      )}

      {resolved.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)]">Closed</span>
            <span className="text-[9px] font-mono text-[var(--text-tertiary)] tabular-nums">{resolved.length}</span>
          </div>
          {resolved.map(s => <SetupRow key={s.id} s={s} now={now} onCancel={cancel} />)}
        </div>
      )}
    </section>
  );
}

/** Small helper so callers can gate the legacy empty-state on whether anything is tracked. */
export function useTrackedCount(): number {
  return useTrackingStore(s => s.setups.filter(x => x.status !== 'CANCELLED').length);
}

export default TrackedSetupsPanel;
