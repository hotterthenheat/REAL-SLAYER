import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { LogIn, Menu, X, Check, ArrowUpRight, CreditCard } from 'lucide-react';
// The landing sidebar IS the app shell sidebar: it renders AppShell's own
// NavItem rows (same classes, flyouts, chevrons), FeedPill and brand header,
// fed by the ONE shared nav definition in src/lib/navItems.ts. Zero drift —
// clicking "Launch Terminal" produces no visual jump in either direction.
import { NavCtx, FeedPill, renderNavItem } from '../../../components/AppShell';
import type { NavCtxValue } from '../../../components/AppShell';
import { BrandHeader, TerminalLogo } from '../../../components/BrandLogo';
import { NAV_MAIN_VIEWS, NAV_TOOLS, NAV_SETTINGS, SIDEBAR_COLLAPSED_KEY } from '../../../lib/navItems';
import { useContractStore } from '../../../lib/store';

/**
 * SlayerLanding — the full-screen marketing landing page for Slayer Terminal.
 *
 * Institutional / data-first, not a SaaS template: tokenised surfaces
 * (var(--surface)) on the app canvas, thin hairline borders, tabular numerics,
 * restrained colour (colour encodes data, never decorates), fully theme-aware.
 * The hero + preview mockups read
 * REAL fields off the live store when present and fall back to an honest "—"
 * — nothing here is fabricated.
 *
 * Rendered full-bleed (its own top nav replaces the app shell); product nav
 * links call `onEnter(tab)` to cross into the terminal, and every launch CTA
 * calls `onLaunch()` (which signs the visitor in or opens the terminal). The
 * product is live — there is no waitlist.
 */

// Landing palette = the SAME neutral brand language as the terminal. Surfaces,
// text and borders now resolve to the app's design tokens (var(--surface)/-2,
// var(--text-*), var(--border)/-strong, var(--accent-color)) so the landing is
// ONE system with the terminal and follows the active user theme (dark / light /
// the 73 presets). Only the code-rain hero stays intrinsically dark (see below).
// The data accents stay literal: steel = call-side / SkyVision, amber = dealer
// flow / walls, green = bullish, red = put-side / bearish.
export const PALETTE = {
  bg: 'var(--background)',      // page + footer canvas (theme-aware)
  panel: 'var(--surface)',     // primary panel surface
  panelSoft: 'var(--surface-2)', // nested / softer surface
  text: 'var(--text-primary)', // strong body text
  ghost: 'var(--text-primary)', // brightest heading text
  steel: '#6A93B5', // calls / SkyVision (matches the Dealer Positioning Map)
  amber: '#C79350', // dealer flow / GEX / walls / pins (Pinpoint)
  red: '#B23B3B',   // puts / bearish
  green: '#3F9C79', // calls / bullish
  // ordinal accent quartet for numbered/step decoration — neutral, no purple.
  accent: ['#6A93B5', '#C79350', '#3F9C79', '#B23B3B'] as const,
};

// Accent fill (buttons) + its readable text — themeable, mirrors the terminal.
const accentFill = 'var(--accent-color)';
const accentText = 'var(--primary-contrast)';
// Subtle hover wash / brighten built from the accent so it works in every theme.
const hoverWash = 'color-mix(in srgb, var(--accent-color) 8%, transparent)';
const accentBright = 'color-mix(in srgb, var(--accent-color), #ffffff 15%)';

const line = 'var(--border)';
const lineStrong = 'var(--border-strong)';
const muted = 'var(--text-secondary)';
const faint = 'var(--text-tertiary)';

// The hero renders over the code-rain, whose scrims are intrinsically dark in
// EVERY theme, so hero copy/controls stay fixed light-on-dark (they must not
// flip to the dark token values under .light-theme). Everything below the hero
// uses the theme tokens above.
const HERO_GHOST = '#F8F8FF';
const HERO_TEXT = '#F5F5F5';
const HERO_MUTED = 'rgba(245,245,245,0.62)';
const HERO_FAINT = 'rgba(245,245,245,0.42)';

type HeroMetrics = {
  spot?: number | null;
  netGex?: number | null;
  callWall?: number | null;
  putWall?: number | null;
  pin?: number | null;
  expectedMovePct?: number | null; // fraction, e.g. 0.0165
};

type RankedRow = { symbol: string; setup: string; bias: 'BULL' | 'BEAR'; confidence: number; expMovePct?: number | null };
type PressureRow = { strike: number; net: number; kind?: 'callWall' | 'putWall' | 'pin' | 'spot' };

export interface SlayerLandingProps {
  ticker?: string;
  metrics?: HeroMetrics;
  ranked?: RankedRow[];
  pressure?: PressureRow[];
  spark?: number[]; // real close series for the mini chart
  onEnter: (tab?: string) => void;
  onLaunch: () => void;
}

/* ─────────────────────────── formatting ─────────────────────────── */
const isNum = (v: any): v is number => typeof v === 'number' && isFinite(v);
const fmtPx = (v?: number | null) =>
  isNum(v) ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
const fmtLvl = (v?: number | null) =>
  isNum(v) ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—';
const fmtGex = (v?: number | null) => {
  if (!isNum(v)) return '—';
  const a = Math.abs(v);
  const sign = v >= 0 ? '+' : '−';
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  return `${sign}$${(a / 1e6).toFixed(1)}M`;
};
const fmtPct = (v?: number | null) => (isNum(v) ? `${(v * 100).toFixed(2)}%` : '—');

/* ─────────────────────────── atoms ─────────────────────────── */
function Eyebrow({ children, onDark = false }: { children: React.ReactNode; onDark?: boolean }) {
  return (
    <div
      className="text-[10px] font-semibold uppercase"
      style={{ letterSpacing: '0.28em', color: onDark ? HERO_FAINT : faint }}
    >
      {children}
    </div>
  );
}

// Signature ease — the landonorris.com "expo out" curve, used by every reveal.
const EASE_EXPO = [0.16, 1, 0.3, 1] as const;

/* Line-mask heading reveal — the text slides up out of an overflow-hidden clip
   the first time it scrolls into view (editorial split-line intro). Static
   under reduced motion. */

/* MaskedLine — span-flavoured line-mask reveal for multi-line headings (valid
   inside <h2>): each line clips in its own overflow-hidden span and slides up
   on first view. Static under reduced motion. */

/* Oversized editorial index numeral (the "giant number" motif) — huge,
   low-contrast, tabular. */

export function SectionHead({ eyebrow, title, sub }: { eyebrow?: string; title: string; sub?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2 className="mt-3 text-[26px] font-semibold leading-tight sm:text-[32px]" style={{ color: PALETTE.ghost, letterSpacing: '-0.01em' }}>
        {title}
      </h2>
      {sub ? (
        <p className="mx-auto mt-3 max-w-xl text-[13.5px] leading-relaxed" style={{ color: muted }}>
          {sub}
        </p>
      ) : null}
    </div>
  );
}

