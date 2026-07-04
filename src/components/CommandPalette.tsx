import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Command } from 'cmdk';
import { useContractStore } from '../lib/store';
import { ASSET_LIST } from '../data';
import {
  Home, LineChart, Crosshair, BarChart3, History, LayoutGrid,
  Users, Settings, CreditCard, Search, TrendingUp, TrendingDown,
} from 'lucide-react';

/**
 * ⌘K / Ctrl+K command palette — a Bloomberg/terminal-style launcher built on cmdk
 * for fast fuzzy navigation and quick actions. Dark, compact, keyboard-first — it
 * drives the real app through the store (setActiveTab / symbol / contract), never
 * page reloads. Mounted once at the app root.
 */

function PaletteItem({
  icon, label, hint, keywords, onRun,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  keywords?: string;
  onRun: () => void;
}) {
  return (
    <Command.Item
      value={label + (keywords ? ' ' + keywords : '')}
      onSelect={onRun}
      className="group flex items-center gap-3 px-3 py-2.5 rounded-md text-sm cursor-pointer text-[var(--text-secondary)] transition-colors data-[selected=true]:bg-[var(--surface-3)] data-[selected=true]:text-[var(--text-primary)] data-[selected=true]:shadow-[inset_2px_0_0_var(--accent-color)]"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-tertiary)] group-data-[selected=true]:border-[var(--accent-color)]/40 group-data-[selected=true]:text-[var(--accent-color)] [&>svg]:h-3.5 [&>svg]:w-3.5">
        {icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {hint && (
        <span className="ml-3 shrink-0 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">{hint}</span>
      )}
    </Command.Item>
  );
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);

  const setActiveTab = useContractStore(s => s.setActiveTab);
  const setSelectedAsset = useContractStore(s => s.setSelectedAsset);
  const setSelectedOptionType = useContractStore(s => s.setSelectedOptionType);
  const setIsGlobalSearchOpen = useContractStore(s => s.setIsGlobalSearchOpen);

  // Global hotkey: ⌘K / Ctrl+K toggles the palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const run = (fn: () => void) => () => { fn(); setOpen(false); };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-start justify-center pt-[12vh] bg-black/60 backdrop-blur-sm animate-[cmdfade_120ms_ease-out]"
      onMouseDown={() => setOpen(false)}
      role="presentation"
    >
      <Command
        label="Slayer Terminal command palette"
        loop
        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setOpen(false); } }}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-xl mx-4 overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] font-mono shadow-[0_24px_70px_-12px_rgba(0,0,0,0.8)] animate-[cmdpop_140ms_cubic-bezier(.16,1,.3,1)]"
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
          <Search className="h-4 w-4 text-[var(--text-tertiary)]" />
          <Command.Input
            autoFocus
            placeholder="Search Slayer Terminal — views, symbols, actions…"
            className="h-6 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
          />
          <kbd className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[9px] text-[var(--text-tertiary)]">ESC</kbd>
        </div>

        <Command.List className="max-h-[52vh] overflow-y-auto p-1.5 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[9px] [&_[cmdk-group-heading]]:font-black [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.16em] [&_[cmdk-group-heading]]:text-[var(--text-tertiary)]">
          <Command.Empty className="px-3 py-10 text-center text-xs text-[var(--text-tertiary)]">No matching commands.</Command.Empty>

          <Command.Group heading="Navigation">
            <PaletteItem icon={<Home />} label="Home" keywords="dashboard ecosystem intro" onRun={run(() => setActiveTab('home'))} />
            <PaletteItem icon={<LineChart />} label="SkyVision — Trade Dashboard" hint="S" keywords="scanner setups opportunity structure score" onRun={run(() => setActiveTab('skyvision'))} />
            <PaletteItem icon={<Crosshair />} label="Pinpoint GEX — Dealer Flow" hint="G" keywords="gamma gex dealer walls heatmap terminal flow" onRun={run(() => setActiveTab('pinpoint'))} />
            <PaletteItem icon={<BarChart3 />} label="Quant Lab" hint="Q" keywords="volatility surface monte carlo risk neutral density model" onRun={run(() => setActiveTab('quant'))} />
            <PaletteItem icon={<History />} label="Trade History" keywords="audit record registry track" onRun={run(() => setActiveTab('auditor'))} />
            <PaletteItem icon={<LayoutGrid />} label="Workspace" keywords="widgets layout panels grid" onRun={run(() => setActiveTab('workspace'))} />
            <PaletteItem icon={<Users />} label="Community" keywords="arbor capital discord research" onRun={run(() => setActiveTab('community'))} />
            <PaletteItem icon={<Settings />} label="Settings" hint="," keywords="preferences theme account alerts display" onRun={run(() => setActiveTab('settings'))} />
            <PaletteItem icon={<CreditCard />} label="Plans & Pricing" keywords="upgrade subscribe tier billing" onRun={run(() => setActiveTab('subscription'))} />
          </Command.Group>

          <Command.Group heading="Actions">
            <PaletteItem icon={<Search />} label="Open Global Search" keywords="find filter prism ticker" onRun={run(() => setIsGlobalSearchOpen(true))} />
            <PaletteItem icon={<TrendingUp />} label="Set Contract Type: Calls" keywords="call c bullish long" onRun={run(() => setSelectedOptionType('C'))} />
            <PaletteItem icon={<TrendingDown />} label="Set Contract Type: Puts" keywords="put p bearish short" onRun={run(() => setSelectedOptionType('P'))} />
          </Command.Group>

          <Command.Group heading="Symbols">
            {ASSET_LIST.map(a => (
              <PaletteItem
                key={a.ticker}
                icon={<span className="text-[9px] font-black tabular-nums">{a.ticker.slice(0, 3)}</span>}
                label={`${a.ticker} · ${a.name}`}
                hint="Symbol"
                keywords={a.ticker + ' ' + a.name}
                onRun={run(() => { setSelectedAsset(a); setActiveTab('skyvision'); })}
              />
            ))}
          </Command.Group>
        </Command.List>

        <div className="flex items-center gap-3 border-t border-[var(--border)] px-4 py-2 text-[9px] uppercase tracking-wider text-[var(--text-tertiary)]">
          <span>↑↓ navigate</span><span>↵ select</span><span>⌘K toggle</span><span>esc close</span>
        </div>
      </Command>
      <style>{`@keyframes cmdfade{from{opacity:0}to{opacity:1}}@keyframes cmdpop{from{opacity:0;transform:translateY(-6px) scale(.985)}to{opacity:1;transform:none}}`}</style>
    </div>,
    document.body,
  );
}

export default CommandPalette;
