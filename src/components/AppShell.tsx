import React, { ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  LogOut,
  ChevronRight,
  Menu,
  Lock,
  X
} from 'lucide-react';
import { BrandHeader } from './BrandLogo';
import { useContractStore } from '../lib/store';
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
      className="min-w-[176px] border border-[var(--border-strong)] bg-[var(--surface)] p-1 shadow-[0_16px_44px_-12px_rgba(0,0,0,0.8)]"
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
              on ? 'bg-[var(--accent-color)]/12 text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]'
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

// Render one shared nav definition as a NavItem row (desktop or mobile).
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
   COMMAND DECK — the redesigned shell format.
   The wide labeled sidebar is replaced by (1) a slim ICON RAIL (icon + micro-
   label, active = bright left rule) and (2) a TOP COMMAND BAR that carries what
   the sidebar used to hide: the active module's name + description, its sub-
   sections surfaced as REAL TABS (previously buried in hover flyouts), a live
   ET clock, the plan chip and identity. Same information, different format.
   NavItem/renderNavItem stay exported unchanged — the landing sidebar and the
   mobile drawer still use them.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Live desk clock (ET) for the command bar — the market's timezone. */
function DeskClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  let time = '';
  try {
    time = now.toLocaleTimeString('en-US', { hour12: false, timeZone: 'America/New_York' });
  } catch {
    time = now.toLocaleTimeString('en-US', { hour12: false });
  }
  return (
    <span className="hidden lg:inline-flex items-baseline gap-1.5 text-[11px] tabular-nums text-[var(--text-tertiary)]" style={{ fontFamily: 'var(--font-brand)' }}>
      {time}
      <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">ET</span>
    </span>
  );
}

/** One rail entry: icon + micro-label, bright left rule when active. Items with
 *  sub-tabs keep their hover flyout (the command bar also surfaces them as tabs). */
function RailItem({ it }: { it: NavItemDef }) {
  const { activeTab, setActiveTab, session } = React.useContext(NavCtx);
  const setSubTabIntent = useContractStore((s) => s.setSubTabIntent);
  const subTabIntent = useContractStore((s) => s.subTabIntent);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const closeTimer = useRef<number | undefined>(undefined);

  if (it.adminOnly && !(session?.is_super_admin || ['super_admin', 'owner', 'admin'].includes(session?.admin_role || ''))) {
    return null;
  }

  const isActive = activeTab === it.id;
  const subTabs = NAV_SUBTABS[it.id];
  const activeSub = isActive && subTabIntent && subTabIntent.startsWith(`${it.id}:`) ? subTabIntent.split(':')[1] : null;
  const Icon = it.icon;
  // Micro-label: first word only — the rail is 68px wide; full names live in the
  // command bar + tooltip.
  const micro = it.label.split(' ')[0];

  const open = () => {
    if (!subTabs) return;
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    if (btnRef.current) setAnchor(btnRef.current.getBoundingClientRect());
  };
  const scheduleClose = () => {
    if (!subTabs) return;
    closeTimer.current = window.setTimeout(() => setAnchor(null), 130);
  };
  const pick = (subId: string) => {
    setActiveTab(it.id);
    setSubTabIntent(`${it.id}:${subId}`);
    setAnchor(null);
  };

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setActiveTab(it.id)}
        onMouseEnter={open}
        onMouseLeave={scheduleClose}
        onFocus={open}
        onBlur={scheduleClose}
        title={it.desc ? `${it.label} — ${it.desc}` : it.label}
        aria-label={it.label}
        aria-haspopup={subTabs ? 'menu' : undefined}
        aria-current={isActive ? 'page' : undefined}
        className={`relative flex w-full cursor-pointer flex-col items-center gap-1 rounded-[6px] py-2 transition-colors focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none ${
          isActive
            ? it.adminOnly ? 'text-rose-400' : 'text-[var(--accent-color)]'
            : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
        }`}
      >
        {/* active marker — a bright rule on the rail's edge */}
        <span
          aria-hidden="true"
          className={`absolute left-0 top-1/2 h-8 w-[2.5px] -translate-y-1/2 rounded-r-full transition-opacity duration-150 ${isActive ? 'opacity-100' : 'opacity-0'}`}
          style={{
            background: it.adminOnly ? '#fb7185' : 'var(--accent-color)',
            boxShadow: isActive && !it.adminOnly ? '0 0 12px var(--accent-glow, rgba(63,193,255,0.35))' : 'none',
          }}
        />
        <Icon className="h-[17px] w-[17px] shrink-0" />
        <span className="block w-full truncate px-0.5 text-center text-[8px] font-semibold uppercase leading-none tracking-[0.08em]">
          {micro}
        </span>
      </button>
      {subTabs && anchor && (
        <NavFlyout anchor={anchor} subTabs={subTabs} pageId={it.id} activeSub={activeSub} onPick={pick} onEnter={open} onLeave={scheduleClose} onEscape={() => setAnchor(null)} />
      )}
    </>
  );
}