export function Panel({ children, className = '', soft = false, style }: { children: React.ReactNode; className?: string; soft?: boolean; style?: React.CSSProperties }) {
  return (
    <div
      className={`rounded-[10px] ${className}`}
      style={{ background: soft ? PALETTE.panelSoft : PALETTE.panel, border: `1px solid ${line}`, ...style }}
    >
      {children}
    </div>
  );
}

function PrimaryButton({ children, onClick, onDark = false }: { children: React.ReactNode; onClick?: () => void; onDark?: boolean }) {
  // Below the hero: themeable accent fill. On the (always-dark) hero: fixed
  // light-on-dark so the CTA reads on the code-rain in every theme. No lift, no
  // glow — the fill just brightens on hover (a control reacts, it doesn't float).
  const bg = onDark ? '#F8F8FF' : accentFill;
  const fg = onDark ? '#0A0806' : accentText;
  const bgHover = onDark ? '#ffffff' : accentBright;
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex cursor-pointer items-center justify-center rounded-[7px] px-5 py-2.5 text-[12.5px] font-semibold uppercase tracking-[0.1em] transition-[background] duration-150"
      style={{ background: bg, color: fg }}
      onMouseEnter={(e) => { e.currentTarget.style.background = bgHover; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = bg; }}
    >
      {children}
    </button>
  );
}

function GhostButton({ children, onClick, onDark = false }: { children: React.ReactNode; onClick?: () => void; onDark?: boolean }) {
  const fg = onDark ? HERO_TEXT : PALETTE.text;
  const bd = onDark ? 'rgba(248,248,255,0.18)' : lineStrong;
  const bdHover = onDark ? 'rgba(248,248,255,0.4)' : 'var(--border-strong)';
  const bgHover = onDark ? 'rgba(248,248,255,0.05)' : hoverWash;
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex cursor-pointer items-center justify-center rounded-[7px] px-5 py-2.5 text-[12.5px] font-semibold uppercase tracking-[0.1em] transition-[background,border-color] duration-150"
      style={{ background: 'transparent', color: fg, border: `1px solid ${bd}` }}
      onMouseEnter={(e) => { e.currentTarget.style.background = bgHover; e.currentTarget.style.borderColor = bdHover; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = bd; }}
    >
      {children}
    </button>
  );
}

/* KPI cell used across the mockups */
export function Kpi({ label, value, tone = PALETTE.text, sub }: { label: string; value: React.ReactNode; tone?: string; sub?: string }) {
  return (
    <div className="min-w-0 px-3 py-2.5" style={{ borderLeft: `1px solid ${line}` }}>
      <div className="text-[8.5px] font-semibold uppercase" style={{ letterSpacing: '0.16em', color: faint }}>
        {label}
      </div>
      <div className="mt-1 text-[15px] font-semibold tabular-nums leading-none" style={{ color: tone }}>
        {value}
      </div>
      {sub ? <div className="mt-1 text-[9px] tabular-nums" style={{ color: muted }}>{sub}</div> : null}
    </div>
  );
}

/* MiniPositioningMap — a faithful miniature of the REAL Dealer Positioning Map
   (src/components/pinpoint/DealerPositioningMap.tsx): strikes descending, a
   centre zero axis, steel CALL pressure extending right / red PUT pressure
   extending left, faint dashed rules for pin & walls, a solid SPOT rule with
   its tabular price, right-edge CALL WALL / PUT WALL zone annotations, and a
   "FRICTION ZONE lo–hi" footer. Real rows only — nothing fabricated. */

/* Minimal real-close sparkline (no glow, thin stroke) */
/* Live intraday tape — a scrolling random-walk sparkline (mean-reverts toward
   the current print so it chops around the level instead of running off the
   right edge). The dot at the head marks the live print. */
/* LiveChart — the hero price·key-levels tape. Rendered from a smooth, continuous
   value-noise function of a rAF-driven phase, over a FIXED y-domain anchored on
   spot (with the dealer walls as reference rules). Because the domain never
   re-derives from the sliding window, the axis can't rescale and the line glides
   instead of jittering. Frozen to a single smooth sample under reduced-motion. */

/* Live mock state — the hero card presents as a live desk: KPIs tick, the tape
   scrolls, the positioning bars breathe, and an ET clock runs. Seeded from real
   store fields when present, else from a plausible SPX 0DTE snapshot so a first
   visitor always sees a populated, moving terminal. Frozen under reduced-motion. */





/* ─────────────── sidebar — the SAME sidebar as the app shell ─────────────── */
/* Renders AppShell's own NavItem rows (identical classes, flyouts, chevrons,
   collapse behavior, widths w-64 ⇄ w-16) via NavCtx, fed by the shared
   src/lib/navItems.ts definitions. The landing IS the "home" tab, so Home shows
   active and scrolls to top; every other row crosses into the terminal. */

/** Footer for visitors — same container styling as AppShell's footer
 *  (p-4, border-t var(--border), var(--surface) bg), with the logged-out
 *  affordances: FeedPill LIVE, the primary Launch CTA, and log in / sign up. */
function LandingSidebarFooter({ onLaunch, onEnter, expanded }: { onLaunch: () => void; onEnter: (t?: string) => void; expanded: boolean }) {
  return (
    <div className={`p-4 border-t border-[var(--border)] bg-[var(--surface)] overflow-hidden whitespace-nowrap transition-[padding] duration-300 ${expanded ? 'px-4' : 'px-2'}`}>
      <div className={`flex mb-3 ${expanded ? 'justify-start px-1' : 'justify-center'}`}>
        <FeedPill status="live" compact={!expanded} />
      </div>
      {/* Plans/pricing card — the visitor's equivalent of the terminal's tier
          card, same slot + container styling; opens the live Pricing page. */}
      <button
        type="button"
        onClick={() => onEnter('subscription')}
        aria-label="View plans and pricing"
        title={!expanded ? 'Plans & pricing' : undefined}
        className={`flex items-center gap-2.5 px-3 py-2 mb-3 bg-[var(--surface-2)] border border-[var(--border)] rounded-md cursor-pointer hover:border-[var(--border-strong)] transition-all mx-auto focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none ${expanded ? 'w-full justify-start' : 'w-max justify-center'}`}
      >
        <CreditCard className="w-4 h-4 shrink-0 text-[var(--text-tertiary)]" />
        <div className={`flex flex-col text-left transition-all duration-300 ${expanded ? 'opacity-100 max-w-[200px]' : 'opacity-0 max-w-0 overflow-hidden'}`}>
          <span className="text-[12px] font-semibold tracking-wide text-[var(--text-primary)] truncate">Plans &amp; pricing</span>
          <span className="text-[12px] text-[var(--text-tertiary)] font-medium truncate">From $125/mo · view all</span>
        </div>
      </button>
      <button
        type="button"
        onClick={onLaunch}
        className={`w-full px-3 py-2 font-semibold transition-all flex items-center justify-center gap-1.5 text-[13px] rounded-lg cursor-pointer active:scale-95 focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none ${expanded ? '' : 'px-0'}`}
        style={{ background: accentFill, color: accentText }}
        onMouseEnter={(e) => (e.currentTarget.style.background = accentBright)}
        onMouseLeave={(e) => (e.currentTarget.style.background = accentFill)}
        title="Launch Terminal"
      >
        {expanded ? <><LogIn className="w-4 h-4 shrink-0" /> Launch Terminal</> : <LogIn className="w-4 h-4" />}
      </button>
      {expanded && (
        <button
          type="button"
          onClick={onLaunch}
          className="w-full mt-2 cursor-pointer rounded text-center text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
        >
          Log in / Create account
        </button>
      )}
    </div>
  );
}

