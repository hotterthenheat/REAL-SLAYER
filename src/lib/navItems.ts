import type { ComponentType, CSSProperties } from 'react';
import {
  Home,
  Sparkles,
  Dna,
  Waves,
  RadioTower,
  LineChart,
  Database,
  LayoutGrid,
  GraduationCap,
  CreditCard,
  SlidersHorizontal,
  Lock,
} from 'lucide-react';

/**
 * THE single source of truth for the left-sidebar navigation — labels, one-line
 * descriptions, icons, grouping, and flyout sub-tabs. Imported by BOTH
 * AppShell.tsx (the in-app terminal shell) and SlayerLanding.tsx (the marketing
 * landing, which renders the same sidebar for visitors), so the two sidebars
 * can never drift apart again. Add/rename a tab HERE and both surfaces update.
 */

export type NavIcon = ComponentType<{ className?: string; style?: CSSProperties }>;

export interface NavItemDef {
  /** App tab id — matches the store's activeTab / App.tsx's tab switch. */
  id: string;
  label: string;
  /** One-line description rendered under the label when the sidebar is expanded. */
  desc: string;
  icon: NavIcon;
  /** Active icon tint uses var(--accent-color) instead of the default text color. */
  accent?: boolean;
  /** Only rendered for admin sessions (AppShell enforces the gate). */
  adminOnly?: boolean;
}

/** "Main Views" group — order matters, it is the render order. */
export const NAV_MAIN_VIEWS: NavItemDef[] = [
  { id: 'dashboard', label: 'Home', desc: 'Terminal overview dashboard', icon: Home, accent: true },
  { id: 'skyvision', label: 'SkyVision', desc: 'Ranked trade setups', icon: Sparkles, accent: true },
  { id: 'pinpoint', label: 'Pinpoint GEX', desc: 'Dealer positioning & hedging flow', icon: Dna, accent: true },
  { id: 'dealerflow', label: 'Dealer Flow', desc: 'Unusual options & dark-pool prints', icon: Waves, accent: true },
  { id: 'liveterminal', label: 'Live Terminal', desc: 'Chart + GEX nodes', icon: RadioTower, accent: true },
  { id: 'quant', label: 'Quant Lab', desc: 'Vol surface & models', icon: LineChart, accent: true },
  { id: 'auditor', label: 'Trade History', desc: 'Tracked outcomes', icon: Database },
];

/** "Tools" group. */
export const NAV_TOOLS: NavItemDef[] = [
  { id: 'workspace', label: 'Workspace', desc: 'Saved layouts', icon: LayoutGrid },
  { id: 'community', label: 'Community', desc: 'Learn & discuss', icon: GraduationCap, accent: true },
  { id: 'subscription', label: 'Pricing', desc: 'Plans & access', icon: CreditCard },
];

/** Bottom (border-t) section. Settings shows everywhere; Admin only in-app for admins. */
export const NAV_SETTINGS: NavItemDef = { id: 'settings', label: 'Settings', desc: 'Preferences & account', icon: SlidersHorizontal };
export const NAV_ADMIN: NavItemDef = { id: 'admin', label: 'Admin Panel', desc: 'Restricted controls', icon: Lock, adminOnly: true };

/**
 * Sub-tabs surfaced in the sidebar hover flyouts (chevron rows). Ids MUST match
 * each page's internal sub-tab state; the app shell sends the target page a
 * `${tab}:${subId}` intent via the store when one is picked.
 */
export const NAV_SUBTABS: Record<string, { id: string; label: string }[]> = {
  pinpoint: [
    { id: 'exposure', label: 'Exposure & Walls' },
    { id: 'profile', label: 'Hedging Profile' },
    { id: 'targets', label: 'Ranked Targets' },
  ],
  quant: [
    { id: 'volgeo', label: 'Volatility Geometry' },
    { id: 'mechanics', label: 'Dealer Mechanics' },
    { id: 'distrib', label: 'Distribution & Risk' },
    { id: 'factor', label: 'Factor Lab' },
  ],
};

/** Both sidebars persist the collapse state under the SAME key, so crossing
 *  landing ⇄ terminal keeps the sidebar at the same width (no jump). */
export const SIDEBAR_COLLAPSED_KEY = 'slayer_sidebar_collapsed';
