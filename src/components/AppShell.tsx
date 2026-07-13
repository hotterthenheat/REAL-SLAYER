import React, { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  LogOut,
  ChevronRight,
  Menu,
  Lock,
  X,
  Search,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { BrandHeader } from './BrandLogo';
import { useContractStore } from '../lib/store';
import { ASSET_LIST } from '../data';
import type { AssetInfo } from '../types';
// Single source of truth for the sidebar nav (labels + descriptions + icons +
// flyout sub-tabs) — shared with SlayerLanding.tsx so the landing sidebar and
// this shell sidebar can never drift apart.
import { NAV_MAIN_VIEWS, NAV_TOOLS, NAV_SETTINGS, NAV_ADMIN, NAV_SUBTABS, SIDEBAR_COLLAPSED_KEY } from '../lib/navItems';
import type { NavItemDef } from '../lib/navItems';

interface AppShellProps {
  children: ReactNode;
  session: any;
  onLogout: () => void;
  tierInfo: any;
  onUpgradeClick: () => void;
  setShowAuthModal: (open: boolean) => void;
  feedStatus?: 'connecting' | 'live' | 'offline' | 'stale';
}

// Dynamic nav context. NavItem is hoisted to module scope (a stable component
// identity) and reads live values from here, so AppShell re-renders re-render the
// nav buttons instead of unmounting + remounting them (which restarted their
// transitions/focus every time the active tab changed).
export interface NavCtxValue {
  activeTab: string;
  setActiveTab: (id: any) => void;
  isSidebarExpanded: boolean;
  closeMobile: () => void;
  session: any;
}
// Exported (with NavItem below) so SlayerLanding renders the EXACT same
// sidebar rows/flyouts — one implementation, zero landing-vs-app drift.
export const NavCtx = React.createContext<NavCtxValue>({
  activeTab: 'home', setActiveTab: () => {}, isSidebarExpanded: false, closeMobile: () => {}, session: null,
});

/** ET (market-timezone) wall-clock string, hh:mm:ss. Shared by the header clock,
 *  the footer LAST UPDATE and the feed-status "last update" stamp. */
function nyTimeString(d: Date = new Date()): string {
  try {
    return d.toLocaleTimeString('en-US', { hour12: false, timeZone: 'America/New_York' });
  } catch {
    return d.toLocaleTimeString('en-US', { hour12: false });
  }
}

// Portal-rendered flyout, fixed-positioned off the hovered nav item (so the sidebar's
// own overflow never clips it). Clamped to stay on-screen for long lists.
function NavFlyout({ anchor, subTabs, pageId, activeSub, onPick, onEnter, onLeave, onEscape }: {
  anchor: DOMRect; subTabs: { id: string; label: string }[]; pageId: string; activeSub: string | null;
  onPick: (subId: string) => void; onEnter: () => void; onLeave: () => void; onEscape: () => void;
}) {
  const estH = subTabs.length * 30 + 16;
  const top = Math.max(8, Math.min(anchor.top, window.innerHeight - estH - 8));
  // Keyboard support inside the portaled menu: focus keeps it open (capture
  // handlers mirror the mouse enter/leave), arrows move between items, Escape
  // hands focus back to the trigger.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.stopPropagation(); onEscape(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next]?.focus();
  };
  return createPortal(
    <div
      role="menu"
      aria-label={`${pageId} sections`}
      data-flyout-for={pageId}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocusCapture={onEnter}
      onBlurCapture={onLeave}
      onKeyDown={handleKeyDown}
      style={{ position: 'fixed', top, left: anchor.right + 8, zIndex: 10050, borderRadius: 'var(--radius-panel)' }}
      className="min-w-[184px] border border-[var(--border-strong)] bg-[var(--surface)] p-1 shadow-[0_16px_44px_-12px_rgba(0,0,0,0.8)]"
    >
      {subTabs.map((s) => {
        const on = activeSub === s.id;
        return (
          <button
            key={s.id}
            role="menuitem"
            onClick={() => onPick(s.id)}
            style={{ borderRadius: 'var(--radius-control)' }}
            className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-color)] ${
              on ? 'bg-[var(--accent-soft)] text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]'
            }`}
          >
            <span className="h-1 w-1 shrink-0 rounded-full" style={{ background: on ? 'var(--accent-color)' : 'var(--border-strong)' }} />
            {s.label}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

// Identity avatar with an initials fallback — a broken/blocked avatar image next to the
// signed-in identity is a trust leak, so we never render a broken <img>. Falls back to
// initials on missing src OR load error.
function IdentityAvatar({ name, avatar }: { name?: string; avatar?: string }) {
  const [failed, setFailed] = React.useState(false);
  const initials = ((name || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('') || '?').toUpperCase();
  if (avatar && !failed) {
    return <img src={avatar} onError={() => setFailed(true)} alt="" className="w-6 h-6 shrink-0 rounded-xs border border-[var(--border)] object-cover" referrerPolicy="no-referrer" />;
  }
  return (
    <div className="w-6 h-6 shrink-0 rounded-xs border border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-center text-[9px] font-bold text-[var(--text-secondary)]" aria-hidden="true">
      {initials}
    </div>
  );
}

export function NavItem({ id, label, desc, icon: Icon, adminOnly = false, activeColor = 'text-[var(--text-primary)]', isMobile = false }: any) {
  const { activeTab, setActiveTab, isSidebarExpanded, closeMobile, session } = React.useContext(NavCtx);
  const setSubTabIntent = useContractStore((s) => s.setSubTabIntent);
  const subTabIntent = useContractStore((s) => s.subTabIntent);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const closeTimer = useRef<number | undefined>(undefined);

  if (adminOnly && !(session?.is_super_admin || ['super_admin', 'owner', 'admin'].includes(session?.admin_role || ''))) {
    return null;
  }

  const isActive = activeTab === id;
  const subTabs = NAV_SUBTABS[id];
  const hasFlyout = !isMobile && !!subTabs;
  // Reflect the current page's live sub-tab selection in the flyout highlight.
  const activeSub = isActive && subTabIntent && subTabIntent.startsWith(`${id}:`) ? subTabIntent.split(':')[1] : null;

  const open = () => {
    if (!hasFlyout) return;
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    if (btnRef.current) setAnchor(btnRef.current.getBoundingClientRect());
  };
  const scheduleClose = () => {
    if (!hasFlyout) return;
    closeTimer.current = window.setTimeout(() => setAnchor(null), 130);
  };
  const pick = (subId: string) => {
    setActiveTab(id);
    setSubTabIntent(`${id}:${subId}`);
    setAnchor(null);
    closeMobile();
  };
  // Keyboard path into the portaled flyout (it lives at the end of <body>, so
  // natural Tab order can never reach it): ArrowRight opens the menu and moves
  // focus to its first item. Escape inside the menu returns focus here without
  // re-opening (one-shot suppression, since focus would otherwise re-trigger).
  const suppressOpen = useRef(false);
  const onButtonFocus = () => {
    if (suppressOpen.current) { suppressOpen.current = false; return; }
    open();
  };
  const enterFlyout = (e: React.KeyboardEvent) => {
    if (!hasFlyout || e.key !== 'ArrowRight') return;
    e.preventDefault();
    open();
    // The portal mounts on React's schedule, not ours — retry a few frames until
    // the first menuitem exists, then focus it.
    let tries = 0;
    const tryFocus = () => {
      const item = document.querySelector<HTMLElement>(`[data-flyout-for="${id}"] [role="menuitem"]`);
      if (item) { item.focus(); return; }
      if (++tries < 12) requestAnimationFrame(tryFocus);
    };
    requestAnimationFrame(tryFocus);
  };
  const escapeFlyout = () => {
    suppressOpen.current = true;
    btnRef.current?.focus();
    setAnchor(null);
  };

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => { setActiveTab(id); closeMobile(); }}
        onMouseEnter={open}
        onMouseLeave={scheduleClose}
        onFocus={onButtonFocus}
        onBlur={scheduleClose}
        onKeyDown={enterFlyout}
        aria-haspopup={hasFlyout ? 'menu' : undefined}
        style={{ borderRadius: 'var(--radius-control)' }}
        className={`w-full flex items-center gap-3 px-3 py-2 text-[13px] font-medium tracking-normal transition-colors border ${isMobile ? 'min-h-[44px]' : ''} ${
          isActive
            ? adminOnly
              ? 'bg-rose-950/40 text-[var(--text-primary)] border-rose-500/50'
              : 'bg-[var(--surface-2)] text-[var(--text-primary)] border-[var(--border-strong)]'
            : 'border-transparent text-[var(--text-tertiary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]'
        } focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none`}
      >
        <Icon className={`w-4 h-4 shrink-0 ${isActive ? (adminOnly ? 'text-rose-500' : activeColor) : ''}`} />
        <span className={`flex-1 min-w-0 text-left overflow-hidden transition-all duration-300 ${isSidebarExpanded || isMobile ? 'opacity-100 max-w-[200px]' : 'opacity-0 max-w-0'}`}>
          <span className="block whitespace-nowrap truncate leading-tight">{label}</span>
          {/* One-line description — same second line the landing sidebar shows, so the
              two sidebars are pixel-identical. Hidden (with the label) when collapsed. */}
          {desc ? <span className="block whitespace-nowrap truncate text-[10.5px] leading-tight font-normal text-[var(--text-tertiary)]">{desc}</span> : null}
        </span>
        {hasFlyout && (isSidebarExpanded || isMobile)
          ? <ChevronRight className="w-3 h-3 opacity-40 shrink-0" />
          : isActive && (isSidebarExpanded || isMobile) && <ChevronRight className="w-3 h-3 opacity-50 shrink-0" />}
      </button>
      {hasFlyout && anchor && (
        <NavFlyout anchor={anchor} subTabs={subTabs} pageId={id} activeSub={activeSub} onPick={pick} onEnter={open} onLeave={scheduleClose} onEscape={escapeFlyout} />
      )}
    </>
  );
}

// Render one shared nav definition as a NavItem row (mobile drawer / landing).
export const renderNavItem = (it: NavItemDef, isMobile = false) => (
  <NavItem
    key={it.id}
    id={it.id}
    label={it.label}
    desc={it.desc}
    icon={it.icon}
    adminOnly={it.adminOnly}
    activeColor={it.accent ? 'text-[var(--accent-color)]' : undefined}
    isMobile={isMobile}
  />
);

/* ════════════════════════════════════════════════════════════════════════════
   WORKSTATION SHELL — a persistent, collapsible labeled sidebar + a slim global
   header. The sidebar collapses to a 68px icon rail and expands to a 200px
   labeled rail (preference persisted under SIDEBAR_COLLAPSED_KEY, read
   synchronously so there's no boot jump). Active rows carry the spectral
   (holographic silver) left rail + a subtle workspace tint — no glow, no
   capsule. NavItem/renderNavItem stay exported unchanged for the landing sidebar
   and the mobile drawer.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Live desk clock (ET) for the header — the market's timezone. This is the shell's
 *  single wall-clock; the footer shows LAST UPDATE and the feed pill shows STATE,
 *  so no ticking timestamp is duplicated across all three. */
function DeskClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <span className="hidden lg:inline-flex items-baseline gap-1.5 text-[11px] tabular-nums text-[var(--text-tertiary)]" style={{ fontFamily: 'var(--font-brand)' }}>
      {nyTimeString(now)}
      <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">ET</span>
    </span>
  );
}

/** Live ET wall-clock string (hh:mm:ss) — used by the footer LAST UPDATE. */
function useEtClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return nyTimeString(now);
}

/** THE single, honest feed-status indicator. Maps the real `feedStatus` transport
 *  state (connecting / live / offline / stale) plus market hours into one label +
 *  colored dot — always with a text label, never a bare dot, never a continuous
 *  pulse. When the feed is degraded (offline / delayed) it appends the last time a
 *  live frame was seen so a trader can judge freshness. */
function FeedStatus({ feedStatus, className = '' }: { feedStatus: 'connecting' | 'live' | 'offline' | 'stale'; className?: string }) {
  const marketOpen = useContractStore((s) => s.marketState.open);
  const lastLiveRef = useRef<string>('');
  // Keep a fresh "last live frame" stamp only while streaming, so a transition to
  // degraded can honestly show when data last flowed. One cheap 1Hz timer, live-only.
  useEffect(() => {
    if (feedStatus !== 'live') return;
    lastLiveRef.current = nyTimeString();
    const t = window.setInterval(() => { lastLiveRef.current = nyTimeString(); }, 1000);
    return () => window.clearInterval(t);
  }, [feedStatus]);

  const key: 'connecting' | 'offline' | 'stale' | 'liveOpen' | 'liveClosed' =
    feedStatus === 'offline' ? 'offline'
    : feedStatus === 'stale' ? 'stale'
    : feedStatus === 'connecting' ? 'connecting'
    : marketOpen ? 'liveOpen' : 'liveClosed';

  const META: Record<typeof key, { label: string; color: string; title: string }> = {
    connecting: { label: 'Connecting', color: 'var(--text-muted)', title: 'Connecting to the live market feed…' },
    offline: { label: 'Offline', color: 'var(--negative-ink)', title: 'Feed disconnected — reconnecting. Figures may be stale.' },
    stale: { label: 'Delayed', color: 'var(--warning-ink)', title: 'Feed open but quiet — prices may be delayed, not live.' },
    liveOpen: { label: 'Real-Time', color: 'var(--positive-ink)', title: 'Live real-time market feed.' },
    liveClosed: { label: 'Market Closed', color: 'var(--text-secondary)', title: 'Connected — regular session is closed.' },
  } as const;
  const m = META[key];
  const degraded = key === 'offline' || key === 'stale';

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 border border-[var(--border)] px-2 py-1 ${className}`}
      style={{ borderRadius: 'var(--radius-control)' }}
      title={m.title}
      aria-label={`Data ${m.label}`}
    >
      <span className="text-[9px] font-semibold uppercase tracking-[0.13em] text-[var(--text-muted)]">Data</span>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: m.color }} aria-hidden="true" />
      <span className="text-[9px] font-semibold uppercase tracking-[0.13em]" style={{ color: m.color }}>{m.label}</span>
      {degraded && lastLiveRef.current ? (
        <span className="hidden text-[9px] tabular-nums text-[var(--text-faint)] xl:inline">· {lastLiveRef.current}</span>
      ) : null}
    </span>
  );
}