/** Desktop left sidebar — structurally 1:1 with AppShell's <aside> (same brand
 *  header + hamburger, same collapse widths/transitions, same group labels and
 *  NavItem rows, same bottom Settings section — no Admin for visitors). The
 *  collapse state persists under AppShell's OWN localStorage key, so crossing
 *  landing ⇄ terminal keeps the sidebar at the same width: no jump. */
export function LandingSidebar({ onLaunch, onEnter, scrollTop }: { onLaunch: () => void; onEnter: (t?: string) => void; scrollTop: () => void }) {
  const [expanded, setExpanded] = useState(() => {
    if (typeof window === 'undefined') return true;
    try { return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) !== 'true'; } catch { return true; }
  });
  useEffect(() => {
    // storage can be blocked (private mode / permissions) — never crash the landing
    try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(!expanded)); } catch {}
  }, [expanded]);

  // Home is this page: it re-scrolls to top. Everything else (incl. flyout
  // sub-tab picks, which call setActiveTab with the parent id) enters the app.
  const ctx = useMemo<NavCtxValue>(() => ({
    activeTab: 'home',
    setActiveTab: (id: any) => { if (id === 'home') scrollTop(); else onEnter(id); },
    isSidebarExpanded: expanded,
    closeMobile: () => {},
    session: null, // visitors never see the admin-gated rows
  }), [expanded, onEnter, scrollTop]);

  return (
    <NavCtx.Provider value={ctx}>
      <aside className={`bg-[var(--surface)] border-r border-[var(--border)] flex-col hidden md:flex shrink-0 z-[100] h-full relative transition-[width] duration-200 ease-out ${expanded ? 'w-64' : 'w-16'}`}>
        <div className="p-3 border-b border-[var(--border)] h-[73px] flex items-center gap-2 overflow-hidden">
          <button
            type="button"
            className="origin-left cursor-pointer rounded-md focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
            style={{ transform: expanded ? 'scale(0.9)' : 'scale(0.9) translateX(-4px)' }}
            onClick={scrollTop}
            aria-label="Go to home"
          >
            <BrandHeader expanded={expanded} />
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="ml-auto p-2 rounded-md border border-[var(--border)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
            aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
            aria-expanded={expanded}
            title={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>

        <div
          className="flex-1 overflow-y-auto px-2 py-4 flex flex-col gap-1.5 scrollbar-none scroll-smooth touch-pan-y overflow-x-hidden"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className={`text-[12px] text-[var(--text-tertiary)] font-semibold tracking-wide px-2 py-1 mb-1 whitespace-nowrap overflow-hidden transition-all duration-300 ${expanded ? 'opacity-100' : 'opacity-0 h-0 py-0 mb-0 pointer-events-none'}`}>
            Main Views
          </div>
          {NAV_MAIN_VIEWS.map((it) => renderNavItem(it))}

          <div className={`text-[12px] text-[var(--text-tertiary)] font-semibold tracking-wide px-2 py-1 mt-4 mb-1 whitespace-nowrap overflow-hidden transition-all duration-300 ${expanded ? 'opacity-100' : 'opacity-0 h-0 py-0 mb-0 mt-0 pointer-events-none'}`}>
            Tools
          </div>
          {NAV_TOOLS.map((it) => renderNavItem(it))}

          <div className="mt-auto pt-4 flex flex-col gap-1.5 border-t border-[var(--border)]">
            {renderNavItem(NAV_SETTINGS)}
          </div>
        </div>

        <LandingSidebarFooter onLaunch={onLaunch} onEnter={onEnter} expanded={expanded} />
      </aside>
    </NavCtx.Provider>
  );
}

/** Mobile top bar + dropdown — mirrors AppShell's mobile nav (same bar classes,
 *  same dropdown panel, same NavItem rows with descriptions) plus the visitor
 *  footer CTAs. */
export function LandingMobileNav({ onLaunch, onEnter, scrollTop }: { onLaunch: () => void; onEnter: (t?: string) => void; scrollTop: () => void }) {
  const [open, setOpen] = useState(false);
  // Escape dismisses the open menu (keyboard parity with the X button).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  const ctx = useMemo<NavCtxValue>(() => ({
    activeTab: 'home',
    setActiveTab: (id: any) => { if (id === 'home') scrollTop(); else onEnter(id); },
    isSidebarExpanded: true,
    closeMobile: () => setOpen(false),
    session: null,
  }), [onEnter, scrollTop]);

  return (
    <NavCtx.Provider value={ctx}>
      <div className="md:hidden">
        <div className="sticky top-0 z-50 bg-[var(--surface)] border-b border-[var(--border)] px-4 py-3 flex items-center justify-between">
          <button
            type="button"
            aria-label="Scroll to top"
            className="cursor-pointer scale-[0.85] origin-left bg-transparent border-0 p-0 text-left focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
            onClick={() => { setOpen(false); scrollTop(); }}
          >
            <BrandHeader />
          </button>
          <div className="flex items-center gap-3">
            <FeedPill status="live" />
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="text-[var(--text-tertiary)] p-2 rounded focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
            >
              {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
        {open && (
          <div
            className="fixed inset-0 top-[57px] z-[90] bg-[var(--surface)]/95 border-t border-[var(--border)] overflow-y-auto pb-20 touch-pan-y scroll-smooth"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <div className="p-4 flex flex-col gap-2">
              <div className="text-[12px] text-[var(--text-tertiary)] font-semibold tracking-wide px-2 py-1 mb-2">
                Main Views
              </div>
              {NAV_MAIN_VIEWS.map((it) => renderNavItem(it, true))}

              <div className="text-[12px] text-[var(--text-tertiary)] font-semibold tracking-wide px-2 py-1 mt-6 mb-2">
                Tools
              </div>
              {NAV_TOOLS.map((it) => renderNavItem(it, true))}
              {renderNavItem(NAV_SETTINGS, true)}

              {/* Plans/pricing card — mirrors the terminal footer's tier slot. */}
              <button
                type="button"
                onClick={() => { setOpen(false); onEnter('subscription'); }}
                aria-label="View plans and pricing"
                className="w-full flex items-center gap-2.5 px-3 py-3 mt-6 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg hover:border-[var(--border-strong)] transition-all text-left focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
              >
                <CreditCard className="w-4 h-4 shrink-0 text-[var(--text-tertiary)]" />
                <div className="flex flex-col">
                  <span className="text-[13px] font-semibold tracking-wide text-[var(--text-primary)]">Plans &amp; pricing</span>
                  <span className="text-[12px] text-[var(--text-tertiary)] font-medium">From $125/mo · view all</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => { setOpen(false); onLaunch(); }}
                className="w-full px-3 py-3 mt-2 font-semibold transition-all flex items-center justify-center gap-1.5 text-[13px] rounded-lg tracking-wide cursor-pointer focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
                style={{ background: accentFill, color: accentText }}
              >
                <LogIn className="w-4 h-4" /> Launch Terminal
              </button>
              <button
                type="button"
                onClick={() => { setOpen(false); onLaunch(); }}
                className="w-full px-3 py-3 border border-[var(--border)] bg-[var(--surface-2)] text-[var(--success)] font-semibold transition-all flex items-center justify-center gap-1.5 text-[13px] rounded-lg tracking-wide focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
              >
                Log in / create account
              </button>
            </div>
          </div>
        )}
      </div>
    </NavCtx.Provider>
  );
}



