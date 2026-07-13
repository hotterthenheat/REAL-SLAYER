import React, { useState, useEffect, useCallback } from 'react';
import { formatDateTime } from '../lib/timeUtils';
import { cx } from '../lib/cx';
import { ConfirmDialog } from './ConfirmDialog';
import { FieldError, zodError, type SubmitState } from './ui/Field';
import { SearchInput } from './ui/SearchInput';
import { ConversionCard } from './admin/ConversionCard';
import { TerminalPanel } from './ui/terminal/TerminalPanel';
import { DataTable, type Column } from './ui/terminal/DataTable';
import { StatusBadge } from './ui/terminal/StatusBadge';
import { couponCodeSchema, couponPercentSchema } from '../lib/formSchemas';
import {
  ShieldAlert, Users, Key, Radio,
  Ticket, Power, ToggleLeft, ToggleRight, Ban, UserX, LogOut, Eye, RefreshCw, ScrollText
} from 'lucide-react';

/**
 * ADMIN OPERATIONS BOARD — the Overseer page laid out as one continuous board
 * instead of a sidebar-and-tabs shell:
 *
 *   1. COMMAND BAR      — identity (rose = privileged), feed pill, live readout,
 *                         maintenance flag, board refresh.
 *   2. KPI BAND         — one slim hairline-divided row of value-first cells.
 *   3. TWO-COLUMN BODY  — LEFT (wide): the working desks (Users / Coupons /
 *                         Audit) with search + actions docked in each panel
 *                         header; RIGHT: a monitoring rail stacking feed health,
 *                         recent activity, the conversion chart and the
 *                         privileged system switches.
 *
 * Rose marks admin-only destructive controls (ban, maintenance kill-switch,
 * the role badge); the GLACIER accent carries all normal interactions.
 */

/**
 * Map the server's provider identifier to a live-flag + human label for the Feed Health card.
 * Any live provider reads green; the synthetic sandbox reads as info.
 */
const FEED_META: Record<string, { state: 'live' | 'model'; label: string }> = {
  THETADATA_LIVE: { state: 'live', label: 'ThetaData Live' },
  TRADIER_POLYGON_COMPLEMENTARY: { state: 'live', label: 'Tradier + Polygon' },
  TRADIER_LIVE: { state: 'live', label: 'Tradier Live' },
  POLYGON_LIVE: { state: 'live', label: 'Polygon Live' },
  SANDBOX_SYNTHETIC: { state: 'model', label: 'Sandbox Synthetic' },
};

interface AdminPanelProps {
  session: any;
  onSimulateTier: (tierStr: string, tierNum: number) => void;
}

