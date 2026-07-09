import React, { useState, useEffect, useCallback } from 'react';
import { formatDateTime } from '../lib/timeUtils';
import { cx } from '../lib/cx';
import { ConfirmDialog } from './ConfirmDialog';
import { FieldError, zodError, type SubmitState } from './ui/Field';
import { SearchInput } from './ui/SearchInput';
import { DataStateBadge, type DataState } from './ui/DataStateBadge';
import { ConversionCard } from './admin/ConversionCard';
import { TerminalPanel } from './ui/terminal/TerminalPanel';
import { MetricStrip, type Metric } from './ui/terminal/MetricStrip';
import { DataTable, type Column } from './ui/terminal/DataTable';
import { StatusBadge } from './ui/terminal/StatusBadge';
import { couponCodeSchema, couponPercentSchema } from '../lib/formSchemas';
import {
  ShieldAlert, Users, Activity, Key, Radio,
  Ticket, Power, ToggleLeft, ToggleRight, Ban, UserX, LogOut, Eye, RefreshCw, ScrollText
} from 'lucide-react';

/**
 * Map the server's provider identifier to a data-state + human label for the Feed Health card.
 * Any live provider reads green; the synthetic sandbox reads as Model Mode.
 */
const FEED_META: Record<string, { state: DataState; label: string }> = {
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

export function AdminOverseerPanel({ session, onSimulateTier }: AdminPanelProps) {
  const [tab, setTab] = useState<string>('overview');
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
        <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-[var(--negative-ink)]" />
        <h2 className="slayer-title text-[15px]">Unauthorized Access</h2>
        <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)]">You don't have permission to view this page.</p>
      </div>
    );
  }

  const SECTIONS = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'users', label: 'User Management', icon: Users },
    { id: 'subscriptions', label: 'Coupons', icon: Ticket },
    { id: 'audit', label: 'Audit Trail', icon: ScrollText },
  ];

  const adminRole = overview?.admin_role || session?.admin_role || (session?.is_super_admin ? 'super_admin' : '—');

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 p-4 font-mono md:h-[calc(100vh-80px)] md:flex-row">
      {/* Sidebar */}
      <aside className="slayer-scrollbar flex w-full shrink-0 flex-col gap-4 md:w-56 md:overflow-y-auto md:border-r md:border-[var(--border-subtle)] md:pr-4">
        <div className="border-b border-[var(--border-subtle)] pb-4">
          <div className="mb-3 flex items-center gap-2">
            <Key className="h-4 w-4 text-[var(--negative-ink)]" />
            <span className="slayer-title">Overseer</span>
          </div>
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
            <span>Role</span>
            <span className="font-semibold text-[var(--warning)]">{adminRole}</span>
          </div>
        </div>

        <nav className="slayer-scrollbar flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
          {SECTIONS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={cx(
                  'flex items-center gap-2.5 whitespace-nowrap rounded-[var(--radius-control)] px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)]',
                  active
                    ? 'border border-[var(--border-mid)] bg-[rgba(248,248,255,0.05)] text-[var(--text-primary)]'
                    : 'border border-transparent text-[var(--text-muted)] hover:bg-[rgba(248,248,255,0.03)] hover:text-[var(--text-primary)]',
                )}>
                <Icon className="h-4 w-4 shrink-0" /> {t.label}
              </button>
            );
          })}
        </nav>

        <div className="md:mt-auto md:border-t md:border-[var(--border-subtle)] md:pt-4">
          <div className="slayer-panel flex items-center gap-2.5 px-3 py-2.5">
            <Radio className="h-3.5 w-3.5 shrink-0 text-[var(--positive-ink)]" />
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Live Connections</div>
              <div className="slayer-num text-sm font-semibold leading-tight text-[var(--text-primary)]">{live}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="slayer-scrollbar min-w-0 flex-1 pb-10 md:overflow-y-auto">
        {tab === 'overview' && <OverviewTab overview={overview} reload={loadOverview} onSimulateTier={onSimulateTier} />}
        {tab === 'users' && <UsersTab />}
        {tab === 'subscriptions' && <CouponsTab />}
        {tab === 'audit' && <AuditTab />}
      </div>
    </div>
  );
}