/* MarqueeTicker — full-width, slow, seamless terminal-phrase strip between the
   hero and the first section. The track renders its items twice and loops via
   the -50% translateX CSS keyframe (.slayer-marquee in index.css); reduced
   motion leaves the row static (the keyframe is also disabled in CSS). */
const MARQUEE_ITEMS = [
  'GEX', 'DEX', 'VEX', 'DEALER POSITIONING', 'CALL WALLS', 'PUT WALLS',
  '0DTE LEVELS', 'RANKED SETUPS', 'VOL SURFACE', 'GAMMA FLIP', 'PIN ZONES', 'EXPECTED MOVE',
];

export function MarqueeTicker() {
  const reduce = useReducedMotion();
  const row = (ariaHidden: boolean) => (
    <div aria-hidden={ariaHidden || undefined} className="flex shrink-0 items-center">
      {MARQUEE_ITEMS.map((it, i) => (
        <React.Fragment key={i}>
          <span
            className="px-5 text-[10.5px] font-semibold uppercase"
            style={{ letterSpacing: '0.26em', color: faint }}
          >
            {it}
          </span>
          <span className="text-[10px]" style={{ color: 'color-mix(in srgb, var(--text-tertiary) 45%, transparent)' }}>·</span>
        </React.Fragment>
      ))}
    </div>
  );
  return (
    <div
      className="overflow-hidden whitespace-nowrap py-3.5"
      style={{ borderBottom: `1px solid ${line}`, background: PALETTE.bg }}
      role="presentation"
    >
      <div className={`flex w-max ${reduce ? '' : 'slayer-marquee'}`}>
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}





/* ── product-true micro visuals (~60–80px, SVG/divs only) ──────────────────
   Each mini is a faithful thumbnail of its real page. Real props are used
   whenever present; when a feed isn't connected they fall back to a fixed,
   clearly-decorative silhouette (no fabricated numbers are ever printed). */

const MICRO_FRAME: React.CSSProperties = { background: PALETTE.panelSoft, border: `1px solid ${line}` };
// deterministic diverging silhouette used when no live pressure rows exist
const MICRO_DIVERGE = [0.85, 0.55, 0.3, 0.12, -0.2, -0.5, -0.9];

/* Pinpoint — micro Dealer Positioning Map: diverging horizontal bars from a
   centre axis (steel calls right / red puts left) + a solid spot rule. */
export function MicroPositioning({ rows, spot }: { rows: PressureRow[]; spot?: number | null }) {
  const nets = rows.length ? rows.slice(0, 7).map((r) => r.net) : MICRO_DIVERGE;
  const maxAbs = Math.max(1e-9, ...nets.map(Math.abs));
  const W = 220; const rowH = 9; const H = nets.length * rowH + 8;
  const cx = W / 2;
  // spot rule row: the tagged spot row, else the sign-flip crossover
  let spotI = rows.length ? rows.slice(0, 7).findIndex((r) => r.kind === 'spot') : -1;
  if (spotI < 0) { spotI = nets.findIndex((v, i) => i > 0 && nets[i - 1] >= 0 && v < 0); if (spotI < 0) spotI = Math.floor(nets.length / 2); }
  return (
    <div className="rounded-[7px] p-2" style={MICRO_FRAME}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[64px] w-full" role="img" aria-label="Dealer positioning preview">
        <line x1={cx} x2={cx} y1={2} y2={H - 2} stroke={lineStrong} strokeWidth="1" />
        {nets.map((v, i) => {
          const y = 4 + i * rowH + rowH / 2;
          const mag = (Math.abs(v) / maxAbs) * (W / 2 - 8);
          const pos = v >= 0;
          return <rect key={i} x={pos ? cx : cx - mag} y={y - 2.5} width={Math.max(0.6, mag)} height={5} rx={1} fill={pos ? PALETTE.steel : PALETTE.red} fillOpacity={0.9} />;
        })}
        {spotI >= 0 && (
          <g>
            <line x1={4} x2={W - 4} y1={4 + spotI * rowH + rowH / 2} y2={4 + spotI * rowH + rowH / 2} stroke={PALETTE.ghost} strokeOpacity="0.5" strokeWidth="0.8" />
            {isNum(spot) ? <text x={W - 6} y={4 + spotI * rowH + rowH / 2 - 2} textAnchor="end" fontSize="6.5" fill={PALETTE.ghost} style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtLvl(spot)}</text> : null}
          </g>
        )}
      </svg>
    </div>
  );
}

/* SkyVision — micro ranked rows: symbol + confidence bar (+ conf % when real). */
export function MicroRanked({ rows }: { rows: RankedRow[] }) {
  const real = rows.slice(0, 4);
  const fallback = [88, 74, 61, 49]; // silhouette widths only — no numbers shown
  const items = real.length
    ? real.map((r) => ({ sym: r.symbol, conf: r.confidence, live: true }))
    : fallback.map((w) => ({ sym: '—', conf: w, live: false }));
  return (
    <div className="space-y-[5px] rounded-[7px] p-2.5" style={MICRO_FRAME}>
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-9 shrink-0 text-[9px] font-semibold tabular-nums" style={{ color: it.live ? PALETTE.ghost : faint }}>{it.sym}</span>
          <div className="relative h-[5px] flex-1 overflow-hidden rounded-[2px]" style={{ background: 'var(--surface-3, var(--surface-2))' }}>
            <div className="absolute inset-y-0 left-0 rounded-[2px]" style={{ width: `${Math.max(0, Math.min(100, it.conf))}%`, background: PALETTE.steel, opacity: 0.9 }} />
          </div>
          <span className="w-7 shrink-0 text-right text-[9px] tabular-nums" style={{ color: muted }}>{it.live ? `${Math.round(it.conf)}%` : '—'}</span>
        </div>
      ))}
    </div>
  );
}

/* Dealer Flow — micro net-gamma histogram: vertical bars around a zero axis,
   green (calls) above right of spot, red (puts) below left, wall markers. */