async function api(path: string, opts: RequestInit = {}) {
  const res = await fetch(path, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
  return res.json();
}

// ── Shared control-surface classes (one button hierarchy, one field style) ─────
const FIELD = 'slayer-control w-full placeholder:text-[var(--text-faint)] focus:outline-none focus-visible:border-[var(--border-strong)]';
const ICON_BTN = 'flex shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--bg-shell)] p-2.5 text-[var(--text-muted)] transition-colors cursor-pointer hover:border-[var(--border-mid)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:border-[var(--border-strong)]';
const GHOST_BTN = 'rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--bg-shell)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)] transition-colors cursor-pointer hover:border-[var(--border-mid)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:border-[var(--border-strong)]';
const PAGER_BTN = `${GHOST_BTN} disabled:cursor-default disabled:opacity-40 disabled:hover:border-[var(--border-subtle)] disabled:hover:text-[var(--text-secondary)]`;
// GLACIER accent CTA — the one primary action of a panel (normal interactions stay ice-blue).
const ACCENT_BTN = 'cursor-pointer rounded-[var(--radius-control)] border border-[color:var(--accent-glow)] bg-[var(--accent-soft)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-color)] transition-colors hover:border-[var(--accent-color)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-color)] disabled:opacity-50';
// Command-bar readout chip — passive status, recessed fill.
const READOUT = 'slayer-readout flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em]';

export function AdminOverseerPanel({ session, onSimulateTier }: AdminPanelProps) {
  const [tab, setTab] = useState<string>('users');
  const [overview, setOverview] = useState<any>(null);
  const [live, setLive] = useState<number>(0);

  const loadOverview = useCallback(() => {
    api('/api/admin/overview').then((d) => { setOverview(d); setLive(d.live_connections); }).catch(() => {});
  }, []);

  useEffect(() => {
    // We treat 'owner' or 'admin' or 'super_admin' as authorized. The backend verifies roles per action.
    if (!['super_admin', 'owner', 'admin'].includes(session?.admin_role || '')) {
      if (session?.is_super_admin) loadOverview(); // fallback
    } else {
      loadOverview();
    }
    const t = setInterval(() => api('/api/admin/live').then((d) => setLive(d.live_connections)).catch(() => {}), 5000);
    return () => clearInterval(t);
  }, [session, loadOverview]);

  if (!session?.is_super_admin && !['super_admin', 'owner', 'admin'].includes(session?.admin_role || '')) {
    return (
      <div className="slayer-panel mx-auto mt-10 max-w-xl p-8 text-center font-mono">
        <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-rose-400" />
        <h2 className="slayer-title text-[15px]">Unauthorized Access</h2>
        <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)]">You don't have permission to view this page.</p>
      </div>
    );
  }

  // The working desks of the left column — overview data lives on the board itself now.
  const WORKSPACES = [
    { id: 'users', label: 'Users', icon: Users },
    { id: 'subscriptions', label: 'Coupons', icon: Ticket },
    { id: 'audit', label: 'Audit Trail', icon: ScrollText },
  ];

  const adminRole = overview?.admin_role || session?.admin_role || (session?.is_super_admin ? 'super_admin' : '—');
  const feed = FEED_META[overview?.data_source] || { state: 'model' as const, label: overview?.data_source || 'Unknown' };

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-3 p-4 font-mono">
      {/* ── 1 · COMMAND BAR — who you are, what the system is doing, right now ── */}
      <header className="slayer-panel flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Key className="h-4 w-4 shrink-0 text-rose-400" />
          <div className="min-w-0">
            <div className="slayer-title-page">Overseer</div>
            <div className="slayer-subtitle">Operations board</div>
          </div>
        </div>
        <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2">
          {/* Rose readout — the privileged-identity marker. */}
          <span className="flex items-center gap-2 rounded-[var(--radius-control)] border border-rose-500/30 bg-rose-500/10 px-2.5 py-[7px] text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-400">
            Role · {adminRole}
          </span>
          <span className={READOUT} title={`Market data: ${feed.label}`}>
            <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', feed.state === 'live' ? 'animate-pulse bg-[var(--positive-ink)]' : 'bg-[var(--info)]')}></span>
            <span className="max-w-[150px] truncate">{feed.label}</span>
          </span>
          <span className={READOUT} title="Live terminal connections">
            <Radio className="h-3.5 w-3.5 shrink-0 text-[var(--positive-ink)]" />
            <span className="slayer-num text-[var(--text-primary)]">{live}</span>
            <span className="text-[var(--text-muted)]">Live</span>
          </span>
          {overview?.maintenance_mode && <StatusBadge tone="negative">503 Active</StatusBadge>}
          <button onClick={loadOverview} aria-label="Refresh overview" className={ICON_BTN}><RefreshCw className="h-4 w-4" /></button>
        </div>
      </header>

      {/* ── 2 · KPI BAND — every board number in one slim hairline-divided row ── */}
      <KpiBand overview={overview} live={live} />

      {/* ── 3 · BOARD BODY — working desks left, monitoring rail right ── */}
      <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
        <div className="min-w-0 space-y-3">
          {/* Workspace switcher — a segmented strip docked over the desk, not a sidebar. */}
          <nav aria-label="Admin workspaces" className="slayer-panel flex gap-1 overflow-x-auto p-1.5">
            {WORKSPACES.map((w) => {
              const Icon = w.icon;
              const active = tab === w.id;
              return (
                <button key={w.id} onClick={() => setTab(w.id)} aria-current={active ? 'page' : undefined}
                  className={cx(
                    'flex flex-1 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-color)]',
                    active
                      ? 'border border-[color:var(--accent-glow)] bg-[var(--accent-soft)] text-[var(--accent-color)]'
                      : 'border border-transparent text-[var(--text-muted)] hover:bg-[rgba(248,248,255,0.03)] hover:text-[var(--text-primary)]',
                  )}>
                  <Icon className="h-3.5 w-3.5 shrink-0" /> {w.label}
                </button>
              );
            })}
          </nav>

          {tab === 'users' && <UsersDesk />}
          {tab === 'subscriptions' && <CouponDesk />}
          {tab === 'audit' && <AuditDesk />}
        </div>

        <MonitoringRail overview={overview} reload={loadOverview} onSimulateTier={onSimulateTier} feed={feed} />
      </div>
    </div>
  );
}

/* ════════════════════════════════ KPI BAND ════════════════════════════════ */

type KpiTone = 'accent' | 'positive' | 'warning' | 'negative' | 'neutral';

// Value ink + label tick per tone — the value leads the cell, quote-board style.
const KPI_TONE: Record<KpiTone, { ink: string; tick: string }> = {
  accent: { ink: 'var(--text-primary)', tick: 'var(--accent-color)' },
  positive: { ink: 'var(--positive-ink)', tick: 'var(--positive-ink)' },
  warning: { ink: 'var(--warning-ink, var(--warning))', tick: 'var(--warning)' },
  negative: { ink: 'var(--negative-ink)', tick: 'var(--negative-ink)' },
  neutral: { ink: 'var(--text-secondary)', tick: 'var(--border-strong)' },
};