export function AppShell({ children, session, onLogout, tierInfo, onUpgradeClick, setShowAuthModal }: AppShellProps) {
  const activeTab = useContractStore(s => s.activeTab);
  const setActiveTab = useContractStore(s => s.setActiveTab);
  const setSubTabIntent = useContractStore(s => s.setSubTabIntent);
  const subTabIntent = useContractStore(s => s.subTabIntent);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // The command-deck rail is fixed-width; the old expand/collapse state remains
  // only for the mobile drawer's NavCtx contract (labels always show there).
  const isSidebarExpanded = false;
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem(SIDEBAR_COLLAPSED_KEY, 'true');
  }, []);

  const navCtxValue = React.useMemo<NavCtxValue>(() => ({
    activeTab,
    setActiveTab,
    isSidebarExpanded,
    closeMobile: () => setIsMobileMenuOpen(false),
    session,
  }), [activeTab, setActiveTab, session]);

  // Command-bar context: the active module + its sub-tabs surfaced as real tabs.
  const ALL_NAV: NavItemDef[] = [...NAV_MAIN_VIEWS, ...NAV_TOOLS, NAV_SETTINGS, NAV_ADMIN];
  const current = ALL_NAV.find((n) => n.id === activeTab);
  const currentSubTabs = NAV_SUBTABS[activeTab];
  const activeSub = subTabIntent && subTabIntent.startsWith(`${activeTab}:`) ? subTabIntent.split(':')[1] : null;

  return (
    <NavCtx.Provider value={navCtxValue}>
    <div className="flex w-full h-full min-h-screen font-sans text-[var(--text-primary)] bg-[var(--background)] overflow-hidden antialiased">
      {/* ── Icon rail (desktop) ─────────────────────────────────────────── */}
      <aside className="relative z-[100] hidden h-full w-[68px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] md:flex">
        {/* brand glyph */}
        <div className="flex h-[52px] shrink-0 items-center justify-center border-b border-[var(--border)]">
          <button
            type="button"
            className="cursor-pointer rounded-md p-1 focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
            style={{ transform: 'scale(0.78)' }}
            onClick={() => setActiveTab('home')}
            aria-label="Go to home"
            title="Home"
          >
            <BrandHeader />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden px-1.5 py-2 scrollbar-none" style={{ WebkitOverflowScrolling: 'touch' }}>
          {NAV_MAIN_VIEWS.map((it) => <RailItem key={it.id} it={it} />)}
          <div className="mx-2 my-1.5 h-px shrink-0 bg-[var(--border)]" aria-hidden="true" />
          {NAV_TOOLS.map((it) => <RailItem key={it.id} it={it} />)}
        </div>

        {/* pinned bottom cluster: settings · admin · plan · identity */}
        <div className="shrink-0 border-t border-[var(--border)] px-1.5 pb-3 pt-1.5">
          <RailItem it={NAV_SETTINGS} />
          <RailItem it={NAV_ADMIN} />
          <div className="mt-2 flex flex-col items-center gap-2">
            {session?.authenticated ? (
              <>
                <button
                  type="button"
                  onClick={onUpgradeClick}
                  title={`${tierInfo?.label ?? 'Plan'} — manage plan`}
                  aria-label={`${tierInfo?.label ?? 'Plan'} — manage plan`}
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-[var(--border)] transition-colors hover:border-[var(--border-strong)] focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
                >
                  <span className={`inline-flex h-2 w-2 rounded-full ${tierInfo?.dotColor}`} />
                </button>
                <span title={session?.name}><IdentityAvatar name={session?.name} avatar={session?.avatar} /></span>
              </>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-tertiary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
                title="Log in / create account"
                aria-label="Log in / create account"
              >
                <Lock className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile Nav */}
      <div className="md:hidden fixed top-0 left-0 w-full z-[100] bg-[var(--surface)] border-b border-[var(--border)] px-4 py-3 flex items-center justify-between">
         <div className="cursor-pointer scale-[0.85] origin-left" onClick={() => setActiveTab('home')}>
             <BrandHeader />
         </div>
         <div className="flex items-center gap-3">
           <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="text-[var(--text-tertiary)] p-2 rounded focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none">
             {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
           </button>
         </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {isMobileMenuOpen && (
        <div 
          className="md:hidden fixed inset-0 top-[57px] z-[90] bg-[var(--surface)]/95 backdrop-blur-sm border-t border-[var(--border)] overflow-y-auto pb-20 touch-pan-y scroll-smooth"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className="p-4 flex flex-col gap-2">
            <div className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-[0.16em] px-2 py-1 mb-2">
              Main Views
            </div>
            {NAV_MAIN_VIEWS.map((it) => renderNavItem(it, true))}

            <div className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-[0.16em] px-2 py-1 mt-6 mb-2">
              Tools
            </div>

            {NAV_TOOLS.map((it) => renderNavItem(it, true))}
            {renderNavItem(NAV_SETTINGS, true)}
            {renderNavItem(NAV_ADMIN, true)}
            
            {session?.authenticated ? (
              <button 
                onClick={() => { onLogout(); setIsMobileMenuOpen(false); }}
                style={{ borderRadius: 'var(--radius-control)' }}
                className="w-full flex items-center gap-3 px-3 py-3 text-[13px] font-semibold tracking-wide text-[var(--warning)] bg-[var(--warning)]/10 border border-[var(--warning)]/20 mt-6 justify-center focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
              >
                <LogOut className="w-4 h-4" /> Log out
              </button>
            ) : (
              <button
                onClick={() => { setShowAuthModal(true); setIsMobileMenuOpen(false); }}
                style={{ borderRadius: 'var(--radius-control)' }}
                className="w-full px-3 py-3 mt-6 border border-[var(--border)] bg-[var(--surface-2)] text-[var(--success)] font-semibold transition-colors flex items-center justify-center gap-1.5 text-[13px] tracking-wide focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
              >
                Log in / create account
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Command bar + content column ─────────────────────────────────── */}
      <div className="flex h-full min-w-0 flex-1 flex-col">
        {/* Top command bar (desktop): module identity · sub-tabs · clock · account */}
        <header className="hidden h-[52px] shrink-0 items-center gap-4 border-b border-[var(--border)] bg-[var(--surface)] px-4 md:flex">
          <div className="flex min-w-0 items-baseline gap-2.5">
            <span className="whitespace-nowrap text-[12.5px] font-bold uppercase tracking-[0.18em] text-[var(--text-primary)]">
              {current?.label ?? 'Terminal'}
            </span>
            {current?.desc ? (
              <span className="hidden max-w-[260px] truncate text-[11px] text-[var(--text-tertiary)] lg:block">{current.desc}</span>
            ) : null}
          </div>

          {/* the module's sections as REAL tabs (were hidden inside hover flyouts) */}
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
                        ? 'border-[color-mix(in_srgb,var(--accent-color)_45%,transparent)] bg-[var(--accent-soft)] text-[var(--accent-color)]'
                        : 'border-transparent text-[var(--text-tertiary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </nav>
          ) : null}

          <div className="ml-auto flex shrink-0 items-center gap-3">
            <DeskClock />
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
                  <span className="hidden max-w-[130px] truncate text-[11.5px] font-semibold text-[var(--text-secondary)] lg:block">{session?.name}</span>
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
                className="cursor-pointer bg-[var(--accent-color)] px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--primary-contrast)] shadow-[0_6px_20px_-8px_var(--accent-glow)] transition-colors hover:bg-[var(--accent-strong)] focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
              >
                Log in
              </button>
            )}
          </div>
        </header>

        {/* Main Content Area */}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--surface)] pt-[57px] md:pt-0">
          {children}
        </div>
      </div>
    </div>
    </NavCtx.Provider>
  );
}