function OverviewTab({ overview, reload, onSimulateTier }: { overview: any; reload: () => void; onSimulateTier: (s: string, n: number) => void }) {
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<any[]>([]);
  const [recentLoaded, setRecentLoaded] = useState(false);
  // Recent-activity preview: the five newest audit entries, refreshed whenever the overview
  // reloads so operational actions surface here without leaving the Overview tab.
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
  const feed = FEED_META[overview?.data_source] || { state: 'required' as DataState, label: overview?.data_source || 'Unknown' };
  const serverTime = typeof overview?.server_time === 'number' ? overview.server_time : null;

  const metrics: Metric[] = [
    { label: 'Total Users', value: overview?.total_users ?? '—' },
    { label: 'Live Now', value: overview?.live_connections ?? '—', tone: overview?.live_connections ? 'positive' : 'neutral' },
    { label: 'Suspended', value: overview?.suspended ?? '—', tone: overview?.suspended ? 'warning' : 'neutral' },
    { label: 'Banned', value: overview?.banned ?? '—', tone: overview?.banned ? 'negative' : 'neutral' },
    { label: 'Audit Entries', value: overview?.audit_entries ?? '—' },
    { label: 'Coupons', value: overview?.coupons ?? '—' },
  ];

  return (
    <div className="animate-fadeIn space-y-3">
      <MetricStrip metrics={metrics} columns={6} />

      {/* Visitors vs buyers — the focal instrument of the Overview. */}
      <ConversionCard overview={overview} />

      {/* Feed health — the market-data provider currently backing every terminal read. */}
      <TerminalPanel title="Feed Health" subtitle="Market-data provider backing every terminal read">
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 md:grid-cols-3">
          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Provider</div>
            <div className="flex items-center gap-2">
              <span className={cx('h-2 w-2 rounded-full', feed.state === 'live' ? 'animate-pulse bg-[var(--positive-ink)]' : 'bg-[var(--info)]')}></span>
              <span className="text-[12px] font-semibold text-[var(--text-primary)]">{feed.label}</span>
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Mode</div>
            <DataStateBadge state={feed.state} />
          </div>
          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Server Time</div>
            <div className="slayer-num text-[13px] font-semibold text-[var(--text-secondary)]">{serverTime ? formatDateTime(new Date(serverTime).toISOString()) : '—'}</div>
          </div>
        </div>
      </TerminalPanel>

      {/* System controls — maintenance kill-switch and QA impersonation sit together. */}
      <div className="grid gap-3 md:grid-cols-2">
        {/* Maintenance */}
        <TerminalPanel title="Maintenance Mode" subtitle="Returns 503 to all non-admin traffic while active">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Power className={cx('h-4 w-4', overview?.maintenance_mode ? 'text-[var(--negative-ink)]' : 'text-[var(--text-muted)]')} />
              <span className="text-[12px] font-semibold text-[var(--text-primary)]">{overview?.maintenance_mode ? 'Active' : 'Inactive'}</span>
              {overview?.maintenance_mode && <StatusBadge tone="negative">503 Active</StatusBadge>}
            </div>
            <button onClick={toggleMaintenance} disabled={busy} className="cursor-pointer rounded-[var(--radius-control)] transition-opacity focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] disabled:opacity-50" aria-label="Toggle maintenance mode">
              {overview?.maintenance_mode ? <ToggleRight className="h-9 w-9 text-[var(--negative-ink)]" /> : <ToggleLeft className="h-9 w-9 text-[var(--text-muted)]" />}
            </button>
          </div>
        </TerminalPanel>

        {/* QA viewport simulation */}
        <TerminalPanel title="QA Viewport Simulation" subtitle="Preview the app as another access tier">
          <div className="flex flex-wrap gap-2">
            {([['Guest', 0], ['SkyVision', 2], ['Pinpoint', 3], ['Quant', 4], ['Lifetime', 5]] as const).map(([label, n]) => (
              <button key={label} onClick={() => onSimulateTier(label, n)}
                className="slayer-control cursor-pointer text-[10px] font-semibold uppercase tracking-[0.14em] hover:text-[var(--text-primary)] focus:outline-none focus-visible:border-[var(--border-strong)]">
                {label}
              </button>
            ))}
          </div>
        </TerminalPanel>
      </div>

      {/* Recent activity + feature toggles — the two operational logs read side by side. */}
      <div className="grid gap-3 md:grid-cols-2">
        {/* Recent activity — the five newest audit-trail entries, previewed on Overview. */}
        <TerminalPanel title="Recent Activity" subtitle="Five newest audit-trail entries">
          {!recentLoaded ? (
            <div className="py-1 text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">Loading…</div>
          ) : recent.length === 0 ? (
            <div className="py-1 text-[11px] leading-relaxed text-[var(--text-muted)]">No admin actions recorded yet. Role changes, feature toggles, coupon creation and maintenance actions appear here as they happen.</div>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {recent.map((e) => (
                <div key={e.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                  <span className="w-40 shrink-0 truncate text-[10px] font-semibold uppercase tracking-wide text-[var(--warning)]" title={e.action_taken}>{e.action_taken}</span>
                  <span className="min-w-0 flex-1 truncate text-[10px] text-[var(--positive-ink)]" title={e.admin_email}>{e.admin_email}</span>
                  {e.target_id && <span className="hidden max-w-[30%] truncate text-[10px] text-[var(--text-muted)] sm:inline" title={e.target_id}>{e.target_id}</span>}
                  <span className="slayer-num shrink-0 whitespace-nowrap text-[10px] text-[var(--text-muted)]">{formatDateTime(e.timestamp)}</span>
                </div>
              ))}
            </div>
          )}
        </TerminalPanel>

        {/* Feature flags */}
        <TerminalPanel title="Feature Toggles">
          {Object.keys(flags).length === 0 ? (
            <div className="py-1 text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">No feature toggles available</div>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {Object.keys(flags).map((k) => (
                <button key={k} onClick={() => toggleFlag(k, !flags[k])}
                  aria-pressed={!!flags[k]} aria-label={`Toggle ${k.replace(/_/g, ' ')}`}
                  className="group flex w-full items-center justify-between gap-3 rounded-[var(--radius-control)] py-2.5 text-left first:pt-0 last:pb-0 focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)]">
                  <span className="text-[11px] capitalize text-[var(--text-secondary)] transition-colors group-hover:text-[var(--text-primary)]">{k.replace(/_/g, ' ')}</span>
                  {flags[k] ? <ToggleRight className="h-6 w-6 shrink-0 text-[var(--positive-ink)]" /> : <ToggleLeft className="h-6 w-6 shrink-0 text-[var(--text-muted)]" />}
                </button>
              ))}
            </div>
          )}
        </TerminalPanel>
      </div>
    </div>
  );
}

function UsersTab() {
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
        <button aria-label={`${u.banned ? 'Unban' : 'Ban'} ${u.email}`} onClick={() => act(u.email, u.banned ? 'unban' : 'ban')} className="cursor-pointer rounded-[var(--radius-control)] p-1.5 text-[var(--negative-ink)] transition-colors hover:bg-[var(--negative-soft)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)]"><Ban className="h-3.5 w-3.5" /></button>
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
    <div className="animate-fadeIn space-y-3">
      <ConfirmDialog
        open={!!confirmDialog}
        title={confirmDialog?.title ?? ''}
        message={confirmDialog?.message ?? ''}
        confirmLabel={confirmDialog?.confirmLabel}
        danger={confirmDialog?.danger}
        onConfirm={() => { confirmDialog?.onConfirm(); setConfirmDialog(null); }}
        onCancel={() => setConfirmDialog(null)}
      />
      <div className="flex items-center gap-2">
        <SearchInput
          id="admin-user-search"
          ariaLabel="Search users"
          value={q}
          onChange={(v) => { setCursors({ current: null, history: [] }); setQ(v); }}
          onClear={() => { setCursors({ current: null, history: [] }); setQ(''); }}
          placeholder="Search by email, username, name…"
          className="flex-1"
        />
        <button onClick={() => load(cursors.current)} aria-label="Refresh users" className={ICON_BTN}><RefreshCw className={cx('h-4 w-4', loading && 'animate-spin')} /></button>
      </div>

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

      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
        <span className="slayer-num">{data.total} users</span>
        <div className="flex gap-2">
          <button disabled={cursors.history.length === 0} onClick={() => setCursors(prev => { const h = [...prev.history]; const c = h.pop() || null; return { history: h, current: c }; })} className={PAGER_BTN}>Prev</button>
          <button disabled={!data.nextCursor} onClick={() => setCursors(prev => ({ history: [...prev.history, prev.current], current: data.nextCursor }))} className={PAGER_BTN}>Next</button>
        </div>
      </div>
    </div>
  );
}