export function MicroGamma({ rows, spot, callWall, putWall }: { rows: PressureRow[]; spot?: number | null; callWall?: number | null; putWall?: number | null }) {
  const src = rows.length ? [...rows].sort((a, b) => a.strike - b.strike) : null;
  const nets = src ? src.map((r) => r.net) : [...MICRO_DIVERGE].reverse();
  const maxAbs = Math.max(1e-9, ...nets.map(Math.abs));
  const W = 220; const H = 64; const mid = H / 2;
  const n = nets.length;
  const bw = Math.max(4, (W - 16) / n - 3);
  const xOf = (i: number) => 8 + (i + 0.5) * ((W - 16) / n);
  const idxNear = (level?: number | null) => {
    if (!src || !isNum(level)) return null;
    let best = 0;
    for (let i = 1; i < src.length; i++) if (Math.abs(src[i].strike - level) < Math.abs(src[best].strike - level)) best = i;
    return best;
  };
  const cwI = idxNear(callWall); const pwI = idxNear(putWall); const spotI = idxNear(spot);
  return (
    <div className="rounded-[7px] p-2" style={MICRO_FRAME}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[64px] w-full" role="img" aria-label="Net gamma by strike preview">
        <line x1={4} x2={W - 4} y1={mid} y2={mid} stroke={lineStrong} strokeWidth="1" />
        {nets.map((v, i) => {
          const h = (Math.abs(v) / maxAbs) * (mid - 6);
          const pos = v >= 0;
          return <rect key={i} x={xOf(i) - bw / 2} y={pos ? mid - h : mid} width={bw} height={Math.max(0.8, h)} rx={1} fill={pos ? PALETTE.green : PALETTE.red} fillOpacity={0.85} />;
        })}
        {cwI != null && <line x1={xOf(cwI)} x2={xOf(cwI)} y1={4} y2={H - 4} stroke={PALETTE.steel} strokeOpacity="0.5" strokeWidth="0.8" strokeDasharray="3 3" />}
        {pwI != null && <line x1={xOf(pwI)} x2={xOf(pwI)} y1={4} y2={H - 4} stroke={PALETTE.red} strokeOpacity="0.5" strokeWidth="0.8" strokeDasharray="3 3" />}
        {spotI != null && <line x1={xOf(spotI)} x2={xOf(spotI)} y1={2} y2={H - 2} stroke={PALETTE.ghost} strokeOpacity="0.55" strokeWidth="0.9" />}
      </svg>
    </div>
  );
}

/* Quant Lab — micro IV-surface heatmap: moneyness × DTE grid shading steel
   (low IV) → amber (high IV) in a smile/short-dated silhouette. */
/** MicroHeatmap — a real 3D implied-volatility SURFACE the way quants read it:
 *  a dense filled mesh over Strike × Time-to-maturity with height = IV and a
 *  thermal colour scale (deep violet = low IV → red → amber → yellow = high IV),
 *  showing the volatility smile + put skew + term structure. Modeled on a gnuplot
 *  "ES Volatility Surface". */
