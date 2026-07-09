import {
  Home,
  Eye,
  Crosshair,
  Activity,
  FlaskConical,
  History,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { cx } from '../../lib/cx';

/**
 * TerminalSidebar — the institutional left rail from the terminal renders: an
 * icon+label column on the brand panel surface, active item framed, version
 * footer. Driven by the store's activeTab ids; every default item maps to a
 * REAL page (no dead nav — Alerts joins the list once an alerts page exists).
 */
export type SidebarItem = {
  id: string;
  label: string;
  icon: LucideIcon;
};

export const DEFAULT_SIDEBAR_ITEMS: SidebarItem[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'skyvision', label: 'SkyVision', icon: Eye },
  { id: 'pinpoint', label: 'Pinpoint', icon: Crosshair },
  { id: 'dealerflow', label: 'Dealer Flow', icon: Activity },
  { id: 'quant', label: 'Quant Lab', icon: FlaskConical },
  { id: 'auditor', label: 'Trade History', icon: History },
  { id: 'settings', label: 'Settings', icon: Settings },
];

type TerminalSidebarProps = {
  activeId: string;
  onChange: (id: string) => void;
  items?: SidebarItem[];
  className?: string;
};

export function TerminalSidebar({
  activeId,
  onChange,
  items = DEFAULT_SIDEBAR_ITEMS,
  className,
}: TerminalSidebarProps) {
  return (
    <aside
      className={cx(
        'slayer-panel flex h-full w-[64px] flex-col justify-between p-2 md:w-[88px] md:p-3',
        className,
      )}
    >
      <div className="space-y-2">
        <div className="mb-3 hidden px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)] md:block">
          REAL-SLAYER
        </div>
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.id === activeId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              aria-current={active ? 'page' : undefined}
              className={cx(
                'flex w-full flex-col items-center gap-2 rounded-[10px] border px-2 py-3 text-center transition-colors',
                active
                  ? 'border-[var(--border-mid)] bg-[rgba(248,248,255,0.04)] text-[var(--text-primary)]'
                  : 'border-transparent bg-transparent text-[var(--text-muted)] hover:border-[var(--border-subtle)] hover:bg-[rgba(248,248,255,0.02)] hover:text-[var(--text-primary)]',
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden text-[10px] font-medium leading-tight md:block">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
      <div className="border-t border-[var(--border-subtle)] pt-3 text-center text-[10px] uppercase tracking-[0.14em] text-[var(--text-faint)]">
        v2.4.1
      </div>
    </aside>
  );
}

export default TerminalSidebar;