function AuditTab() {
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
    <div className="animate-fadeIn space-y-3">
      <div className="flex items-center gap-2">
        <SearchInput
          id="admin-audit-search"
          ariaLabel="Filter audit trail"
          value={q}
          onChange={setQ}
          onClear={() => setQ('')}
          placeholder="Filter by admin, action, target, IP…"
          className="flex-1"
        />
        <button onClick={load} aria-label="Refresh audit trail" className={ICON_BTN}><RefreshCw className={cx('h-4 w-4', status === 'loading' && 'animate-spin')} /></button>
      </div>

      <DataTable<any>
        columns={columns}
        rows={filtered}
        rowKey={(e) => e.id}
        emptyState={<div className="text-[10px]">{emptyNode}</div>}
      />

      {status === 'ready' && entries.length > 0 && (
        <div className="slayer-num text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">{filtered.length} of {entries.length} entries</div>
      )}
    </div>
  );
}

function CouponsTab() {
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
    <span className="leading-relaxed text-[var(--text-muted)]">No coupons created yet. Generate one above and it will appear here with its redemption status.</span>
  );

  return (
    <div className="animate-fadeIn space-y-4">
      <TerminalPanel title="Generate Coupon" contentClassName="p-[var(--panel-pad)] space-y-4">
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
          <button onClick={create} disabled={state === 'loading'} className="cursor-pointer rounded-[var(--radius-control)] border border-[color:rgba(13,71,21,0.5)] bg-[var(--positive-soft)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--positive-ink)] transition-colors hover:border-[color:rgba(13,71,21,0.75)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] disabled:opacity-50">
            {state === 'loading' ? 'Generating…' : 'Generate'}
          </button>
          {msg && <span role="status" className={cx('text-[10px]', state === 'error' ? 'text-[var(--negative-ink)]' : state === 'success' ? 'text-[var(--positive-ink)]' : 'text-[var(--text-secondary)]')}>{msg}</span>}
        </div>
      </TerminalPanel>

      <div className="flex items-center justify-between">
        <span className="slayer-num text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">{listStatus === 'ready' ? `${coupons.length} coupon${coupons.length === 1 ? '' : 's'}` : ''}</span>
        <button onClick={load} aria-label="Refresh coupons" className={ICON_BTN}><RefreshCw className={cx('h-4 w-4', listStatus === 'loading' && 'animate-spin')} /></button>
      </div>

      <DataTable<any>
        columns={columns}
        rows={coupons}
        rowKey={(c) => c.code}
        emptyState={<div className="text-[10px]">{emptyNode}</div>}
      />
    </div>
  );
}

export default AdminOverseerPanel;
