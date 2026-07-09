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
// Exported (with NavItem/FeedPill below) so SlayerLanding renders the EXACT same
// sidebar rows/flyouts/pill — one implementation, zero landing-vs-app drift.
export const NavCtx = React.createContext<NavCtxValue>({
  activeTab: 'home', setActiveTab: () => {}, isSidebarExpanded: false, closeMobile: () => {}, session: null,
});

// Portal-rendered flyout, fixed-positioned off the hovered nav item (so the sidebar's
// own overflow never clips it). Clamped to stay on-screen for long lists.
function NavFlyout({ anchor, subTabs, pageId, activeSub, onPick, onEnter, onLeave }: {
  anchor: DOMRect; subTabs: { id: string; label: string }[]; pageId: string; activeSub: string | null;
  onPick: (subId: string) => void; onEnter: () => void; onLeave: () => void;
}) {
  const estH = subTabs.length * 30 + 16;
  const top = Math.max(8, Math.min(anchor.top, window.innerHeight - estH - 8));
  return createPortal(
    <div
      role="menu"
      aria-label={`${pageId} sections`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
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

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => { setActiveTab(id); closeMobile(); }}
        onMouseEnter={open}
        onMouseLeave={scheduleClose}
        onFocus={open}
        onBlur={scheduleClose}
        aria-haspopup={hasFlyout ? 'menu' : undefined}
        style={{ borderRadius: 'var(--radius-control)' }}
        className={`w-full flex items-center gap-3 px-3 py-2.5 text-[13px] font-medium tracking-normal transition-colors border ${isMobile ? 'min-h-[44px]' : ''} ${
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
        <NavFlyout anchor={anchor} subTabs={subTabs} pageId={id} activeSub={activeSub} onPick={pick} onEnter={open} onLeave={scheduleClose} />
      )}
    </>
  );
}

// Quiet connection indicator: a small dot. Callers still pass a status prop
// (kept for signature compatibility), but the indicator renders neutrally.
export function FeedPill({ compact = false }: { status?: 'connecting' | 'live' | 'offline' | 'stale'; compact?: boolean }) {
  // Resolve the theme token once so the dot matches the token-driven UI
  // (instead of a hardcoded hex) across light/dark/custom themes.
  const css = getComputedStyle(document.documentElement);
  const c = css.getPropertyValue('--success').trim() || '#4ADE80';
  return (
    <div className={`flex items-center ${compact ? '' : 'gap-1.5'}`}>
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: c }} />
      </span>
    </div>
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

export function AppShell({ children, session, onLogout, tierInfo, onUpgradeClick, setShowAuthModal, feedStatus }: AppShellProps) {
  const activeTab = useContractStore(s => s.activeTab);
  const setActiveTab = useContractStore(s => s.setActiveTab);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [isSidebarExpanded, setIsSidebarExpanded] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) !== 'true';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(!isSidebarExpanded));
    }
  }, [isSidebarExpanded]);

  const navCtxValue = React.useMemo<NavCtxValue>(() => ({
    activeTab,
    setActiveTab,
    isSidebarExpanded,
    closeMobile: () => setIsMobileMenuOpen(false),
    session,
  }), [activeTab, setActiveTab, isSidebarExpanded, session]);

  return (
    <NavCtx.Provider value={navCtxValue}>
    <div className="flex w-full h-full min-h-screen font-sans text-[var(--text-primary)] bg-[var(--background)] overflow-hidden antialiased">
      {/* Desktop Sidebar */}
      <aside 
        className={`bg-[var(--surface)] border-r border-[var(--border)] flex-col hidden md:flex shrink-0 z-[100] h-full relative transition-[width] duration-200 ease-out ${isSidebarExpanded ? 'w-64' : 'w-16'}`}
      >
        <div className="p-3 border-b border-[var(--border)] h-[73px] flex items-center gap-2 overflow-hidden">
          <button
            type="button"
            className="origin-left cursor-pointer rounded-md focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
            style={{ transform: isSidebarExpanded ? 'scale(0.9)' : 'scale(0.9) translateX(-4px)' }}
            onClick={() => setActiveTab('home')}
            aria-label="Go to home"
          >
             <BrandHeader expanded={isSidebarExpanded} />
          </button>
          <button
            type="button"
            onClick={() => setIsSidebarExpanded(v => !v)}
            className="ml-auto p-2 rounded-md border border-[var(--border)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
            aria-label={isSidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
            aria-expanded={isSidebarExpanded}
            title={isSidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>
        
        <div 
          className="flex-1 overflow-y-auto px-2 py-4 flex flex-col gap-1.5 scrollbar-none scroll-smooth touch-pan-y overflow-x-hidden"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className={`text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-[0.16em] px-2 py-1 mb-1 whitespace-nowrap overflow-hidden transition-all duration-300 ${isSidebarExpanded ? 'opacity-100' : 'opacity-0 h-0 py-0 mb-0 pointer-events-none'}`}>
            Main Views
          </div>

          {NAV_MAIN_VIEWS.map((it) => renderNavItem(it))}

          <div className={`text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-[0.16em] px-2 py-1 mt-4 mb-1 whitespace-nowrap overflow-hidden transition-all duration-300 ${isSidebarExpanded ? 'opacity-100' : 'opacity-0 h-0 py-0 mb-0 mt-0 pointer-events-none'}`}>
            Tools
          </div>

          {NAV_TOOLS.map((it) => renderNavItem(it))}

          <div className="mt-auto pt-4 flex flex-col gap-1.5 border-t border-[var(--border)]">
            {renderNavItem(NAV_SETTINGS)}
            {renderNavItem(NAV_ADMIN)}
          </div>
        </div>

        <div className={`p-4 border-t border-[var(--border)] bg-[var(--surface)] overflow-hidden whitespace-nowrap transition-[padding] duration-300 ${isSidebarExpanded ? 'px-4' : 'px-2'}`}>
           <div className={`flex mb-3 ${isSidebarExpanded ? 'justify-start px-1' : 'justify-center'}`}>
             <FeedPill status={feedStatus} compact={!isSidebarExpanded} />
           </div>
           {/* Tier Info — only for signed-in users. A guest must never see an owned plan
               ("Lifetime access") next to a "Log in" CTA; that read as fake/contradictory. */}
           {session?.authenticated && (
           <div
             role="button"
             tabIndex={0}
             onClick={onUpgradeClick}
             onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onUpgradeClick(); } }}
             aria-label={`${tierInfo?.label ?? 'Plan'} — manage plan`}
             style={{ borderRadius: 'var(--radius-control)' }}
             className={`flex items-center gap-2.5 px-3 py-2 mb-3 bg-[var(--surface-2)] border border-[var(--border)] cursor-pointer hover:border-[var(--border-strong)] transition-colors font-sans mx-auto focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none ${isSidebarExpanded ? 'w-full justify-start' : 'w-max justify-center'}`}
             title={!isSidebarExpanded ? tierInfo?.label : undefined}
           >
              <span className="relative flex h-2 w-2 shrink-0">
                <span className={`relative inline-flex rounded-full h-2 w-2 ${tierInfo?.dotColor}`}></span>
              </span>
              <div className={`flex flex-col text-left transition-all duration-300 ${isSidebarExpanded ? 'opacity-100 max-w-[200px]' : 'opacity-0 max-w-0 overflow-hidden'}`}>
                <span className="text-[12px] font-semibold tracking-wide text-[var(--text-primary)] truncate">{tierInfo?.label}</span>
                <span className="text-[12px] text-[var(--text-tertiary)] font-medium tracking-normal truncate">{tierInfo?.desc}</span>
              </div>
           </div>
           )}

           {session?.authenticated ? (
             <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 overflow-hidden flex-1">
                   <IdentityAvatar name={session.name} avatar={session.avatar} />
                   <span className={`text-[12px] font-semibold truncate text-[var(--text-tertiary)] transition-all duration-300 ${isSidebarExpanded ? 'opacity-100 max-w-[120px]' : 'opacity-0 max-w-0'}`}>{session.name}</span>
                </div>
                {isSidebarExpanded && (
                  <button onClick={onLogout} className="text-[var(--text-tertiary)] hover:text-[var(--warning)] transition-colors p-2 rounded focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none" title="Logout">
                    <LogOut className="w-4 h-4 shrink-0" />
                  </button>
                )}
             </div>
           ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                style={{ borderRadius: 'var(--radius-control)' }}
                className={`w-full px-3 py-2 border border-[var(--border)] hover:border-[var(--border-strong)] bg-[var(--surface)] text-[var(--success)] hover:text-[var(--text-primary)] font-semibold transition-colors flex items-center justify-center gap-1.5 text-[13px] cursor-pointer focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none ${isSidebarExpanded ? '' : 'px-0'}`}
                title="LOGIN"
              >
                {isSidebarExpanded ? 'Log in / create account' : <Lock className="w-4 h-4" />}
              </button>
           )}
        </div>
      </aside>

      {/* Mobile Nav */}
      <div className="md:hidden fixed top-0 left-0 w-full z-[100] bg-[var(--surface)] border-b border-[var(--border)] px-4 py-3 flex items-center justify-between">
         <div className="cursor-pointer scale-[0.85] origin-left" onClick={() => setActiveTab('home')}>
             <BrandHeader />
         </div>
         <div className="flex items-center gap-3">
           <FeedPill status={feedStatus} />
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

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative bg-[var(--surface)] md:pt-0 pt-[57px]">
        {children}
      </div>
    </div>
    </NavCtx.Provider>
  );
}
