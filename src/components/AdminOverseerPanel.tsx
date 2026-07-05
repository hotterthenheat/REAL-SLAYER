import React, { useState, useEffect, useCallback } from 'react';
import { formatDateTime } from '../lib/timeUtils';
import { ConfirmDialog } from './ConfirmDialog';
import { FieldError, zodError, type SubmitState } from './ui/Field';
import { SearchInput } from './ui/SearchInput';
import { DataStateBadge, type DataState } from './ui/DataStateBadge';
import { ConversionCard } from './admin/ConversionCard';
import { couponCodeSchema, couponPercentSchema } from '../lib/formSchemas';
import {
  ShieldAlert, Users, Activity, Key, MonitorPlay, Radio,
  Ticket, Power, ToggleLeft, ToggleRight, Ban, UserX, LogOut, Eye, Search, RefreshCw, ScrollText, Wifi
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

const CARD = 'bg-[var(--surface)] border border-[var(--border)] rounded-lg';
const FIELD = 'bg-[var(--surface-2)] border border-[var(--border)] rounded-md px-3 py-2 text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-strong)]';
const TH = 'text-left p-3 text-[var(--text-tertiary)] uppercase tracking-widest text-[9px] font-bold';

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
      <div className={`p-8 text-center ${CARD} border-[var(--danger)]/30 max-w-xl mx-auto mt-10`}>
        <ShieldAlert className="w-10 h-10 text-[var(--danger)] mx-auto mb-4" />
        <h2 className="text-lg font-bold text-[var(--text-primary)] uppercase tracking-widest">Unauthorized Access</h2>
        <p className="text-[10px] text-[var(--text-tertiary)] mt-2 uppercase tracking-widest">You don't have permission to view this page.</p>
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
    <div className="w-full max-w-[1400px] mx-auto font-mono p-4 flex flex-col md:flex-row gap-6 h-[calc(100vh-80px)]">
      {/* Sidebar */}
      <div className="w-full md:w-60 shrink-0 flex flex-col border-r border-[var(--border)] pr-4 gap-2 overflow-y-auto">
        <div className="pb-4 mb-1 border-b border-[var(--border)]">
          <h2 className="text-sm font-bold tracking-widest text-[var(--text-primary)] uppercase flex items-center gap-2 mb-3">
            <Key className="w-4 h-4 text-[var(--danger)]" /> Overseer
          </h2>
          <div className="text-[10px] uppercase tracking-widest text-[var(--text-tertiary)] flex items-center justify-between">
            <span>Role</span>
            <span className="text-[var(--warning)] font-bold">{adminRole}</span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          {SECTIONS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest rounded-md flex items-center gap-2.5 transition-colors text-left ${
                  active
                    ? 'bg-[var(--surface-2)] border border-[var(--border)] text-[var(--success)]'
                    : 'border border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)]'
                }`}>
                <Icon className="w-4 h-4 shrink-0" /> {t.label}
              </button>
            );
          })}
        </div>

        <div className="mt-auto pt-4 border-t border-[var(--border)]">
          <div className={`flex items-center gap-2.5 ${CARD} px-3 py-2.5`}>
            <Radio className="w-3.5 h-3.5 text-[var(--success)] shrink-0" />
            <div className="min-w-0">
              <div className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-widest font-bold">Live Connections</div>
              <div className="text-sm font-bold text-[var(--text-primary)] leading-tight">{live}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto pb-10">
        {tab === 'overview' && <OverviewTab overview={overview} reload={loadOverview} onSimulateTier={onSimulateTier} />}
        {tab === 'users' && <UsersTab />}
        {tab === 'subscriptions' && <CouponsTab />}
        {tab === 'audit' && <AuditTab />}
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, iconColor = 'text-[var(--text-tertiary)]' }: { icon: any; title: string; iconColor?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className={`w-4 h-4 ${iconColor}`} />
      <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-primary)]">{title}</span>
    </div>
  );
}

function StatCard({ label, value, color = 'text-[var(--text-primary)]' }: { label: string; value: any; color?: string }) {
  return (
    <div className={`${CARD} p-3.5`}>
      <div className="text-[9px] text-[var(--text-tertiary)] uppercase font-bold tracking-widest">{label}</div>
      <div className={`text-2xl font-bold mt-1 tabular-nums ${color}`}>{value}</div>
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
  return (
    <div className="space-y-5 animate-fadeIn">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total Users" value={overview?.total_users ?? '—'} />
        <StatCard label="Live Connections" value={overview?.live_connections ?? '—'} color="text-[var(--success)]" />
        <StatCard label="Suspended" value={overview?.suspended ?? '—'} color="text-[var(--warning)]" />
        <StatCard label="Banned" value={overview?.banned ?? '—'} color="text-[var(--danger)]" />
        <StatCard label="Audit Entries" value={overview?.audit_entries ?? '—'} />
        <StatCard label="Coupons" value={overview?.coupons ?? '—'} />
      </div>

      {/* Feed health — the market-data provider currently backing every terminal read. */}
      <div className={`${CARD} p-5`}>
        <SectionHeader icon={Wifi} title="Feed Health" iconColor={feed.state === 'live' ? 'text-[var(--success)]' : 'text-[var(--info)]'} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-[9px] text-[var(--text-tertiary)] uppercase font-bold tracking-widest mb-1.5">Provider</div>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${feed.state === 'live' ? 'bg-[var(--success)] animate-pulse' : 'bg-[var(--info)]'}`}></span>
              <span className="text-[12px] font-bold text-[var(--text-primary)]">{feed.label}</span>
            </div>
          </div>
          <div>
            <div className="text-[9px] text-[var(--text-tertiary)] uppercase font-bold tracking-widest mb-1.5">Mode</div>
            <DataStateBadge state={feed.state} />
          </div>
          <div>
            <div className="text-[9px] text-[var(--text-tertiary)] uppercase font-bold tracking-widest mb-1.5">Live Connections</div>
            <div className="text-[13px] font-bold text-[var(--success)] tabular-nums">{overview?.live_connections ?? '—'}</div>
          </div>
          <div>
            <div className="text-[9px] text-[var(--text-tertiary)] uppercase font-bold tracking-widest mb-1.5">Server Time</div>
            <div className="text-[13px] font-bold text-[var(--text-secondary)] tabular-nums">{serverTime ? formatDateTime(new Date(serverTime).toISOString()) : '—'}</div>
          </div>
        </div>
      </div>

      {/* Visitors vs buyers — real conversion snapshot from access-tier counts. */}
      <ConversionCard overview={overview} />

      {/* Recent activity — the five newest audit-trail entries, previewed on Overview. */}
      <div className={`${CARD} p-5`}>
        <SectionHeader icon={ScrollText} title="Recent Activity" />
        {!recentLoaded ? (
          <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest py-2">Loading…</div>
        ) : recent.length === 0 ? (
          <div className="text-[10px] text-[var(--text-tertiary)] leading-relaxed py-2">No admin actions recorded yet. Role changes, feature toggles, coupon creation and maintenance actions appear here as they happen.</div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {recent.map((e) => (
              <div key={e.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                <span className="text-[10px] text-[var(--warning)] font-bold uppercase tracking-wide shrink-0 w-40 truncate" title={e.action_taken}>{e.action_taken}</span>
                <span className="text-[10px] text-[var(--success)] truncate min-w-0 flex-1" title={e.admin_email}>{e.admin_email}</span>
                {e.target_id && <span className="text-[10px] text-[var(--text-tertiary)] truncate max-w-[30%] hidden sm:inline" title={e.target_id}>{e.target_id}</span>}
                <span className="text-[9px] text-[var(--text-tertiary)] tabular-nums whitespace-nowrap shrink-0">{formatDateTime(e.timestamp)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Maintenance */}
      <div className={`${CARD} p-5`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Power className={`w-4 h-4 ${overview?.maintenance_mode ? 'text-[var(--danger)]' : 'text-[var(--text-tertiary)]'}`} />
            <span className="text-[13px] font-bold text-[var(--text-primary)]">Maintenance Mode</span>
            {overview?.maintenance_mode && <span className="text-[9px] bg-[var(--danger)]/15 text-[var(--danger)] border border-[var(--danger)]/30 px-2 py-0.5 rounded uppercase font-bold tracking-widest">503 Active</span>}
          </div>
          <button onClick={toggleMaintenance} disabled={busy} className="disabled:opacity-50" aria-label="Toggle maintenance mode">
            {overview?.maintenance_mode ? <ToggleRight className="w-9 h-9 text-[var(--danger)]" /> : <ToggleLeft className="w-9 h-9 text-[var(--text-tertiary)]" />}
          </button>
        </div>
        <p className="text-[10px] text-[var(--text-tertiary)] mt-2 uppercase tracking-widest">Returns 503 to all non-admin traffic while active.</p>
      </div>

      {/* Feature flags */}
      <div className={`${CARD} p-5`}>
        <SectionHeader icon={ToggleRight} title="Feature Toggles" />
        {Object.keys(flags).length === 0 ? (
          <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest py-2">No feature toggles available</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.keys(flags).map((k) => (
              <button key={k} onClick={() => toggleFlag(k, !flags[k])}
                className="flex items-center justify-between bg-[var(--surface-2)] border border-[var(--border)] rounded-md px-3 py-2 hover:border-[var(--border-strong)] transition-colors">
                <span className="text-[11px] text-[var(--text-secondary)] capitalize">{k.replace(/_/g, ' ')}</span>
                {flags[k] ? <ToggleRight className="w-6 h-6 text-[var(--success)]" /> : <ToggleLeft className="w-6 h-6 text-[var(--text-tertiary)]" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* QA viewport simulation */}
      <div className={`${CARD} p-5`}>
        <SectionHeader icon={MonitorPlay} title="QA Viewport Simulation" iconColor="text-[var(--text-tertiary)]" />
        <div className="flex flex-wrap gap-2">
          {[['Guest', 0], ['SkyVision', 2], ['Pinpoint', 3], ['Quant', 4], ['Lifetime', 5]].map(([label, n]) => (
            <button key={label as string} onClick={() => onSimulateTier(label as string, n as number)}
              className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-[var(--surface-2)] border border-[var(--border)] rounded text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] transition-colors">
              {label}
            </button>
          ))}
        </div>
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

  return (
    <div className="space-y-3 animate-fadeIn">
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
        <button onClick={() => load(cursors.current)} aria-label="Refresh users" className="p-2.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>

      {actionError && (
        <div role="alert" className="flex items-center justify-between gap-3 bg-[var(--danger)]/10 border border-[var(--danger)]/30 rounded-md px-3 py-2 text-[10px] text-[var(--danger)] uppercase tracking-widest font-bold">
          <span className="min-w-0 break-words">{actionError}</span>
          <button onClick={() => setActionError('')} aria-label="Dismiss error" className="shrink-0 hover:text-[var(--text-primary)] transition-colors">Dismiss</button>
        </div>
      )}

      <div className={`${CARD} overflow-x-auto`}>
        <table className="w-full text-[10.5px]">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className={TH}>User</th><th className={TH}>Tier</th>
              <th className={TH}>Tokens</th><th className={TH}>Status</th><th className={`${TH} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((u: any) => (
              <tr key={u.id} className="border-b border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors">
                <td className="p-3">
                  <div className="text-[var(--text-primary)] font-bold">{u.name || u.username}</div>
                  <div className="text-[var(--text-tertiary)]">{u.email}</div>
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-1">
                    <select aria-label={`Access tier for ${u.email}`} value={u.access_tier} onChange={(e) => changeTier(u.email, e.target.value)} className="bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-secondary)] uppercase px-2 py-1 rounded outline-none focus:border-[var(--border-strong)]">
                      {['guest', 'discord', 'intraday', 'quant', 'enterprise', 'lifetime'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    {u.role !== 'user' && <span className="text-[8px] font-black uppercase tracking-widest text-[var(--warning)] bg-[var(--warning)]/15 border border-[var(--warning)]/30 rounded px-1 py-0.5 leading-none" title={`Role: ${u.role}`}>{u.role}</span>}
                  </div>
                </td>
                <td className="p-3 text-[var(--success)] tabular-nums">{u.referral_tokens_pool}</td>
                <td className="p-3">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${u.online ? 'bg-[var(--success)]' : 'bg-[var(--text-tertiary)]'}`}></span>
                    <span className={`font-bold ${u.online ? 'text-[var(--success)]' : 'text-[var(--text-tertiary)]'}`}>{u.online ? 'ONLINE' : 'OFFLINE'}</span>
                  </div>
                  {u.banned ? <span className="text-[var(--danger)] font-bold block mt-1 text-[9px]">BANNED</span> : u.suspended ? <span className="text-[var(--warning)] font-bold block mt-1 text-[9px]">SUSPENDED</span> : null}
                </td>
                <td className="p-3">
                  <div className="flex items-center justify-end gap-1">
                    <button aria-label={`Impersonate ${u.email}`} onClick={() => impersonate(u.email)} className="p-1.5 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)] transition-colors"><Eye className="w-3.5 h-3.5" /></button>
                    <button aria-label={`${u.suspended ? 'Unsuspend' : 'Suspend'} ${u.email}`} onClick={() => act(u.email, u.suspended ? 'unsuspend' : 'suspend')} className="p-1.5 rounded text-[var(--warning)] hover:bg-[var(--warning)]/15 transition-colors"><UserX className="w-3.5 h-3.5" /></button>
                    <button aria-label={`Force logout ${u.email}`} onClick={() => act(u.email, 'force-logout')} className="p-1.5 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)] transition-colors"><LogOut className="w-3.5 h-3.5" /></button>
                    <button aria-label={`${u.banned ? 'Unban' : 'Ban'} ${u.email}`} onClick={() => act(u.email, u.banned ? 'unban' : 'ban')} className="p-1.5 rounded text-[var(--danger)] hover:bg-[var(--danger)]/15 transition-colors"><Ban className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {data.rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-[10px] uppercase tracking-widest">
                  {error ? (
                    <div role="alert" className="flex flex-col items-center gap-3 text-[var(--danger)]">
                      <span>{error}</span>
                      <button onClick={() => load(cursors.current)} className="px-3 py-1.5 bg-[var(--surface-2)] border border-[var(--border)] rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] tracking-widest font-bold transition-colors">Retry</button>
                    </div>
                  ) : loading ? (
                    <span className="text-[var(--text-tertiary)]">Loading…</span>
                  ) : q.trim() ? (
                    <span className="text-[var(--text-tertiary)]">No users match your search</span>
                  ) : (
                    <span className="text-[var(--text-tertiary)]">No users</span>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest">
        <span className="tabular-nums">{data.total} users</span>
        <div className="flex gap-2">
          <button disabled={cursors.history.length === 0} onClick={() => setCursors(prev => { const h = [...prev.history]; const c = h.pop() || null; return { history: h, current: c }; })} className="px-3 py-1.5 bg-[var(--surface-2)] border border-[var(--border)] rounded uppercase tracking-widest font-bold hover:border-[var(--border-strong)] disabled:opacity-40 disabled:hover:border-[var(--border)] transition-colors">Prev</button>
          <button disabled={!data.nextCursor} onClick={() => setCursors(prev => ({ history: [...prev.history, prev.current], current: data.nextCursor }))} className="px-3 py-1.5 bg-[var(--surface-2)] border border-[var(--border)] rounded uppercase tracking-widest font-bold hover:border-[var(--border-strong)] disabled:opacity-40 disabled:hover:border-[var(--border)] transition-colors">Next</button>
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
  return (
    <div className="space-y-3 animate-fadeIn">
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
        <button onClick={load} aria-label="Refresh audit trail" className="p-2.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors"><RefreshCw className={`w-4 h-4 ${status === 'loading' ? 'animate-spin' : ''}`} /></button>
      </div>
      <div className={`${CARD} overflow-x-auto`}>
        <table className="w-full text-[10.5px]">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className={TH}>Timestamp</th><th className={TH}>Admin</th>
              <th className={TH}>Action</th><th className={TH}>Target</th>
              <th className={TH}>Method</th><th className={TH}>IP</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id} className="border-b border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors">
                <td className="p-3 text-[var(--text-tertiary)] whitespace-nowrap">{formatDateTime(e.timestamp)}</td>
                <td className="p-3 text-[var(--success)]">{e.admin_email}</td>
                <td className="p-3 text-[var(--warning)] font-bold">{e.action_taken}</td>
                <td className="p-3 text-[var(--text-secondary)]">{e.target_id}</td>
                <td className="p-3 text-[var(--text-tertiary)]">{e.method}</td>
                <td className="p-3 text-[var(--text-tertiary)] tabular-nums">{e.ip_address}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="p-8 text-center text-[10px] leading-relaxed">
                {status === 'loading' ? (
                  <span className="text-[var(--text-tertiary)] uppercase tracking-widest">Loading audit trail…</span>
                ) : status === 'error' ? (
                  <span className="inline-flex flex-col items-center gap-2 text-[var(--danger)]">
                    <span className="uppercase tracking-widest font-bold">Could not load the audit trail.</span>
                    <button onClick={load} className="px-3 py-1.5 bg-[var(--surface-2)] border border-[var(--border)] rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] tracking-widest font-bold transition-colors">Retry</button>
                  </span>
                ) : q.trim() ? (
                  <span className="text-[var(--text-tertiary)]">No audit entries match “{q.trim()}”.</span>
                ) : (
                  <span className="text-[var(--text-tertiary)]">No admin actions recorded yet. Role changes, feature toggles, coupon creation and maintenance actions appear here automatically.</span>
                )}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      {status === 'ready' && entries.length > 0 && (
        <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest tabular-nums">{filtered.length} of {entries.length} entries</div>
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
  return (
    <div className="space-y-4 animate-fadeIn">
      <div className={`${CARD} p-5 space-y-4`}>
        <SectionHeader icon={Ticket} title="Generate Coupon" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <input aria-label="Coupon code" aria-invalid={!!errs.code} placeholder="CODE (A-Z 0-9)" value={form.code} onChange={(e) => { setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') }); if (errs.code) setErrs({ ...errs, code: null }); }}
              className={`${FIELD} uppercase ${errs.code ? 'border-[var(--danger)]/60' : ''}`} />
            <FieldError>{errs.code}</FieldError>
          </div>
          <select aria-label="Discount type" value={form.discount_type} onChange={(e) => setForm({ ...form, discount_type: e.target.value })}
            className={FIELD}>
            <option value="PERCENT">Percent %</option><option value="FIXED">Fixed $</option>
          </select>
          <div>
            <input aria-label="Discount value" aria-invalid={!!errs.value} type="number" placeholder="Value" value={form.discount_value} onChange={(e) => { setForm({ ...form, discount_value: Number(e.target.value) }); if (errs.value) setErrs({ ...errs, value: null }); }}
              className={`${FIELD} ${errs.value ? 'border-[var(--danger)]/60' : ''}`} />
            <FieldError>{errs.value}</FieldError>
          </div>
          <input aria-label="Redemption limit" type="number" placeholder="Redemption limit" value={form.redemption_limit} onChange={(e) => setForm({ ...form, redemption_limit: Number(e.target.value) })}
            className={FIELD} />
          <input aria-label="User restriction (email, optional)" placeholder="User restriction (email, optional)" value={form.user_restriction} onChange={(e) => setForm({ ...form, user_restriction: e.target.value })}
            className={FIELD} />
          <input aria-label="Expiry date" type="date" min={today} value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
            className={FIELD} />
        </div>
        <div className="flex items-center gap-3">
          <button onClick={create} disabled={state === 'loading'} className="px-4 py-2 bg-[var(--success)]/10 border border-[var(--success)]/30 text-[var(--success)] rounded-md text-[11px] font-bold uppercase tracking-widest hover:bg-[var(--success)]/20 disabled:opacity-50 transition-colors">
            {state === 'loading' ? 'Generating…' : 'Generate'}
          </button>
          {msg && <span role="status" className={`text-[10px] ${state === 'error' ? 'text-[var(--danger)]' : state === 'success' ? 'text-[var(--success)]' : 'text-[var(--text-secondary)]'}`}>{msg}</span>}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest tabular-nums">{listStatus === 'ready' ? `${coupons.length} coupon${coupons.length === 1 ? '' : 's'}` : ''}</span>
        <button onClick={load} aria-label="Refresh coupons" className="p-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors"><RefreshCw className={`w-4 h-4 ${listStatus === 'loading' ? 'animate-spin' : ''}`} /></button>
      </div>

      <div className={`${CARD} overflow-x-auto`}>
        <table className="w-full text-[10.5px]">
          <thead><tr className="border-b border-[var(--border)]">
            <th className={TH}>Code</th><th className={TH}>Discount</th><th className={TH}>Limit</th><th className={TH}>Restriction</th><th className={TH}>Expires</th>
          </tr></thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={c.code} className="border-b border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors">
                <td className="p-3 text-[var(--text-primary)] font-bold">{c.code}</td>
                <td className="p-3 text-[var(--success)]">{c.discount_type === 'PERCENT' ? `${c.discount_value}%` : `$${c.discount_value}`}</td>
                <td className="p-3 text-[var(--text-secondary)] tabular-nums">{c.redemptions}/{c.redemption_limit || '∞'}</td>
                <td className="p-3 text-[var(--text-tertiary)]">{c.user_restriction || 'any'}</td>
                <td className="p-3 text-[var(--text-tertiary)]">{c.expires_at || 'never'}</td>
              </tr>
            ))}
            {coupons.length === 0 && (
              <tr><td colSpan={5} className="p-8 text-center text-[10px] leading-relaxed">
                {listStatus === 'loading' ? (
                  <span className="text-[var(--text-tertiary)] uppercase tracking-widest">Loading coupons…</span>
                ) : listStatus === 'error' ? (
                  <span className="inline-flex flex-col items-center gap-2 text-[var(--danger)]">
                    <span className="uppercase tracking-widest font-bold">Could not load coupons.</span>
                    <button onClick={load} className="px-3 py-1.5 bg-[var(--surface-2)] border border-[var(--border)] rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] tracking-widest font-bold transition-colors">Retry</button>
                  </span>
                ) : (
                  <span className="text-[var(--text-tertiary)]">No coupons created yet. Generate one above and it will appear here with its redemption status.</span>
                )}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default AdminOverseerPanel;