/** Real instrument search. The old ticker slot was a decorative chip; this makes it
 *  a genuine symbol switcher over the live instrument universe (ASSET_LIST) — a
 *  focusable input, clear button, arrow-key navigation, Enter to select. Results are
 *  real instruments only (ticker + name, never a fabricated quote). Selecting one
 *  drives the real setSelectedAsset flow (re-subscribes the feed). The global
 *  command palette (⌘K) is unchanged and remains the broad search. */
function InstrumentSearch({ compact = false }: { compact?: boolean }) {
  const selectedAsset = useContractStore((s) => s.selectedAsset);
  const setSelectedAsset = useContractStore((s) => s.setSelectedAsset);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? ASSET_LIST.filter((a) => a.ticker.toLowerCase().includes(q) || (a.name || '').toLowerCase().includes(q))
      : ASSET_LIST;
    return base.slice(0, 8);
  }, [query]);

  const openMenu = () => {
    if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setQuery('');
    setIdx(0);
    setOpen(true);
  };
  const closeMenu = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(t);
  }, [open]);

  const pick = (a: AssetInfo) => {
    setSelectedAsset(a);
    closeMenu();
    btnRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(); btnRef.current?.focus(); return; }
    if (!results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => (i + 1) % results.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => (i - 1 + results.length) % results.length); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(results[idx] ?? results[0]); }
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? closeMenu() : openMenu())}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={`Search instruments — currently ${selectedAsset?.name ?? selectedAsset?.ticker ?? ''}`}
        className={`inline-flex shrink-0 items-center gap-1.5 border px-2 text-[11px] font-bold uppercase tracking-[0.12em] transition-colors focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none ${compact ? 'h-9' : 'h-7'} ${
          open ? 'border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--text-primary)]' : 'border-[var(--border)] text-[var(--text-primary)] hover:border-[var(--border-strong)]'
        }`}
        style={{ borderRadius: 'var(--radius-control)' }}
      >
        <Search className="h-3 w-3 shrink-0 opacity-45" aria-hidden="true" />
        <span>{selectedAsset?.ticker ?? '—'}</span>
        <ChevronRight className="h-3 w-3 shrink-0 rotate-90 opacity-40" aria-hidden="true" />
      </button>

      {open && rect && createPortal(
        <>
          <div className="fixed inset-0 z-[10040]" onMouseDown={closeMenu} aria-hidden="true" />
          <div
            role="listbox"
            aria-label="Instruments"
            className="fixed z-[10050] border border-[var(--border-strong)] bg-[var(--surface)] p-1 shadow-[0_16px_44px_-12px_rgba(0,0,0,0.8)]"
            style={{ top: rect.bottom + 6, left: Math.min(rect.left, window.innerWidth - 272), width: 260, borderRadius: 'var(--radius-panel)' }}
          >
            <div className="flex items-center gap-2 border-b border-[var(--border)] px-2 py-1.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setIdx(0); }}
                onKeyDown={onKeyDown}
                placeholder="Search symbol…"
                aria-label="Search symbol"
                className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:outline-none"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => { setQuery(''); setIdx(0); inputRef.current?.focus(); }}
                  aria-label="Clear search"
                  className="shrink-0 rounded p-0.5 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
            <div className="max-h-[320px] overflow-y-auto py-1 scrollbar-none">
              {results.length === 0 ? (
                <div className="px-2.5 py-3 text-center text-[11px] text-[var(--text-muted)]">No instruments</div>
              ) : (
                results.map((a, i) => {
                  const on = i === idx;
                  const current = a.ticker === selectedAsset?.ticker;
                  return (
                    <button
                      key={a.ticker}
                      role="option"
                      aria-selected={on}
                      onMouseEnter={() => setIdx(i)}
                      onClick={() => pick(a)}
                      style={{ borderRadius: 'var(--radius-control)' }}
                      className={`flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left transition-colors ${on ? 'bg-[var(--surface-2)]' : ''}`}
                    >
                      <span className="w-12 shrink-0 text-[11.5px] font-bold uppercase tracking-wide text-[var(--text-primary)] slayer-num">{a.ticker}</span>
                      <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--text-tertiary)]">{a.name}</span>
                      {current ? <span className="shrink-0 text-[8.5px] font-semibold uppercase tracking-[0.12em] text-[var(--accent-color)]">Current</span> : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

/** Header market cluster: the instrument search + the live spot and session Δ.
 *  Subscribes to its own store slices so the per-frame feed churn re-renders THIS
 *  cluster, not the whole shell. Δ is synthesized honestly (spot vs the oldest
 *  streamed candle); with no reference candle we show the price alone. */
function MarketCluster() {
  const selectedAsset = useContractStore((s) => s.selectedAsset);
  const serverState = useContractStore((s) => s.serverState);

  const profile: any = serverState?.gex_profile;
  const spot: number | undefined =
    typeof profile?.spot === 'number' ? profile.spot : selectedAsset?.defaultPrice;

  const change = (() => {
    if (spot == null) return null;
    const candles: any[] | undefined = serverState?.candles as any;
    if (!candles || candles.length === 0) return null;
    const ref = candles[0]?.open ?? candles[0]?.close;
    if (ref == null || !isFinite(ref) || ref === 0) return null;
    const abs = spot - ref;
    return { abs, pct: (abs / ref) * 100 };
  })();

  const up = change ? change.abs >= 0 : false;
  const deltaColor = change ? (up ? 'var(--positive-ink)' : 'var(--negative-ink)') : 'var(--text-muted)';

  return (
    <div className="flex min-w-0 items-center gap-3">
      <InstrumentSearch />
      {spot != null ? (
        <div className="hidden shrink-0 items-baseline gap-2 sm:flex">
          <span className="slayer-num text-[16px] font-semibold leading-none text-[var(--text-primary)]">
            {spot.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          {change ? (
            <span className="slayer-num text-[11px] font-semibold leading-none" style={{ color: deltaColor }}>
              {up ? '+' : ''}{change.abs.toFixed(2)}
              <span className="ml-1 opacity-90">{up ? '+' : ''}{change.pct.toFixed(2)}%</span>
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Footer status strip — tiny mono, muted, hairline top. Reflects the real feed
 *  state + market hours (not a hardcoded "Live/Open"). LAST UPDATE is the shell's
 *  freshness stamp (frozen when the feed degrades); the header owns the wall clock. */
function StatusBar({ feedStatus }: { feedStatus: 'connecting' | 'live' | 'offline' | 'stale' }) {
  const time = useEtClock();
  const marketOpen = useContractStore((s) => s.marketState.open);
  const frozenRef = useRef<string>(time);
  if (feedStatus === 'live') frozenRef.current = time;
  const lastUpdate = feedStatus === 'live' ? time : frozenRef.current;

  const dataMeta =
    feedStatus === 'offline' ? { label: 'Offline', color: 'var(--negative-ink)' }
    : feedStatus === 'stale' ? { label: 'Delayed', color: 'var(--warning-ink)' }
    : feedStatus === 'connecting' ? { label: 'Connecting', color: 'var(--text-muted)' }
    : { label: 'Live', color: 'var(--positive-ink)' };

  const cell = 'flex items-center gap-1.5 whitespace-nowrap';
  const label = 'text-[9px] font-semibold uppercase tracking-[0.13em] text-[var(--text-muted)]';
  const val = 'text-[9px] font-semibold uppercase tracking-[0.13em] text-[var(--text-primary)] slayer-num';
  return (
    <footer
      className="hidden shrink-0 items-center gap-4 overflow-x-auto border-t border-[var(--border)] bg-[var(--surface)] px-4 py-1.5 md:flex"
      style={{ fontFamily: 'var(--font-brand)' }}
      aria-label="Feed status"
    >
      <span className={cell}>
        <span className={label}>Data Status</span>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: dataMeta.color }} aria-hidden="true" />
        <span className="text-[9px] font-semibold uppercase tracking-[0.13em]" style={{ color: dataMeta.color }}>{dataMeta.label}</span>
      </span>
      <span className="h-3 w-px bg-[var(--border)]" aria-hidden="true" />
      <span className={cell}><span className={label}>Last Update</span><span className={val}>{lastUpdate} ET</span></span>
      <span className="hidden h-3 w-px bg-[var(--border)] lg:inline-block" aria-hidden="true" />
      <span className={`${cell} hidden lg:flex`}><span className={label}>Latency</span><span className={val}>—</span></span>
      <span className="hidden h-3 w-px bg-[var(--border)] lg:inline-block" aria-hidden="true" />
      <span className={`${cell} hidden lg:flex`}><span className={label}>Source</span><span className={val}>Real-Time Feed</span></span>
      <span className="ml-auto h-3 w-px bg-[var(--border)] hidden sm:inline-block" aria-hidden="true" />
      <span className={`${cell} sm:ml-0 ml-auto`}>
        <span className={label}>Market</span>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: marketOpen ? 'var(--positive-ink)' : 'var(--text-tertiary)' }} aria-hidden="true" />
        <span className={val}>{marketOpen ? 'Open' : 'Closed'}</span>
      </span>
    </footer>
  );
}

/** One sidebar row: icon + (label when expanded), a spectral holo left rail + a
 *  subtle workspace tint when active. Consistent icon size + stroke, no rounded
 *  box around the icon, no glow. Items with sub-workspaces keep a keyboard-
 *  accessible hover flyout (a shortcut — the pages also surface these as tabs). */
function SidebarRow({ it }: { it: NavItemDef }) {
  const { activeTab, setActiveTab, isSidebarExpanded, closeMobile, session } = React.useContext(NavCtx);
  const setSubTabIntent = useContractStore((s) => s.setSubTabIntent);
  const subTabIntent = useContractStore((s) => s.subTabIntent);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const suppressOpen = useRef(false);

  if (it.adminOnly && !(session?.is_super_admin || ['super_admin', 'owner', 'admin'].includes(session?.admin_role || ''))) {
    return null;
  }

  const isActive = activeTab === it.id;
  const subTabs = NAV_SUBTABS[it.id];
  const hasFlyout = !!subTabs;
  const activeSub = isActive && subTabIntent && subTabIntent.startsWith(`${it.id}:`) ? subTabIntent.split(':')[1] : null;
  const Icon = it.icon;
  const admin = !!it.adminOnly;

  const open = () => {
    if (!hasFlyout) return;
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    if (btnRef.current) setAnchor(btnRef.current.getBoundingClientRect());
  };
  const scheduleClose = () => {
    if (!hasFlyout) return;
    closeTimer.current = window.setTimeout(() => setAnchor(null), 130);
  };
  const pick = (subId: string) => {
    setActiveTab(it.id);
    setSubTabIntent(`${it.id}:${subId}`);
    setAnchor(null);
    closeMobile();
  };
  const onButtonFocus = () => {
    if (suppressOpen.current) { suppressOpen.current = false; return; }
    open();
  };
  // Keyboard path into the portaled flyout: ArrowRight opens + focuses its first item.
  const enterFlyout = (e: React.KeyboardEvent) => {
    if (!hasFlyout || e.key !== 'ArrowRight') return;
    e.preventDefault();
    open();
    let tries = 0;
    const tryFocus = () => {
      const item = document.querySelector<HTMLElement>(`[data-flyout-for="${it.id}"] [role="menuitem"]`);
      if (item) { item.focus(); return; }
      if (++tries < 12) requestAnimationFrame(tryFocus);
    };
    requestAnimationFrame(tryFocus);
  };
  const escapeFlyout = () => {
    suppressOpen.current = true;
    btnRef.current?.focus();
    setAnchor(null);
  };

  const railColor = admin ? '#fb7185' : 'var(--slayer-holo, var(--accent-color))';
  const iconTint = isActive ? (admin ? 'text-rose-400' : 'text-[var(--accent-color)]') : '';

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => { setActiveTab(it.id); closeMobile(); }}
        onMouseEnter={open}
        onMouseLeave={scheduleClose}
        onFocus={onButtonFocus}
        onBlur={scheduleClose}
        onKeyDown={enterFlyout}
        aria-haspopup={hasFlyout ? 'menu' : undefined}
        aria-current={isActive ? 'page' : undefined}
        aria-label={it.label}
        title={it.desc ? `${it.label} — ${it.desc}` : it.label}
        style={{ borderRadius: 'var(--radius-control)' }}
        className={`group relative flex w-full items-center transition-colors focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none ${
          isSidebarExpanded ? 'h-9 gap-3 px-3' : 'h-10 justify-center px-0'
        } ${
          isActive
            ? admin
              ? 'bg-rose-950/30 text-[var(--text-primary)]'
              : 'bg-[var(--surface-2)] text-[var(--text-primary)]'
            : 'text-[var(--text-tertiary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-secondary)]'
        }`}
      >
        {/* active marker — a 2px rule on the row's edge. When active (and not the
            rose admin row) it carries the LIVING holographic-silver band: a slow
            cyan↔silver↔violet drift, the same brand shimmer as the wordmark. */}
        <span
          aria-hidden="true"
          className={`absolute left-0 top-1/2 h-6 w-[2px] -translate-y-1/2 rounded-r-full transition-opacity duration-150 ${isActive ? 'opacity-100' : 'opacity-0'} ${isActive && !admin ? 'slayer-holo-fill' : ''}`}
          style={isActive && !admin ? undefined : { background: railColor }}
        />
        <Icon className={`h-[18px] w-[18px] shrink-0 ${iconTint}`} />
        {isSidebarExpanded ? (
          <span className="min-w-0 flex-1 truncate text-left text-[12.5px] font-medium leading-none">{it.label}</span>
        ) : null}
        {isSidebarExpanded && hasFlyout ? <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-35" aria-hidden="true" /> : null}
      </button>
      {hasFlyout && anchor && (
        <NavFlyout anchor={anchor} subTabs={subTabs} pageId={it.id} activeSub={activeSub} onPick={pick} onEnter={open} onLeave={scheduleClose} onEscape={escapeFlyout} />
      )}
    </>
  );
}

export function AppShell({ children, session, onLogout, tierInfo, onUpgradeClick, setShowAuthModal, feedStatus = 'connecting' }: AppShellProps) {
  const activeTab = useContractStore(s => s.activeTab);
  const setActiveTab = useContractStore(s => s.setActiveTab);
  const setSubTabIntent = useContractStore(s => s.setSubTabIntent);
  const subTabIntent = useContractStore(s => s.subTabIntent);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Sidebar collapse preference — read synchronously so first paint is at the final
  // width (no boot jump). Shares SIDEBAR_COLLAPSED_KEY with the landing sidebar
  // (value = the COLLAPSED flag), so crossing landing ⇄ terminal keeps the width.
  const [isSidebarExpanded, setIsSidebarExpanded] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try { return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) !== 'true'; } catch { return true; }
  });
  const toggleSidebar = () => {
    setIsSidebarExpanded((prev) => {
      const next = !prev;
      try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(!next)); } catch { /* storage may be blocked */ }
      return next;
    });
  };

  const navCtxValue = React.useMemo<NavCtxValue>(() => ({
    activeTab,
    setActiveTab,
    isSidebarExpanded,
    closeMobile: () => setIsMobileMenuOpen(false),
    session,
  }), [activeTab, setActiveTab, isSidebarExpanded, session]);

  // Header context: the active module + its sub-tabs surfaced as real tabs (a
  // non-flyout route to the sub-workspaces).
  const ALL_NAV: NavItemDef[] = [...NAV_MAIN_VIEWS, ...NAV_TOOLS, NAV_SETTINGS, NAV_ADMIN];
  const current = ALL_NAV.find((n) => n.id === activeTab);
  const currentSubTabs = NAV_SUBTABS[activeTab];
  const activeSub = subTabIntent && subTabIntent.startsWith(`${activeTab}:`) ? subTabIntent.split(':')[1] : null;

  return (
    <NavCtx.Provider value={navCtxValue}>
    <div className="flex w-full h-full min-h-screen font-sans text-[var(--text-primary)] bg-[var(--background)] overflow-hidden antialiased">
      {/* ── Sidebar (desktop) — collapsible labeled rail ────────────────────── */}
      <aside
        className={`relative z-[100] hidden h-full shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] transition-[width] duration-200 ease-out md:flex ${isSidebarExpanded ? 'w-[200px]' : 'w-[68px]'}`}
      >
        {/* brand — glyph when collapsed, wordmark when expanded */}
        <div className={`flex h-[52px] shrink-0 items-center border-b border-[var(--border)] ${isSidebarExpanded ? 'px-3' : 'justify-center px-0'}`}>
          <button
            type="button"
            className="flex min-w-0 items-center overflow-hidden rounded-md focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
            style={{ transform: isSidebarExpanded ? 'scale(0.9)' : 'scale(0.82)', transformOrigin: 'left center' }}
            onClick={() => setActiveTab('home')}
            aria-label="Go to home"
            title="Home"
          >
            <BrandHeader expanded={isSidebarExpanded} />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden px-2.5 py-2 scrollbar-none" style={{ WebkitOverflowScrolling: 'touch' }}>
          {isSidebarExpanded ? (
            <div className="px-1 pb-1 pt-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">Views</div>
          ) : null}
          {NAV_MAIN_VIEWS.map((it) => <SidebarRow key={it.id} it={it} />)}
          <div className="mx-1 my-2 h-px shrink-0 bg-[var(--border)]" aria-hidden="true" />
          {isSidebarExpanded ? (
            <div className="px-1 pb-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">Tools</div>
          ) : null}
          {NAV_TOOLS.map((it) => <SidebarRow key={it.id} it={it} />)}
        </div>

        {/* pinned bottom cluster: settings · (admin, separated) · account · collapse */}
        <div className="shrink-0 border-t border-[var(--border)] px-2.5 pb-2 pt-2">
          <SidebarRow it={NAV_SETTINGS} />
          {(session?.is_super_admin || ['super_admin', 'owner', 'admin'].includes(session?.admin_role || '')) ? (
            <>
              <div className="mx-1 my-1.5 h-px bg-[var(--border)]" aria-hidden="true" />
              <SidebarRow it={NAV_ADMIN} />
            </>
          ) : null}

          {/* account */}
          <div className={`mt-2 flex ${isSidebarExpanded ? 'items-center gap-2 px-1' : 'flex-col items-center gap-2'}`}>
            {session?.authenticated ? (
              <>
                <span title={session?.name} className={isSidebarExpanded ? 'flex min-w-0 items-center gap-2' : ''}>
                  <IdentityAvatar name={session?.name} avatar={session?.avatar} />
                  {isSidebarExpanded ? (
                    <span className="min-w-0 truncate text-[11.5px] font-semibold text-[var(--text-secondary)]">{session?.name}</span>
                  ) : null}
                </span>
                <button
                  type="button"
                  onClick={onUpgradeClick}
                  title={`${tierInfo?.label ?? 'Plan'} — manage plan`}
                  aria-label={`${tierInfo?.label ?? 'Plan'} — manage plan`}
                  className={`flex cursor-pointer items-center justify-center gap-1.5 border border-[var(--border)] text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-tertiary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none ${isSidebarExpanded ? 'ml-auto rounded px-2 py-1' : 'h-8 w-8 rounded-full'}`}
                  style={isSidebarExpanded ? { borderRadius: 'var(--radius-control)' } : undefined}
                >
                  <span className={`inline-flex h-2 w-2 rounded-full ${tierInfo?.dotColor}`} />
                  {isSidebarExpanded ? <span className="truncate">{tierInfo?.label}</span> : null}
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                className={`flex cursor-pointer items-center justify-center gap-2 border border-[var(--border)] text-[var(--text-tertiary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none ${isSidebarExpanded ? 'w-full rounded px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.1em]' : 'h-8 w-8 rounded-full'}`}
                style={isSidebarExpanded ? { borderRadius: 'var(--radius-control)' } : undefined}
                title="Log in / create account"
                aria-label="Log in / create account"
              >
                <Lock className="h-3.5 w-3.5 shrink-0" />
                {isSidebarExpanded ? <span>Log in</span> : null}
              </button>
            )}
          </div>

          {/* collapse / expand toggle — persistent, same place in both states */}
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={isSidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
            aria-expanded={isSidebarExpanded}
            title={isSidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
            style={{ borderRadius: 'var(--radius-control)' }}
            className={`mt-2 flex w-full items-center text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-secondary)] focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none ${isSidebarExpanded ? 'h-8 gap-2.5 px-3' : 'h-8 justify-center'}`}
          >
            {isSidebarExpanded ? <PanelLeftClose className="h-4 w-4 shrink-0" strokeWidth={1.75} /> : <PanelLeftOpen className="h-4 w-4 shrink-0" strokeWidth={1.75} />}
            {isSidebarExpanded ? <span className="text-[11px] font-medium">Collapse</span> : null}
          </button>
        </div>
      </aside>

      {/* Mobile top bar — compact: brand · symbol search · feed dot · menu */}
      <div className="md:hidden fixed top-0 left-0 w-full z-[100] h-[52px] bg-[var(--surface)] border-b border-[var(--border)] px-3 flex items-center justify-between gap-2">
        <button type="button" className="cursor-pointer scale-[0.82] origin-left bg-transparent border-0 p-0" onClick={() => setActiveTab('home')} aria-label="Go to home">
          <BrandHeader />
        </button>
        <div className="flex items-center gap-2">
          <InstrumentSearch compact />
          <FeedStatus feedStatus={feedStatus} className="hidden sm:inline-flex" />
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="flex h-11 w-11 items-center justify-center text-[var(--text-tertiary)] rounded focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
            aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isMobileMenuOpen}
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer — labelled sections, ≥44px targets, no hover-only paths */}
      {isMobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 top-[52px] z-[90] bg-[var(--surface)]/95 backdrop-blur-sm border-t border-[var(--border)] overflow-y-auto pb-20 touch-pan-y scroll-smooth"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className="p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-[0.16em]">Feed</span>
              <FeedStatus feedStatus={feedStatus} />
            </div>

            <div className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-[0.16em] px-2 py-1 mt-2 mb-2">
              Main Views
            </div>
            {NAV_MAIN_VIEWS.map((it) => renderNavItem(it, true))}

            <div className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-[0.16em] px-2 py-1 mt-6 mb-2">
              Tools
            </div>
            {NAV_TOOLS.map((it) => renderNavItem(it, true))}

            <div className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-[0.16em] px-2 py-1 mt-6 mb-2">
              Account
            </div>
            {renderNavItem(NAV_SETTINGS, true)}
            {renderNavItem(NAV_ADMIN, true)}

            {session?.authenticated ? (
              <button
                onClick={() => { onLogout(); setIsMobileMenuOpen(false); }}
                style={{ borderRadius: 'var(--radius-control)' }}
                className="w-full min-h-[44px] flex items-center gap-3 px-3 py-3 text-[13px] font-semibold tracking-wide text-[var(--warning)] bg-[var(--warning)]/10 border border-[var(--warning)]/20 mt-6 justify-center focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
              >
                <LogOut className="w-4 h-4" /> Log out
              </button>
            ) : (
              <button
                onClick={() => { setShowAuthModal(true); setIsMobileMenuOpen(false); }}
                style={{ borderRadius: 'var(--radius-control)' }}
                className="w-full min-h-[44px] px-3 py-3 mt-6 border border-[var(--border)] bg-[var(--surface-2)] text-[var(--success)] font-semibold transition-colors flex items-center justify-center gap-1.5 text-[13px] tracking-wide focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
              >
                Log in / create account
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Header + content column ─────────────────────────────────────────── */}
      <div className="flex h-full min-w-0 flex-1 flex-col">
        {/* Global header (desktop): market context · module · status · controls · account */}
        <header className="hidden h-[52px] shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4 md:flex">
          {/* left: instrument search · spot · session Δ */}
          <MarketCluster />

          <span className="hidden h-6 w-px bg-[var(--border)] lg:inline-block" aria-hidden="true" />

          {/* module identity + its sub-sections as real tabs (a non-flyout route) */}
          <div className="flex min-w-0 items-baseline gap-2.5">
            <span className="whitespace-nowrap text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--text-primary)]">
              {current?.label ?? 'Terminal'}
            </span>
            {current?.desc ? (
              <span className="hidden max-w-[220px] truncate text-[11px] text-[var(--text-tertiary)] 2xl:block">{current.desc}</span>
            ) : null}
          </div>

          {currentSubTabs ? (
            <nav aria-label={`${current?.label ?? 'Module'} sections`} className="hidden min-w-0 items-center gap-1 overflow-x-auto xl:flex">
              {currentSubTabs.map((s) => {
                const on = activeSub === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSubTabIntent(`${activeTab}:${s.id}`)}
                    aria-current={on ? 'true' : undefined}
                    style={{ borderRadius: 'var(--radius-control)' }}
                    className={`cursor-pointer whitespace-nowrap border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none ${
                      on
                        ? 'border-[color-mix(in_srgb,var(--accent-color)_40%,transparent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                        : 'border-transparent text-[var(--text-tertiary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </nav>
          ) : null}

          {/* right: data status · mode · clock · layout · account */}
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <FeedStatus feedStatus={feedStatus} />

            <span
              className="hidden shrink-0 items-center gap-1.5 border border-[var(--border)] px-2 py-1 xl:inline-flex"
              style={{ borderRadius: 'var(--radius-control)' }}
              title="Analysis mode — dealer positioning"
            >
              <span className="text-[9px] font-semibold uppercase tracking-[0.13em] text-[var(--text-muted)]">Mode</span>
              <span className="text-[9px] font-semibold uppercase tracking-[0.13em] text-[var(--text-secondary)]">Dealer</span>
            </span>

            <span className="hidden h-6 w-px bg-[var(--border)] lg:inline-block" aria-hidden="true" />

            <DeskClock />

            <button
              type="button"
              onClick={() => setActiveTab('workspace')}
              aria-current={activeTab === 'workspace' ? 'page' : undefined}
              title="Workspace layouts"
              style={{ borderRadius: 'var(--radius-control)' }}
              className={`hidden cursor-pointer items-center gap-1.5 border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none lg:inline-flex ${
                activeTab === 'workspace'
                  ? 'border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--text-primary)]'
                  : 'border-[var(--border)] text-[var(--text-tertiary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
              <span className="hidden 2xl:inline">Layout</span>
            </button>

            <span className="hidden h-6 w-px bg-[var(--border)] lg:inline-block" aria-hidden="true" />

            {session?.authenticated ? (
              <>
                <button
                  type="button"
                  onClick={onUpgradeClick}
                  style={{ borderRadius: 'var(--radius-control)' }}
                  className="hidden cursor-pointer items-center gap-2 border border-[var(--border)] px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none sm:inline-flex"
                  title={tierInfo?.desc}
                >
                  <span className={`inline-flex h-1.5 w-1.5 rounded-full ${tierInfo?.dotColor}`} />
                  {tierInfo?.label}
                </button>
                <div className="flex items-center gap-2">
                  <IdentityAvatar name={session?.name} avatar={session?.avatar} />
                  <span className="hidden max-w-[130px] truncate text-[11.5px] font-semibold text-[var(--text-secondary)] 2xl:block">{session?.name}</span>
                </div>
                <button
                  onClick={onLogout}
                  className="cursor-pointer rounded p-1.5 text-[var(--text-tertiary)] transition-colors hover:text-[var(--warning)] focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
                  title="Logout"
                  aria-label="Logout"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                style={{ borderRadius: 'var(--radius-control)' }}
                className="cursor-pointer bg-[var(--accent-color)] px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--primary-contrast)] transition-colors hover:bg-[var(--accent-strong)] focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
              >
                Log in
              </button>
            )}
          </div>
        </header>

        {/* Main content area — stable origin (offset only for the fixed mobile bar) */}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--surface)] pt-[52px] md:pt-0">
          {children}
        </div>

        {/* Footer status strip — global, hairline top, tiny mono */}
        <StatusBar feedStatus={feedStatus} />
      </div>
    </div>
    </NavCtx.Provider>
  );
}