function KpiBand({ overview, live }: { overview: any; live: number }) {
  const total: number | null = typeof overview?.total_users === 'number' ? overview.total_users : null;
  const paid: number | null = typeof overview?.paid_users === 'number' ? overview.paid_users : null;
  const rate = total != null && paid != null && total > 0 ? paid / total : null;

  const cells: { label: string; value: React.ReactNode; tone: KpiTone }[] = [
    { label: 'Total Users', value: total ?? '—', tone: 'accent' },
    { label: 'Buyers', value: paid ?? '—', tone: 'accent' },
    { label: 'Conversion', value: rate != null ? `${(rate * 100).toFixed(rate >= 0.1 ? 0 : 1)}%` : '—', tone: 'accent' },
    { label: 'Live Now', value: live, tone: live ? 'positive' : 'neutral' },
    { label: 'Suspended', value: overview?.suspended ?? '—', tone: overview?.suspended ? 'warning' : 'neutral' },
    { label: 'Banned', value: overview?.banned ?? '—', tone: overview?.banned ? 'negative' : 'neutral' },
    { label: 'Coupons', value: overview?.coupons ?? '—', tone: 'neutral' },
    { label: 'Audit Entries', value: overview?.audit_entries ?? '—', tone: 'neutral' },
  ];

  return (
    <div className="slayer-panel grid grid-cols-2 gap-px overflow-hidden bg-[var(--border-subtle)] sm:grid-cols-4 xl:grid-cols-8">
      {cells.map((c) => {
        const t = KPI_TONE[c.tone];
        return (
          <div key={c.label} className="min-w-0 bg-[var(--bg-panel)] px-3 py-2.5">
            <div className="slayer-num truncate text-[17px] font-bold leading-none" style={{ color: t.ink }}>{c.value}</div>
            <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
              <span aria-hidden="true" className="h-[2px] w-3 shrink-0 rounded-full" style={{ background: t.tick }}></span>
              <span title={c.label} className="truncate text-[9px] font-semibold uppercase leading-tight tracking-[0.15em] text-[var(--text-muted)]">{c.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════ MONITORING RAIL ═══════════════════════════ */

function MonitoringRail({ overview, reload, onSimulateTier, feed }: {
  overview: any; reload: () => void; onSimulateTier: (s: string, n: number) => void;
  feed: { state: 'live' | 'model'; label: string };
}) {
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<any[]>([]);
  const [recentLoaded, setRecentLoaded] = useState(false);
  // Recent-activity preview: the five newest audit entries, refreshed whenever the overview
  // reloads so operational actions surface on the rail without opening the Audit desk.
  useEffect(() => {
    let alive = true;
    api('/api/admin/audit').then((d) => { if (alive) { setRecent((d.entries || []).slice(0, 5)); setRecentLoaded(true); } }).catch(() => { if (alive) setRecentLoaded(true); });
  }, [overview?.audit_entries]);
  const toggleMaintenance = async () => {
    setBusy(true);
    try { await api('/api/admin/maintenance', { method: 'POST', body: JSON.stringify({ enabled: !overview?.maintenance_mode }) }); reload(); } finally { setBusy(false); }
  };
  const toggleFlag = async (key: string, value: boolean) => {
    await api('/api/admin/flags', { method: 'POST', body: JSON.stringify({ key, value }) }).catch(() => {});
    reload();
  };
  const flags = overview?.feature_flags || {};
  const serverTime = typeof overview?.server_time === 'number' ? overview.server_time : null;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {/* Feed health — the market-data provider currently backing every terminal read. */}
      <TerminalPanel title="Feed Health" subtitle="Provider backing every terminal read">
        <div className="divide-y divide-[var(--border-subtle)]">
          <div className="flex items-center justify-between gap-3 pb-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Provider</span>
            <span className="flex min-w-0 items-center gap-2">
              <span className={cx('h-2 w-2 shrink-0 rounded-full', feed.state === 'live' ? 'animate-pulse bg-[var(--positive-ink)]' : 'bg-[var(--info)]')}></span>
              <span className="truncate text-[11px] font-semibold text-[var(--text-primary)]">{feed.label}</span>
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 pt-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Server Time</span>
            <span className="slayer-num truncate text-[11px] font-semibold text-[var(--text-secondary)]">{serverTime ? formatDateTime(new Date(serverTime).toISOString()) : '—'}</span>
          </div>
        </div>
      </TerminalPanel>

      {/* Recent activity — the five newest audit-trail entries, stacked for the rail. */}
      <TerminalPanel title="Recent Activity" subtitle="Five newest audit entries">
        {!recentLoaded ? (
          <div className="py-1 text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">Loading…</div>
        ) : recent.length === 0 ? (
          <div className="py-1 text-[11px] leading-relaxed text-[var(--text-muted)]">No admin actions recorded yet. Role changes, feature toggles, coupon creation and maintenance actions appear here as they happen.</div>
        ) : (
          <div className="divide-y divide-[var(--border-subtle)]">
            {recent.map((e) => (
              <div key={e.id} className="py-2 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-wide text-[var(--warning)]" title={e.action_taken}>{e.action_taken}</span>
                  <span className="slayer-num shrink-0 whitespace-nowrap text-[9.5px] text-[var(--text-muted)]">{formatDateTime(e.timestamp)}</span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px]">
                  <span className="min-w-0 truncate text-[var(--positive-ink)]" title={e.admin_email}>{e.admin_email}</span>
                  {e.target_id && <span className="min-w-0 truncate text-[var(--text-muted)]" title={e.target_id}>{e.target_id}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </TerminalPanel>

      {/* Visitors vs buyers — the conversion instrument, charted. */}
      <ConversionCard overview={overview} />

      {/* Privileged switches — rose marks the destructive kill-switch. */}
      <TerminalPanel title="System Controls" subtitle="Privileged switches — every action is audited">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Power className={cx('h-4 w-4 shrink-0', overview?.maintenance_mode ? 'text-rose-400' : 'text-[var(--text-muted)]')} />
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-[var(--text-primary)]">Maintenance Mode</div>
              <div className="truncate text-[9.5px] uppercase tracking-[0.14em] text-[var(--text-muted)]">{overview?.maintenance_mode ? '503 to all non-admin traffic' : 'Inactive'}</div>
            </div>
          </div>
          <button onClick={toggleMaintenance} disabled={busy} className="shrink-0 cursor-pointer rounded-[var(--radius-control)] transition-opacity focus:outline-none focus-visible:ring-1 focus-visible:ring-rose-400 disabled:opacity-50" aria-label="Toggle maintenance mode">
            {overview?.maintenance_mode ? <ToggleRight className="h-8 w-8 text-rose-400" /> : <ToggleLeft className="h-8 w-8 text-[var(--text-muted)]" />}
          </button>
        </div>

        <div className="mt-3 border-t border-[var(--border-subtle)] pt-3">
          <div className="mb-2 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">QA Viewport Simulation</div>
          <div className="flex flex-wrap gap-1.5">
            {([['Guest', 0], ['SkyVision', 2], ['Pinpoint', 3], ['Quant', 4], ['Lifetime', 5]] as const).map(([label, n]) => (
              <button key={label} onClick={() => onSimulateTier(label, n)}
                className="slayer-control cursor-pointer text-[10px] font-semibold uppercase tracking-[0.14em] hover:text-[var(--text-primary)] focus:outline-none focus-visible:border-[var(--border-strong)]">
                {label}
              </button>
            ))}
          </div>
        </div>
      </TerminalPanel>

      {/* Feature flags — normal interactions read GLACIER accent when on. */}
      <TerminalPanel title="Feature Toggles">
        {Object.keys(flags).length === 0 ? (
          <div className="py-1 text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">No feature toggles available</div>
        ) : (
          <div className="divide-y divide-[var(--border-subtle)]">
            {Object.keys(flags).map((k) => (
              <button key={k} onClick={() => toggleFlag(k, !flags[k])}
                aria-pressed={!!flags[k]} aria-label={`Toggle ${k.replace(/_/g, ' ')}`}
                className="group flex w-full items-center justify-between gap-3 rounded-[var(--radius-control)] py-2.5 text-left first:pt-0 last:pb-0 focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-color)]">
                <span className="text-[11px] capitalize text-[var(--text-secondary)] transition-colors group-hover:text-[var(--text-primary)]">{k.replace(/_/g, ' ')}</span>
                {flags[k] ? <ToggleRight className="h-6 w-6 shrink-0 text-[var(--accent-color)]" /> : <ToggleLeft className="h-6 w-6 shrink-0 text-[var(--text-muted)]" />}
              </button>
            ))}
          </div>
        )}
      </TerminalPanel>
    </div>
  );
}

/* ═══════════════════════════════ USERS DESK ═══════════════════════════════ */

function UsersDesk() {
  const [data, setData] = useState<any>({ rows: [], total: 0, nextCursor: null });
  const [cursors, setCursors] = useState<{ current: string | null; history: (string | null)[] }>({ current: null, history: [] });
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm: () => void;
  } | null>(null);

  const load = useCallback((c: string | null) => {
    setLoading(true);
    setError('');
    api(`/api/admin/users?perPage=10&q=${encodeURIComponent(q)}${c ? `&cursor=${encodeURIComponent(c)}` : ''}`)
      .then(setData)
      .catch((e) => setError(e.message || 'Failed to load users.'))
      .finally(() => setLoading(false));
  }, [q]);

  useEffect(() => { load(cursors.current); }, [cursors.current, load]);

  const runAct = async (email: string, action: string) => {
    setActionError('');
    try {
      await api(`/api/admin/users/${encodeURIComponent(email)}/${action}`, { method: 'POST' });
    } catch (e: any) {
      setActionError(e.message || `Failed to ${action} ${email}.`);
      return;
    }
    if (action === 'impersonate') { window.location.reload(); return; }
    load(cursors.current);
  };
  const act = (email: string, action: string) => {
    if (action === 'ban') {
      setConfirmDialog({
        title: 'Ban user',
        message: `Ban ${email}? They will lose access immediately. You can reverse this later from the moderation store.`,
        confirmLabel: 'Ban user',
        danger: true,
        onConfirm: () => runAct(email, action),
      });
      return;
    }
    runAct(email, action);
  };
  const runImpersonate = async (email: string) => {
    setActionError('');
    try {
      await api(`/api/admin/impersonate/${encodeURIComponent(email)}`, { method: 'POST' });
    } catch (e: any) {
      setActionError(e.message || `Failed to impersonate ${email}.`);
      return;
    }
    window.location.reload();
  };
  const impersonate = (email: string) => {
    setConfirmDialog({
      title: 'Impersonate user',
      message: `View the app as ${email}? You'll see their session read-only until you exit the preview.`,
      confirmLabel: 'Impersonate',
      onConfirm: () => runImpersonate(email),
    });
  };
  const changeTier = async (email: string, tier: string) => {
    setActionError('');
    try {
      await api(`/api/admin/users/${encodeURIComponent(email)}/tier`, { method: 'PATCH', body: JSON.stringify({ access_tier: tier }) });
    } catch (e: any) {
      setActionError(e.message || `Failed to change tier for ${email}.`);
      return;
    }
    load(cursors.current);
  };

  const columns: Column<any>[] = [
    { key: 'user', header: 'User', align: 'left', render: (u) => (
      <div className="min-w-0">
        <div className="truncate font-semibold text-[var(--text-primary)]">{u.name || u.username}</div>
        <div className="truncate text-[var(--text-muted)]">{u.email}</div>
      </div>
    ) },
    { key: 'tier', header: 'Tier', align: 'left', render: (u) => (
      <div className="flex items-center gap-2">
        <select aria-label={`Access tier for ${u.email}`} value={u.access_tier} onChange={(e) => changeTier(u.email, e.target.value)}
          className="slayer-control cursor-pointer px-2 py-1 uppercase text-[var(--text-secondary)] focus:outline-none focus-visible:border-[var(--border-strong)]">
          {['guest', 'discord', 'intraday', 'quant', 'enterprise', 'lifetime'].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {u.role !== 'user' && <StatusBadge tone="warning">{u.role}</StatusBadge>}
      </div>
    ) },
    { key: 'tokens', header: 'Tokens', align: 'right', render: (u) => <span className="slayer-num text-[var(--positive-ink)]">{u.referral_tokens_pool}</span> },
    { key: 'status', header: 'Status', align: 'left', render: (u) => (
      <div className="flex flex-col items-start gap-1">
        <span className="inline-flex items-center gap-1.5">
          <span className={cx('h-1.5 w-1.5 rounded-full', u.online ? 'bg-[var(--positive-ink)]' : 'bg-[var(--text-muted)]')}></span>
          <span className={cx('text-[10px] font-semibold', u.online ? 'text-[var(--positive-ink)]' : 'text-[var(--text-muted)]')}>{u.online ? 'ONLINE' : 'OFFLINE'}</span>
        </span>
        {u.banned ? <StatusBadge tone="negative">Banned</StatusBadge> : u.suspended ? <StatusBadge tone="warning">Suspended</StatusBadge> : null}
      </div>
    ) },
    { key: 'actions', header: 'Actions', align: 'right', render: (u) => (
      <div className="flex items-center justify-end gap-1">
        <button aria-label={`Impersonate ${u.email}`} onClick={() => impersonate(u.email)} className="cursor-pointer rounded-[var(--radius-control)] p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[rgba(248,248,255,0.06)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)]"><Eye className="h-3.5 w-3.5" /></button>
        <button aria-label={`${u.suspended ? 'Unsuspend' : 'Suspend'} ${u.email}`} onClick={() => act(u.email, u.suspended ? 'unsuspend' : 'suspend')} className="cursor-pointer rounded-[var(--radius-control)] p-1.5 text-[var(--warning)] transition-colors hover:bg-[rgba(196,154,58,0.14)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)]"><UserX className="h-3.5 w-3.5" /></button>
        <button aria-label={`Force logout ${u.email}`} onClick={() => act(u.email, 'force-logout')} className="cursor-pointer rounded-[var(--radius-control)] p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[rgba(248,248,255,0.06)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)]"><LogOut className="h-3.5 w-3.5" /></button>
        {/* Rose — the admin-only destructive action of the row. */}
        <button aria-label={`${u.banned ? 'Unban' : 'Ban'} ${u.email}`} onClick={() => act(u.email, u.banned ? 'unban' : 'ban')} className="cursor-pointer rounded-[var(--radius-control)] p-1.5 text-rose-400 transition-colors hover:bg-rose-500/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-rose-400"><Ban className="h-3.5 w-3.5" /></button>
      </div>
    ) },
  ];

  const emptyNode = error ? (
    <div role="alert" className="flex flex-col items-center gap-3 text-[var(--negative-ink)]">
      <span className="uppercase tracking-[0.14em]">{error}</span>
      <button onClick={() => load(cursors.current)} className={GHOST_BTN}>Retry</button>
    </div>
  ) : loading ? (
    <span className="uppercase tracking-[0.14em] text-[var(--text-muted)]">Loading…</span>
  ) : q.trim() ? (
    <span className="uppercase tracking-[0.14em] text-[var(--text-muted)]">No users match your search</span>
  ) : (
    <span className="uppercase tracking-[0.14em] text-[var(--text-muted)]">No users</span>
  );

  return (
    <>
      <ConfirmDialog
        open={!!confirmDialog}
        title={confirmDialog?.title ?? ''}
        message={confirmDialog?.message ?? ''}
        confirmLabel={confirmDialog?.confirmLabel}
        danger={confirmDialog?.danger}
        onConfirm={() => { confirmDialog?.onConfirm(); setConfirmDialog(null); }}
        onCancel={() => setConfirmDialog(null)}
      />
      <TerminalPanel
        className="animate-fadeIn"
        title="User Management"
        subtitle={<span className="slayer-num">{data.total} account{data.total === 1 ? '' : 's'} on record</span>}
        actions={
          <div className="flex items-center gap-2">
            <SearchInput
              id="admin-user-search"
              ariaLabel="Search users"
              value={q}
              onChange={(v) => { setCursors({ current: null, history: [] }); setQ(v); }}
              onClear={() => { setCursors({ current: null, history: [] }); setQ(''); }}
              placeholder="Search by email, username, name…"
              className="w-52 min-w-0 sm:w-64"
            />
            <button onClick={() => load(cursors.current)} aria-label="Refresh users" className={ICON_BTN}><RefreshCw className={cx('h-4 w-4', loading && 'animate-spin')} /></button>
          </div>
        }
        padded={false}
        contentClassName="space-y-3 p-3"
        footer={
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
            <span className="slayer-num">{data.total} users</span>
            <div className="flex gap-2">
              <button disabled={cursors.history.length === 0} onClick={() => setCursors(prev => { const h = [...prev.history]; const c = h.pop() || null; return { history: h, current: c }; })} className={PAGER_BTN}>Prev</button>
              <button disabled={!data.nextCursor} onClick={() => setCursors(prev => ({ history: [...prev.history, prev.current], current: data.nextCursor }))} className={PAGER_BTN}>Next</button>
            </div>
          </div>
        }
      >
        {actionError && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[color:rgba(152,4,4,0.4)] bg-[var(--negative-soft)] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--negative-ink)]">
            <span className="min-w-0 break-words">{actionError}</span>
            <button onClick={() => setActionError('')} aria-label="Dismiss error" className="shrink-0 rounded-[var(--radius-control)] transition-colors hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)]">Dismiss</button>
          </div>
        )}

        <DataTable<any>
          columns={columns}
          rows={data.rows}
          rowKey={(u) => u.id}
          emptyState={<div className="text-[10px]">{emptyNode}</div>}
        />
      </TerminalPanel>
    </>
  );
}

/* ═══════════════════════════════ AUDIT DESK ═══════════════════════════════ */

function AuditDesk() {
  const [entries, setEntries] = useState<any[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [q, setQ] = useState('');
  const load = useCallback(() => {
    setStatus('loading');
    api('/api/admin/audit').then((d) => { setEntries(d.entries || []); setStatus('ready'); }).catch(() => setStatus('error'));
  }, []);
  useEffect(() => { load(); }, [load]);
  // Client-side filter across admin, action, target and IP — the audit log is capped at 200
  // entries server-side, so filtering in the browser is cheap and keeps the trail responsive.
  const filtered = entries.filter((e) => {
    if (!q.trim()) return true;
    const hay = `${e.admin_email} ${e.action_taken} ${e.target_id} ${e.ip_address} ${e.method}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });

  const columns: Column<any>[] = [
    { key: 'timestamp', header: 'Timestamp', align: 'left', render: (e) => <span className="whitespace-nowrap text-[var(--text-muted)]">{formatDateTime(e.timestamp)}</span> },
    { key: 'admin', header: 'Admin', align: 'left', render: (e) => <span className="text-[var(--positive-ink)]">{e.admin_email}</span> },
    { key: 'action', header: 'Action', align: 'left', render: (e) => <span className="font-semibold text-[var(--warning)]">{e.action_taken}</span> },
    { key: 'target', header: 'Target', align: 'left', render: (e) => <span className="text-[var(--text-secondary)]">{e.target_id}</span> },
    { key: 'method', header: 'Method', align: 'left', render: (e) => <span className="text-[var(--text-muted)]">{e.method}</span> },
    { key: 'ip', header: 'IP', align: 'right', render: (e) => <span className="slayer-num text-[var(--text-muted)]">{e.ip_address}</span> },
  ];

  const emptyNode = status === 'loading' ? (
    <span className="uppercase tracking-[0.14em] text-[var(--text-muted)]">Loading audit trail…</span>
  ) : status === 'error' ? (
    <span className="inline-flex flex-col items-center gap-2 text-[var(--negative-ink)]">
      <span className="uppercase tracking-[0.14em]">Could not load the audit trail.</span>
      <button onClick={load} className={GHOST_BTN}>Retry</button>
    </span>
  ) : q.trim() ? (
    <span className="text-[var(--text-muted)]">No audit entries match “{q.trim()}”.</span>
  ) : (
    <span className="leading-relaxed text-[var(--text-muted)]">No admin actions recorded yet. Role changes, feature toggles, coupon creation and maintenance actions appear here automatically.</span>
  );

  return (
    <TerminalPanel
      className="animate-fadeIn"
      title="Audit Trail"
      subtitle="Immutable record of privileged actions"
      actions={
        <div className="flex items-center gap-2">
          <SearchInput
            id="admin-audit-search"
            ariaLabel="Filter audit trail"
            value={q}
            onChange={setQ}
            onClear={() => setQ('')}
            placeholder="Filter by admin, action, target, IP…"
            className="w-52 min-w-0 sm:w-64"
          />
          <button onClick={load} aria-label="Refresh audit trail" className={ICON_BTN}><RefreshCw className={cx('h-4 w-4', status === 'loading' && 'animate-spin')} /></button>
        </div>
      }
      padded={false}
      contentClassName="p-3"
      footer={status === 'ready' && entries.length > 0 ? (
        <div className="slayer-num text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">{filtered.length} of {entries.length} entries</div>
      ) : undefined}
    >
      <DataTable<any>
        columns={columns}
        rows={filtered}
        rowKey={(e) => e.id}
        emptyState={<div className="text-[10px]">{emptyNode}</div>}
      />
    </TerminalPanel>
  );
}

/* ══════════════════════════════ COUPON DESK ══════════════════════════════ */

function CouponDesk() {
  const [coupons, setCoupons] = useState<any[]>([]);
  const [form, setForm] = useState({ code: '', discount_type: 'PERCENT', discount_value: 10, redemption_limit: 100, user_restriction: '', expires_at: '' });
  const [msg, setMsg] = useState('');
  const [errs, setErrs] = useState<{ code?: string | null; value?: string | null }>({});
  const [state, setState] = useState<SubmitState>('idle');
  const [listStatus, setListStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  // Today (YYYY-MM-DD) as the minimum selectable expiry so an admin can't mint a
  // coupon that's already expired the moment it's created.
  const today = new Date().toISOString().slice(0, 10);
  const load = useCallback(() => {
    setListStatus('loading');
    api('/api/admin/coupons').then((d) => { setCoupons(d.coupons || []); setListStatus('ready'); }).catch(() => setListStatus('error'));
  }, []);
  useEffect(() => { load(); }, [load]);
  const create = async () => {
    setMsg('');
    // Validate before hitting the API so bad coupon values show inline instead of a silent
    // or opaque server error.
    const codeErr = zodError(couponCodeSchema, form.code);
    const valueErr = form.discount_type === 'PERCENT'
      ? zodError(couponPercentSchema, form.discount_value)
      : (form.discount_value > 0 ? null : 'Enter a dollar amount above 0');
    setErrs({ code: codeErr, value: valueErr });
    if (codeErr || valueErr) { setState('error'); return; }
    setState('loading');
    try {
      await api('/api/admin/coupons', { method: 'POST', body: JSON.stringify(form) });
      setMsg('Coupon created.'); setState('success'); setForm({ ...form, code: '' }); load();
    } catch (e: any) { setMsg(e.message || 'Could not create coupon.'); setState('error'); }
  };

  const columns: Column<any>[] = [
    { key: 'code', header: 'Code', align: 'left', render: (c) => <span className="font-semibold text-[var(--text-primary)]">{c.code}</span> },
    { key: 'discount', header: 'Discount', align: 'right', render: (c) => <span className="slayer-num text-[var(--positive-ink)]">{c.discount_type === 'PERCENT' ? `${c.discount_value}%` : `$${c.discount_value}`}</span> },
    { key: 'limit', header: 'Limit', align: 'right', render: (c) => <span className="slayer-num text-[var(--text-secondary)]">{c.redemptions}/{c.redemption_limit || '∞'}</span> },
    { key: 'restriction', header: 'Restriction', align: 'left', render: (c) => <span className="text-[var(--text-muted)]">{c.user_restriction || 'any'}</span> },
    { key: 'expires', header: 'Expires', align: 'left', render: (c) => <span className="text-[var(--text-muted)]">{c.expires_at || 'never'}</span> },
  ];

  const emptyNode = listStatus === 'loading' ? (
    <span className="uppercase tracking-[0.14em] text-[var(--text-muted)]">Loading coupons…</span>
  ) : listStatus === 'error' ? (
    <span className="inline-flex flex-col items-center gap-2 text-[var(--negative-ink)]">
      <span className="uppercase tracking-[0.14em]">Could not load coupons.</span>
      <button onClick={load} className={GHOST_BTN}>Retry</button>
    </span>
  ) : (
    <span className="leading-relaxed text-[var(--text-muted)]">No coupons created yet. Mint one above and it will appear here with its redemption status.</span>
  );

  return (
    <TerminalPanel
      className="animate-fadeIn"
      title="Coupon Desk"
      subtitle={listStatus === 'ready' ? <span className="slayer-num">{coupons.length} code{coupons.length === 1 ? '' : 's'} on the ledger</span> : 'Discount codes and redemptions'}
      actions={<button onClick={load} aria-label="Refresh coupons" className={ICON_BTN}><RefreshCw className={cx('h-4 w-4', listStatus === 'loading' && 'animate-spin')} /></button>}
      padded={false}
    >
      {/* Mint dock — the creation form sits as a bordered strip above the ledger. */}
      <div className="space-y-3 border-b border-[var(--border-subtle)] p-4">
        <div className="slayer-title-section">Mint New Code</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <div>
            <input aria-label="Coupon code" aria-invalid={!!errs.code} placeholder="CODE (A-Z 0-9)" value={form.code} onChange={(e) => { setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') }); if (errs.code) setErrs({ ...errs, code: null }); }}
              className={cx(FIELD, 'uppercase', errs.code && 'border-[color:rgba(152,4,4,0.6)]')} />
            <FieldError>{errs.code}</FieldError>
          </div>
          <select aria-label="Discount type" value={form.discount_type} onChange={(e) => setForm({ ...form, discount_type: e.target.value })}
            className={cx(FIELD, 'cursor-pointer')}>
            <option value="PERCENT">Percent %</option><option value="FIXED">Fixed $</option>
          </select>
          <div>
            <input aria-label="Discount value" aria-invalid={!!errs.value} type="number" placeholder="Value" value={form.discount_value} onChange={(e) => { setForm({ ...form, discount_value: Number(e.target.value) }); if (errs.value) setErrs({ ...errs, value: null }); }}
              className={cx(FIELD, 'slayer-num', errs.value && 'border-[color:rgba(152,4,4,0.6)]')} />
            <FieldError>{errs.value}</FieldError>
          </div>
          <input aria-label="Redemption limit" type="number" placeholder="Redemption limit" value={form.redemption_limit} onChange={(e) => setForm({ ...form, redemption_limit: Number(e.target.value) })}
            className={cx(FIELD, 'slayer-num')} />
          <input aria-label="User restriction (email, optional)" placeholder="User restriction (email, optional)" value={form.user_restriction} onChange={(e) => setForm({ ...form, user_restriction: e.target.value })}
            className={FIELD} />
          <input aria-label="Expiry date" type="date" min={today} value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
            className={cx(FIELD, 'slayer-num')} />
        </div>
        <div className="flex items-center gap-3">
          <button onClick={create} disabled={state === 'loading'} className={ACCENT_BTN}>
            {state === 'loading' ? 'Generating…' : 'Generate'}
          </button>
          {msg && <span role="status" className={cx('text-[10px]', state === 'error' ? 'text-[var(--negative-ink)]' : state === 'success' ? 'text-[var(--positive-ink)]' : 'text-[var(--text-secondary)]')}>{msg}</span>}
        </div>
      </div>

      {/* Ledger — every minted code with its redemption state. */}
      <div className="p-3">
        <DataTable<any>
          columns={columns}
          rows={coupons}
          rowKey={(c) => c.code}
          emptyState={<div className="text-[10px]">{emptyNode}</div>}
        />
      </div>
    </TerminalPanel>
  );
}

export default AdminOverseerPanel;