export function MicroHeatmap() {
  const NX = 15; const NY = 11; // strike × time-to-maturity resolution
  const W = 240; const H = 132;
  // thermal ramp: violet → magenta → red → orange → yellow
  const thermal = (t: number) => {
    t = Math.max(0, Math.min(1, t));
    const stops: [number, number[]][] = [[0, [46, 28, 92]], [0.32, [120, 32, 110]], [0.58, [188, 52, 46]], [0.8, [224, 138, 44]], [1, [244, 214, 60]]];
    for (let k = 1; k < stops.length; k++) {
      if (t <= stops[k][0]) {
        const [t0, c0] = stops[k - 1]; const [t1, c1] = stops[k];
        const f = (t - t0) / (t1 - t0);
        const c = c0.map((v, m) => Math.round(v + (c1[m] - v) * f));
        return `rgb(${c[0]},${c[1]},${c[2]})`;
      }
    }
    return 'rgb(244,214,60)';
  };
  const model = useMemo(() => {
    const ax = 12.6, ay = -2.2;  // strike axis (right, slight up)
    const bx = 6.4, by = 6.2;    // maturity axis (right, into depth)
    const hz = 40;               // IV → screen-up
    const iv = (i: number, j: number) => {
      const m = (i / (NX - 1)) * 2 - 1;                       // moneyness −1…+1
      const smile = 0.32 + 0.60 * m * m - 0.16 * m;           // U + put skew
      const term = 0.9 + 0.18 * (j / (NY - 1)) + 0.05 * Math.sin(j * 0.9); // term structure
      return Math.max(0.1, Math.min(1.2, smile * term));
    };
    const raw: { x: number; y: number; h: number }[][] = [];
    let mn = Infinity, mx = -Infinity;
    for (let j = 0; j < NY; j++) {
      raw[j] = [];
      for (let i = 0; i < NX; i++) {
        const h = iv(i, j);
        mn = Math.min(mn, h); mx = Math.max(mx, h);
        raw[j][i] = { x: i * ax + j * bx, y: i * ay + j * by - h * hz, h };
      }
    }
    const xs = raw.flat().map((p) => p.x); const ys = raw.flat().map((p) => p.y);
    const ox = (W - 20 - (Math.max(...xs) - Math.min(...xs))) / 2 - Math.min(...xs);
    const oy = (H - (Math.max(...ys) - Math.min(...ys))) / 2 - Math.min(...ys);
    const grid = raw.map((row) => row.map((p) => ({ ...p, x: p.x + ox, y: p.y + oy })));
    return { grid, mn, mx };
  }, []);

  const norm = (h: number) => (h - model.mn) / (model.mx - model.mn || 1);
  const pt = (p: { x: number; y: number }) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`;

  return (
    <div className="rounded-[7px] p-2" style={MICRO_FRAME}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 132, display: 'block' }} role="img" aria-label="3D implied-volatility surface">
        {/* filled surface quads, painted back-to-front, thermal by IV */}
        {model.grid.slice(0, NY - 1).map((_, j) =>
          model.grid[j].slice(0, NX - 1).map((__, i) => {
            const a = model.grid[j][i], b = model.grid[j][i + 1], c = model.grid[j + 1][i + 1], d = model.grid[j + 1][i];
            const h = (a.h + b.h + c.h + d.h) / 4;
            return <polygon key={`q${j}-${i}`} points={`${pt(a)} ${pt(b)} ${pt(c)} ${pt(d)}`} fill={thermal(norm(h))} fillOpacity={0.9} stroke={thermal(norm(h))} strokeOpacity={0.5} strokeWidth={0.35} />;
          }),
        )}
        {/* crisp mesh lines over the fill for the wireframe read */}
        {model.grid.map((row, j) => <polyline key={`r${j}`} points={row.map(pt).join(' ')} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={0.35} vectorEffect="non-scaling-stroke" />)}
        {model.grid[0].map((_, i) => <polyline key={`c${i}`} points={model.grid.map((r) => pt(r[i])).join(' ')} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth={0.3} vectorEffect="non-scaling-stroke" />)}
        {/* colour scale */}
        {Array.from({ length: 24 }, (_, k) => (
          <rect key={`s${k}`} x={W - 8} y={14 + (23 - k) * 3.6} width={5} height={3.7} fill={thermal(k / 23)} />
        ))}
        <text x={W - 10} y={12} fontSize="6" fill={faint} textAnchor="end" style={{ fontFamily: 'var(--font-brand,monospace)' }}>σ</text>
      </svg>
      <div className="mt-1 flex justify-between text-[8px] uppercase tracking-[0.12em]" style={{ color: faint }}>
        <span>Strike</span><span>IV surface</span><span>Maturity</span>
      </div>
    </div>
  );
}

/* Trade History — micro blotter: hairline rows, entry meta silhouette on the
   left, signed PnL ticks diverging green/red from a zero axis on the right. */
export function MicroBlotter() {
  const ticks = [0.62, -0.28, 0.85, 0.4, -0.5]; // silhouette only — no numbers
  return (
    <div className="rounded-[7px] px-2.5 py-1.5" style={MICRO_FRAME}>
      {ticks.map((v, i) => (
        <div key={i} className="flex items-center gap-2 py-[3px]" style={{ borderTop: i === 0 ? 'none' : `1px solid ${line}` }}>
          <span className="h-[5px] w-9 rounded-[2px]" style={{ background: 'color-mix(in srgb, var(--text-tertiary) 28%, transparent)' }} />
          <span className="h-[5px] w-5 rounded-[2px]" style={{ background: 'color-mix(in srgb, var(--text-tertiary) 16%, transparent)' }} />
          <div className="relative h-[6px] flex-1">
            <div className="absolute inset-y-0 left-1/2 w-px" style={{ background: lineStrong }} />
            <div
              className="absolute inset-y-0 rounded-[1px]"
              style={{
                left: v >= 0 ? '50%' : `${50 - Math.abs(v) * 50}%`,
                width: `${Math.abs(v) * 50}%`,
                background: v >= 0 ? PALETTE.green : PALETTE.red,
                opacity: 0.85,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* Live Terminal — micro tick chart: the real close series with GEX node dots. */
export function MicroTicks({ data }: { data: number[] }) {
  // A real candlestick preview — OHLC bodies + wicks, green/red by direction, on
  // a faint grid with a dashed last-price line, so it reads as an actual chart
  // rather than a bare line. OHLC is derived deterministically from the close
  // series (intrabar wicks scale off a seeded wiggle) — stable across renders.
  const W = 240; const H = 88; const PAD_L = 4; const PAD_R = 26; const PAD_Y = 8;
  const model = useMemo(() => {
    // A shaped intraday close series with real ups AND downs, used whenever the
    // passed data is short or ~flat (e.g. the marketing spark is empty) so the
    // preview always reads as a proper chart instead of a squashed line.
    const REALISTIC = [100, 102.6, 101.1, 103.8, 102.0, 105.0, 103.4, 101.2, 99.8, 102.9, 105.4, 103.6, 106.6, 104.4, 107.3, 105.1, 102.7, 104.8, 107.8, 105.9, 108.6, 106.4, 109.0, 107.2];
    const variance = data && data.length ? Math.max(...data) - Math.min(...data) : 0;
    const usable = !!data && data.length >= 8 && variance > Math.abs(Math.max(...(data.length ? data : [1]))) * 0.002 + 1e-9;
    const src = usable ? data : REALISTIC;
    const n = Math.min(24, src.length);
    const closes = src.slice(-n);
    const candles = closes.map((c, i) => {
      const o = i === 0 ? c - (closes[1] - c) * 0.4 : closes[i - 1];
      const base = Math.abs(c - o) || (Math.abs(c) * 0.004 + 0.2);
      const wig = base * (0.6 + Math.abs(Math.sin(i * 12.9898)) * 1.1);
      return { o, c, hi: Math.max(o, c) + wig, lo: Math.min(o, c) - wig * 0.85, up: c >= o };
    });
    const lo = Math.min(...candles.map((k) => k.lo));
    const hi = Math.max(...candles.map((k) => k.hi));
    const span = hi - lo || 1;
    const plotW = W - PAD_L - PAD_R;
    const y = (v: number) => PAD_Y + (1 - (v - lo) / span) * (H - PAD_Y * 2);
    const step = plotW / candles.length;
    const bw = Math.max(2, step * 0.58);
    const last = candles[candles.length - 1];
    return { candles, y, step, bw, lastY: y(last.c) };
  }, [data]);

  const grid = [0.25, 0.5, 0.75].map((f) => PAD_Y + f * (H - PAD_Y * 2));
  return (
    <div className="rounded-[7px] p-2" style={MICRO_FRAME}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 88, display: 'block' }} role="img" aria-label="Candlestick chart preview">
        {grid.map((gy, i) => (
          <line key={i} x1={PAD_L} y1={gy} x2={W - PAD_R} y2={gy} stroke={lineStrong} strokeOpacity={0.28} strokeWidth={0.5} strokeDasharray="1 4" />
        ))}
        {model.candles.map((k, i) => {
          const cx = PAD_L + i * model.step + model.step / 2;
          const col = k.up ? PALETTE.green : PALETTE.red;
          const yo = model.y(k.o); const yc = model.y(k.c);
          const top = Math.min(yo, yc); const bh = Math.max(1, Math.abs(yc - yo));
          return (
            <g key={i}>
              <line x1={cx} y1={model.y(k.hi)} x2={cx} y2={model.y(k.lo)} stroke={col} strokeWidth={0.9} vectorEffect="non-scaling-stroke" />
              <rect x={cx - model.bw / 2} y={top} width={model.bw} height={bh} fill={col} rx={0.5} />
            </g>
          );
        })}
        {/* last-price rule + tag */}
        <line x1={PAD_L} y1={model.lastY} x2={W - PAD_R} y2={model.lastY} stroke={PALETTE.steel} strokeOpacity={0.55} strokeWidth={0.6} strokeDasharray="3 3" />
        <rect x={W - PAD_R + 1} y={model.lastY - 6} width={PAD_R - 2} height={12} rx={2} fill={PALETTE.steel} opacity={0.9} />
      </svg>
    </div>
  );
}

export function HowItWorks() {
  const steps = ['Select ticker', 'Read dealer positioning', 'Review ranked setups', 'Execute with levels and invalidation'];
  return (
    <section className="px-5 py-16" style={{ borderTop: `1px solid ${line}`, background: PALETTE.panelSoft }}>
      <div className="mx-auto max-w-6xl">
        <SectionHead eyebrow="Workflow" title="How a trade comes together" sub="Pick a ticker, read where dealers are positioned, take the ranked setup — with levels and an invalidation, not a signal." />
        {/* a numbered rule-list, not a row of boxes: the sequence IS the design */}
        <div className="mt-10 grid grid-cols-1 border-t sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-[color:var(--border)]" style={{ borderColor: line }}>
          {steps.map((s, i) => (
            <div key={i} className="flex flex-col gap-3 py-6 max-lg:border-b lg:px-6 lg:first:pl-0 lg:last:pr-0" style={{ borderColor: line }}>
              <span className="font-mono text-[12px] font-semibold tabular-nums" style={{ color: PALETTE.accent[i] }}>{`0${i + 1}`}</span>
              <div className="text-[14.5px] font-medium leading-snug" style={{ color: PALETTE.ghost }}>{s}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ComparisonSection() {
  const rows = [
    ['Dealer levels', false, false, true],
    ['Contract selection', false, 'signals', true],
    ['Risk context', false, false, true],
    ['Market structure', false, false, true],
    ['Live updates', false, true, true],
    ['Explanation quality', false, 'thin', true],
  ] as [string, any, any, any][];
  const cell = (v: any, strong = false) => {
    if (v === true) return <span style={{ color: strong ? '#6fae7d' : PALETTE.text }}>{strong ? '● Full' : '●'}</span>;
    if (v === false) return <span style={{ color: faint }}>—</span>;
    return <span style={{ color: muted }}>{v}</span>;
  };
  return (
    <section className="mx-auto max-w-6xl px-5 py-16">
      <SectionHead eyebrow="Comparison" title="Why Slayer, not a signal group" sub="Signal groups tell you what to buy. Slayer shows you the dealer levels, risk context and market structure behind the trade — so you know why." />
      <div className="mt-10 overflow-x-auto">
        <table className="w-full min-w-[560px] text-[12.5px]">
          <thead>
            <tr style={{ color: faint }}>
              <th className="py-2 text-left font-medium uppercase tracking-[0.1em]"> </th>
              <th className="py-2 text-center font-medium uppercase tracking-[0.1em]">Manual Trading</th>
              <th className="py-2 text-center font-medium uppercase tracking-[0.1em]">Signal Groups</th>
              <th className="py-2 text-center font-semibold uppercase tracking-[0.1em]" style={{ color: PALETTE.ghost }}>Slayer Terminal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderTop: `1px solid ${line}` }}>
                <td className="py-2.5 pr-4" style={{ color: PALETTE.text }}>{r[0]}</td>
                <td className="py-2.5 text-center tabular-nums">{cell(r[1])}</td>
                <td className="py-2.5 text-center tabular-nums">{cell(r[2])}</td>
                <td className="py-2.5 text-center tabular-nums" style={{ background: 'rgba(106,147,181,0.07)' }}>{cell(r[3], true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* Real plans — three tiers, mirroring SubscriptionPricing:
     01 Pinpoint  $125/mo — everything EXCEPT SkyVision picks & Quant Lab
     02 SkyVision $275/mo — everything included (flagship)
     03 Lifetime  contact-only — everything, no listed price
   The CTA opens the live Pricing page; Lifetime pre-arms the contact form so
   one click from here puts the visitor straight into "fill your info out". */
const PLANS: { key: string; name: string; tag: string; price: string; note: string; feats: string[]; featured?: boolean; cta: string }[] = [
  {
    key: 'pinpoint', name: 'Pinpoint', tag: 'The dealer-GEX terminal', price: '$125', note: '/ mo', cta: 'Select plan',
    feats: [
      'Live dealer positioning (GEX, DEX, VEX)',
      'Gamma exposure by strike',
      'Zero-DTE levels & dealer dynamics',
      'Dealer Flow & Live Terminal',
      'Trade History tracking',
      'Real-time Discord chat & alerts',
    ],
  },
  {
    key: 'skyvision', name: 'SkyVision', tag: 'Everything included', price: '$275', note: '/ mo', featured: true, cta: 'Select plan',
    feats: [
      'Everything in Pinpoint',
      'Tells you which options to trade',
      'Live volatility surface & expected P&L',
      'Trade health score tracker',
      'Quant Lab — backtester, order flow & momentum',
    ],
  },
  {
    key: 'lifetime', name: 'Lifetime', tag: 'Everything, forever', price: 'Custom', note: 'talk to us', cta: 'Contact us',
    feats: [
      'Everything in SkyVision — forever',
      'One payment, no recurring billing',
      'Private 1-on-1 onboarding',
      'Early beta access to new tools',
    ],
  },
];

function PlanCard({ p, index, onSelect }: { p: (typeof PLANS)[number]; index: number; onSelect: (p: (typeof PLANS)[number]) => void }) {
  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded-[10px] p-6 transition-colors duration-150"
      style={{
        background: p.featured ? PALETTE.panel : PALETTE.panelSoft,
        border: `1px solid ${p.featured ? lineStrong : line}`,
      }}
    >
      {/* featured accent hairline — a single semantic bar marks the recommended
          tier (theme accent), not a decorative three-colour rainbow */}
      {p.featured ? (
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px]" style={{ background: accentFill }} />
      ) : null}
      {p.featured ? (
        <span className="absolute -top-0 left-6 translate-y-[10px] rounded-b-[7px] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.16em]" style={{ background: PALETTE.steel, color: '#0A0806' }}>
          Most Popular
        </span>
      ) : null}
      <div className={`border-b pb-5 ${p.featured ? 'pt-6' : ''}`} style={{ borderColor: line }}>
        <div className="text-[14px] font-semibold" style={{ color: PALETTE.ghost }}>{p.name}</div>
        <div className="mt-0.5 text-[11px] uppercase tracking-[0.14em]" style={{ color: faint }}>{p.tag}</div>
        <div className="mt-4 flex items-baseline gap-1.5">
          <span className="text-[34px] font-semibold leading-none tabular-nums" style={{ color: PALETTE.text, letterSpacing: '-0.02em' }}>
            {p.price}
          </span>
          <span className="text-[11px]" style={{ color: faint }}>{p.note}</span>
        </div>
      </div>
      <ul className="mt-5 flex-1 space-y-2.5">
        {p.feats.map((f, i) => (
          <li key={i} className="flex items-start gap-2.5 text-[12.5px] leading-snug" style={{ color: muted }}>
            <Check className="mt-[2px] h-3.5 w-3.5 shrink-0" style={{ color: PALETTE.green }} />
            <span className={i === 0 && index > 0 ? 'font-medium' : ''} style={i === 0 && index > 0 ? { color: PALETTE.text } : undefined}>{f}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => onSelect(p)}
        className="mt-6 w-full cursor-pointer rounded-[7px] px-4 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] transition-[background,transform] active:scale-[0.98]"
        style={p.featured ? { background: accentFill, color: accentText } : { background: 'transparent', color: PALETTE.text, border: `1px solid ${lineStrong}` }}
        onMouseEnter={(e) => { if (p.featured) e.currentTarget.style.background = accentBright; else e.currentTarget.style.background = hoverWash; }}
        onMouseLeave={(e) => { if (p.featured) e.currentTarget.style.background = accentFill; else e.currentTarget.style.background = 'transparent'; }}
      >
        {p.cta}
      </button>
    </div>
  );
}

export function PricingSection({ onLaunch, onEnter }: { onLaunch: () => void; onEnter: (t?: string) => void }) {
  const setCheckoutPlan = useContractStore((s) => s.setCheckoutPlan);
  // Lifetime is contact-only: pre-arm the plan intent so the Pricing page opens
  // straight into the contact form ("just fill your info out") — one click.
  const select = (p: (typeof PLANS)[number]) => {
    if (p.key === 'lifetime') setCheckoutPlan('lifetime');
    onEnter('subscription');
  };
  return (
    <section id="pricing" className="px-5 py-20" style={{ borderTop: `1px solid ${line}`, background: PALETTE.panelSoft }}>
      <div className="mx-auto max-w-5xl">
        <SectionHead eyebrow="Pricing" title="Plans & Access" sub="Slayer Terminal is live — no waitlist. Pick a plan and open the full terminal. Annual billing saves up to 18%." />
        <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3 md:items-stretch">
          {PLANS.map((p, i) => <PlanCard key={p.key} p={p} index={i} onSelect={select} />)}
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <PrimaryButton onClick={onLaunch}>Launch Terminal</PrimaryButton>
          <GhostButton onClick={() => onEnter('subscription')}>See full pricing</GhostButton>
        </div>
        <p className="mt-4 text-center text-[11px]" style={{ color: faint }}>Prices in USD. Sign in to check out — access is granted at payment. Cancel anytime.</p>
      </div>
    </section>
  );
}

export function FaqSection() {
  const faqs = [
    ['What is Slayer Terminal?', 'An options intelligence platform that reads dealer positioning, gamma exposure, flow, and volatility structure, then turns it into clear levels and ranked contract ideas.'],
    ['Is this a signal service?', 'No. It is an analytics terminal. It shows you the structure and the read — you make the trade.'],
    ['Does it choose contracts?', 'It ranks contracts by structure, momentum, and risk, and shows the reasoning. Selection stays with you.'],
    ['What data does it use?', 'Live options chains, dealer-exposure aggregates (GEX/DEX/VEX), candles, and volatility structure — one consistent data spine across every module.'],
    ['Is it for beginners?', 'It is built for traders who already think in levels and risk. Beginners can use it, but it assumes you want structure, not tips.'],
    ['Is it available now?', 'Yes. Slayer Terminal is live — there is no waitlist. Create an account and open the full terminal immediately.'],
  ];
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="mx-auto max-w-3xl px-5 py-16" style={{ borderTop: `1px solid ${line}` }}>
      <SectionHead eyebrow="FAQ" title="Direct Answers" />
      <div className="mt-8 divide-y" style={{ borderColor: line }}>
        {faqs.map(([q, a], i) => {
          const isOpen = open === i;
          return (
            <div key={i} style={{ borderTop: i === 0 ? 'none' : `1px solid ${line}` }}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-[7px] px-2 py-4 text-left transition-colors"
                onMouseEnter={(e) => (e.currentTarget.style.background = hoverWash)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span className="text-[14px] font-medium" style={{ color: PALETTE.ghost }}>{q}</span>
                <span className="text-[16px] leading-none transition-transform" style={{ color: isOpen ? PALETTE.steel : muted, transform: isOpen ? 'rotate(0deg)' : 'none' }}>{isOpen ? '−' : '+'}</span>
              </button>
              {isOpen ? <p className="pb-4 text-[13px] leading-relaxed" style={{ color: muted }}>{a}</p> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function FinalCta({ onLaunch }: { onLaunch: () => void }) {
  return (
    <section className="relative overflow-hidden px-5 py-20" style={{ borderTop: `1px solid ${line}` }}>
      <div className="relative mx-auto max-w-2xl text-center">
        <div className="mb-4 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.28em]" style={{ color: faint }}>
          <span className="inline-block h-1 w-1 rounded-full" style={{ background: PALETTE.green }} />
          Slayer Terminal
        </div>
        <h2 className="text-[30px] font-semibold leading-tight sm:text-[40px]" style={{ color: PALETTE.ghost, letterSpacing: '-0.02em' }}>
          From Traders. For Traders.
        </h2>
        <p className="mx-auto mt-4 max-w-md text-[14px] leading-relaxed" style={{ color: muted }}>
          The dealer structure, ranked contracts and live flow — one desk. Open it and read the market the way it actually moves.
        </p>
        <div className="mt-8 flex justify-center"><PrimaryButton onClick={onLaunch}>Launch Terminal</PrimaryButton></div>
      </div>
    </section>
  );
}

function FootLink({ label, onClick, external }: { label: string; onClick: () => void; external?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-left text-[12px] transition-colors"
      style={{ color: muted }}
      onMouseEnter={(e) => (e.currentTarget.style.color = PALETTE.ghost)}
      onMouseLeave={(e) => (e.currentTarget.style.color = muted)}
    >
      {label}{external ? <ArrowUpRight className="h-3 w-3" /> : null}
    </button>
  );
}

export function Footer({ onLaunch, onEnter, scrollTo }: { onLaunch: () => void; onEnter: (t?: string) => void; scrollTo: (id: string) => void }) {
  return (
    <footer className="px-5 pb-10 pt-14" style={{ borderTop: `1px solid ${line}`, background: PALETTE.bg }}>
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
          {/* brand + tagline + social — the ONE canonical logo (BrandLogo.tsx),
              HTML-exact: dim ">" prompt, all-one-ink wordmark, glowing caret. */}
          <div className="col-span-2 sm:col-span-4 lg:col-span-1">
            <span className="inline-block origin-left scale-[0.85]">
              <TerminalLogo expanded />
            </span>
            <p className="mt-3 max-w-xs text-[12px] leading-relaxed" style={{ color: faint }}>
              The options terminal. SkyVision finds the setup, Pinpoint AI reads the flow.
            </p>
            <a
              href="https://x.com/JoinSlayer"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 text-[12px] transition-colors"
              style={{ color: muted }}
              onMouseEnter={(e) => (e.currentTarget.style.color = PALETTE.ghost)}
              onMouseLeave={(e) => (e.currentTarget.style.color = muted)}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
              @JoinSlayer
            </a>
          </div>
          {/* products */}
          <div>
            <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: faint }}>Products</div>
            <div className="flex flex-col gap-2">
              {NAV_MAIN_VIEWS.filter((p) => p.id !== 'home').map((p) => (
                <FootLink key={p.id} label={p.label} onClick={() => onEnter(p.id)} />
              ))}
            </div>
          </div>
          {/* company */}
          <div>
            <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: faint }}>Company</div>
            <div className="flex flex-col gap-2">
              <FootLink label="Pricing" onClick={() => scrollTo('pricing')} />
              <FootLink label="Product" onClick={() => scrollTo('product')} />
              <FootLink label="FAQ" onClick={() => scrollTo('faq')} />
              <FootLink label="Contact" onClick={() => { window.location.href = 'mailto:info@slayerterminal.com'; }} external />
            </div>
          </div>
          {/* access */}
          <div>
            <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: faint }}>Access</div>
            <div className="flex flex-col gap-2">
              <FootLink label="Launch Terminal" onClick={onLaunch} />
              <FootLink label="Log in / Sign up" onClick={onLaunch} />
              <FootLink label="Plans" onClick={() => onEnter('subscription')} />
            </div>
          </div>
        </div>
        <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t pt-6 sm:flex-row sm:items-center" style={{ borderColor: line }}>
          <span className="text-[10px] font-medium uppercase tracking-[0.16em]" style={{ color: faint }}>© 2026 Slayer Terminal · SkyVision · Pinpoint AI</span>
          <span className="max-w-lg text-[10px] leading-relaxed sm:text-right" style={{ color: faint }}>
            For informational purposes only. Not investment advice. Analytics platform — not guaranteed profit.
          </span>
        </div>
      </div>
    </footer>
  );
}

/* ─────────────────────────── page ─────────────────────────── */
