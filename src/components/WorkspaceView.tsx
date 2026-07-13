/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Dependency-free resizable grid workspace (React-19 safe — no findDOMNode).
 * Snap-to-grid drag + resize via pointer events; debounced persistence to
 * localStorage + PATCH /api/users/workspace; hydrates from API or Template A.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, ChevronDown, X } from 'lucide-react';
import { Pane, renderWidget } from './WorkspaceWidgets';
import { ErrorBoundary } from './ErrorBoundary';
import { ConfirmDialog } from './ConfirmDialog';
import {
  PaneLayout, WidgetType, WIDGETS, widgetMeta, paneId, TEMPLATES, cloneTemplate, GRID_COLS,
} from '../lib/workspace';
import { useContractStore } from '../lib/store';

const ROW_HEIGHT = 40;
const GAP = 8;
// Single overlay-shadow token for every true floating surface (dropdowns, modal,
// toast) — matches NavFlyout so the app has exactly one elevation, not per-widget shadows.
const OVERLAY_SHADOW = '0 16px 44px -12px rgba(0,0,0,0.8)';

// Geometry fingerprint of a layout, ignoring pane ids and array order. Lets the
// library mark the card whose panes exactly match what's on the canvas as ACTIVE
// — derived, so it stays honest the moment the user drags a pane.
const layoutSignature = (panes: PaneLayout[]) =>
  panes.map((p) => `${p.widget}@${p.x},${p.y},${p.w},${p.h}`).sort().join('|');

// Miniature schematic of a layout: each pane drawn to scale on a 12-col canvas.
function LayoutThumb({ panes, active }: { panes: PaneLayout[]; active: boolean }) {
  const rows = Math.max(1, panes.reduce((m, p) => Math.max(m, p.y + p.h), 0));
  return (
    <div className="relative w-full h-[72px] rounded-[3px] overflow-hidden bg-[var(--background)] border border-[var(--border)]" aria-hidden="true">
      {panes.map((p) => (
        <div
          key={p.i}
          className="absolute rounded-[1px]"
          style={{
            left: `calc(${(p.x / GRID_COLS) * 100}% + 2px)`,
            top: `calc(${(p.y / rows) * 100}% + 2px)`,
            width: `calc(${(p.w / GRID_COLS) * 100}% - 3px)`,
            height: `calc(${(p.h / rows) * 100}% - 3px)`,
            background: active ? 'var(--accent-soft)' : 'var(--surface-3)',
            boxShadow: active ? 'inset 0 0 0 1px var(--accent-color)' : 'inset 0 0 0 1px var(--border)',
          }}
        />
      ))}
    </div>
  );
}

// Large selectable layout card for the library gallery. The whole card applies the
// layout; delete (saved layouts only) is a per-card hover action. The card whose
// geometry matches the live canvas gets an accent frame + ACTIVE chip.
function LayoutCard({ name, panes, active, onApply, onDelete }: {
  name: string;
  panes: PaneLayout[];
  active: boolean;
  onApply: () => void;
  onDelete?: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className={`relative group min-w-0 bg-[var(--surface)] border rounded-[var(--radius-panel)] p-2.5 transition-colors ${active ? 'border-[var(--accent-color)]' : 'border-[var(--border)] hover:border-[var(--border-strong)]'}`}
      style={active ? { boxShadow: '0 0 0 1px var(--accent-color), 0 0 16px var(--accent-glow)' } : undefined}
    >
      <button
        onClick={onApply}
        aria-pressed={active}
        aria-label={active ? `${name} — currently applied` : `Apply layout ${name}`}
        className="absolute inset-0 z-10 rounded-[var(--radius-panel)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
      />
      <LayoutThumb panes={panes} active={active} />
      <div className="mt-2 flex items-center justify-between gap-2 min-w-0">
        <span className={`text-[11px] font-medium truncate ${active ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'}`}>{name}</span>
        <span className="flex items-center gap-1.5 shrink-0">
          {active && (
            <span className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-color)] bg-[var(--accent-soft)] rounded-[3px] px-1.5 py-0.5">Active</span>
          )}
          <span className="text-[10px] tabular-nums text-[var(--text-tertiary)]">{panes.length}p</span>
        </span>
      </div>
      {onDelete && (
        <button
          onClick={onDelete}
          title="Delete"
          aria-label={`Delete saved layout ${name}`}
          className="absolute top-1.5 right-1.5 z-20 p-1 rounded-[3px] bg-[var(--surface-2)] text-[var(--text-tertiary)] hover:text-[var(--danger)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

interface Props { isSuperAdmin?: boolean; }

export function WorkspaceView({ isSuperAdmin }: Props) {
  const [layout, setLayout] = useState<PaneLayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [maximized, setMaximized] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [colWidth, setColWidth] = useState(80);
  // Below md the absolute drag-grid is unusably cramped (panes shrink to ~90px and
  // titles/columns truncate), and pointer drag/resize is a desktop affordance anyway.
  // On narrow screens we render the same panes as a full-width vertical stack.
  const [isNarrow, setIsNarrow] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interaction = useRef<null | { id: string; mode: 'move' | 'resize'; startX: number; startY: number; orig: PaneLayout }>(null);

  // Lightweight self-contained toast for surfacing save failures and successes.
  const [toast, setToast] = useState<{ text: string; tone: 'error' | 'success' } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((text: string, tone: 'error' | 'success' = 'error') => {
    setToast({ text, tone });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);
  const notifyError = useCallback((text: string) => notify(text, 'error'), [notify]);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // Single reusable confirmation dialog for destructive/irreversible actions.
  const [confirm, setConfirm] = useState<null | {
    title: string; message: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void;
  }>(null);

  useEffect(() => {
    const measure = () => {
      const w = containerRef.current?.clientWidth || 960;
      setColWidth(Math.max(24, (w - GAP * (GRID_COLS + 1)) / GRID_COLS));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsNarrow(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const persist = useCallback((next: PaneLayout[]) => {
    try { localStorage.setItem('slayer_workspace', JSON.stringify(next)); } catch {}
    if (saveTimer.current) clearTimeout(saveTimer.current);
    // The layout is already in localStorage above, so a failed cloud sync is never data
    // loss — it just retries. Surface that calmly (optimistic, retry-safe) instead of an
    // alarming "failed to sync" error that makes the workspace feel broken.
    const syncCloud = (attempt: number) => {
      fetch('/api/users/workspace', {
        method: 'PATCH', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout: next }),
      })
        .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); })
        .catch(() => {
          if (attempt < 2) { setTimeout(() => syncCloud(attempt + 1), 4000); return; }
          // We've exhausted this save's retries; the next edit starts a fresh
          // sync. Say exactly that instead of implying a background retry loop.
          notifyError('Saved locally. Cloud sync will retry on your next change.');
        });
    };
    // Guests have no server profile — persisting to localStorage above is the whole
    // save. Skip the cloud PATCH so we don't fire a guaranteed 401 into the console.
    saveTimer.current = setTimeout(() => {
      if (!useContractStore.getState().isAuthenticated) return;
      syncCloud(0);
    }, 1000);
  }, [notifyError]);

  const commit = useCallback((next: PaneLayout[]) => { setLayout(next); persist(next); }, [persist]);

  // Cancel a pending debounced save on unmount so we don't fire a PATCH from a
  // component that no longer exists.
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  // Hydrate: (cloud, if signed-in) -> localStorage -> Template A (never render an
  // empty terminal). Guests skip the cloud read entirely so no 401 hits the console;
  // the effect re-runs when auth resolves, upgrading a guest layout to the profile one.
  const isAuthenticated = useContractStore((s) => s.isAuthenticated);
  useEffect(() => {
    let cancelled = false;
    const fallback = (): PaneLayout[] => {
      try {
        const ls = localStorage.getItem('slayer_workspace');
        if (ls) { const p = JSON.parse(ls); if (Array.isArray(p) && p.length) return p; }
      } catch {}
      return cloneTemplate('A');
    };
    if (!isAuthenticated) {
      // Local-only hydrate for guests — never touch the authenticated endpoint.
      setLayout((cur) => (cur.length ? cur : fallback()));
      setLoading(false);
      return () => { cancelled = true; };
    }
    fetch('/api/users/workspace', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (Array.isArray(d.layout) && d.layout.length) {
          setLayout(d.layout);
        } else {
          const fb = fallback();
          setLayout(fb);
          persist(fb); // hydrate Template A into the user's profile
        }
      })
      .catch(() => { if (!cancelled) setLayout(fallback()); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [persist, isAuthenticated]);

  const onPointerMove = useCallback((e: PointerEvent) => {
    const it = interaction.current;
    if (!it) return;
    const dxCols = Math.round((e.clientX - it.startX) / (colWidth + GAP));
    const dyRows = Math.round((e.clientY - it.startY) / (ROW_HEIGHT + GAP));
    setLayout((prev) => prev.map((p) => {
      if (p.i !== it.id) return p;
      const meta = widgetMeta(p.widget);
      if (it.mode === 'move') {
        return {
          ...p,
          x: Math.max(0, Math.min(GRID_COLS - it.orig.w, it.orig.x + dxCols)),
          y: Math.max(0, it.orig.y + dyRows),
        };
      }
      return {
        ...p,
        w: Math.max(meta.minW, Math.min(GRID_COLS - p.x, it.orig.w + dxCols)),
        h: Math.max(meta.minH, it.orig.h + dyRows),
      };
    }));
  }, [colWidth]);

  const endInteraction = useCallback(() => {
    if (interaction.current) {
      interaction.current = null;
      setLayout((cur) => { persist(cur); return cur; });
    }
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', endInteraction);
  }, [onPointerMove, persist]);

  const startInteraction = (id: string, mode: 'move' | 'resize', e: React.PointerEvent) => {
    e.preventDefault();
    const orig = layout.find((p) => p.i === id);
    if (!orig) return;
    interaction.current = { id, mode, startX: e.clientX, startY: e.clientY, orig: { ...orig } };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endInteraction);
  };

  // Safety net: if the component unmounts mid-drag, detach the window listeners
  // (endInteraction only runs on pointerup, which never fires after unmount).
  useEffect(() => () => {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', endInteraction);
  }, [onPointerMove, endInteraction]);

  const closePane = (id: string) => {
    const pane = layout.find((p) => p.i === id);
    const label = pane ? widgetMeta(pane.widget).title : null;
    setConfirm({
      title: 'Remove pane',
      message: label
        ? `Remove the ${label} widget from your workspace? This cannot be undone.`
        : 'Remove this pane from your workspace? This cannot be undone.',
      confirmLabel: 'Remove',
      danger: true,
      onConfirm: () => commit(layout.filter((p) => p.i !== id)),
    });
  };
  const addWidget = (widget: WidgetType) => {
    const maxY = layout.reduce((m, p) => Math.max(m, p.y + p.h), 0);
    const meta = widgetMeta(widget);
    commit([...layout, { i: paneId(widget), widget, x: 0, y: maxY, w: Math.max(meta.minW, 4), h: Math.max(meta.minH, 4) }]);
    setAddOpen(false);
  };
  const loadTemplate = (key: 'A' | 'B' | 'C' | 'D' | 'E') => { commit(cloneTemplate(key)); setLoadOpen(false); setMaximized(null); };

  const [saveName, setSaveName] = useState('');
  const [showSaveOverlay, setShowSaveOverlay] = useState(false);
  const saveInputRef = useRef<HTMLInputElement>(null);
  const saveTriggerRef = useRef<HTMLButtonElement>(null);

  // Save-Workspace modal a11y: focus the name field on open, support Escape to
  // close, and restore focus to the trigger when the modal closes.
  useEffect(() => {
    if (!showSaveOverlay) return;
    saveInputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setShowSaveOverlay(false); setSaveName(''); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      saveTriggerRef.current?.focus();
    };
  }, [showSaveOverlay]);
  const [customLayouts, setCustomLayouts] = useState<Record<string, PaneLayout[]>>(() => {
    try {
      const stored = localStorage.getItem('slayer_ws_custom');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const saveCustomLayout = () => {
    const name = saveName.trim();
    if (!name) return;
    const doSave = () => {
      const newCustom = { ...customLayouts, [name]: [...layout] };
      setCustomLayouts(newCustom);
      localStorage.setItem('slayer_ws_custom', JSON.stringify(newCustom));
      setSaveName('');
      setShowSaveOverlay(false);
      notify(`Saved "${name}" to this browser`, 'success');
    };
    if (customLayouts[name]) {
      // Close the save overlay first — it sits above the confirm dialog's portal.
      setShowSaveOverlay(false);
      setConfirm({
        title: 'Overwrite layout',
        message: `A saved layout named "${name}" already exists. Overwrite it?`,
        confirmLabel: 'Overwrite',
        danger: true,
        onConfirm: doSave,
      });
      return;
    }
    doSave();
  };

  const deleteCustomLayout = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirm({
      title: 'Delete layout',
      message: `Delete the saved layout "${name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () => {
        const newCustom = { ...customLayouts };
        delete newCustom[name];
        setCustomLayouts(newCustom);
        localStorage.setItem('slayer_ws_custom', JSON.stringify(newCustom));
      },
    });
  };

  const maxRow = layout.reduce((m, p) => Math.max(m, p.y + p.h), 0);
  const gridHeight = Math.max(8, maxRow) * (ROW_HEIGHT + GAP) + GAP;
  const visibleWidgets = WIDGETS.filter((w) => isSuperAdmin || !w.adminOnly);
  const templateKeys = (['A', 'B', 'C', 'D', 'E'] as const).filter((k) => isSuperAdmin || !TEMPLATES[k].adminOnly);

  // ── Layout library (shared by the inline band and the empty-canvas state) ──
  const activeSig = layoutSignature(layout);
  const savedNames = Object.keys(customLayouts);
  const applySaved = (name: string) => { commit(customLayouts[name].map(p => ({ ...p }))); setLoadOpen(false); setMaximized(null); };

  const savedGallery = savedNames.length > 0 ? (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 min-w-0">
      {savedNames.map((name) => (
        <LayoutCard
          key={name}
          name={name}
          panes={customLayouts[name]}
          active={layoutSignature(customLayouts[name]) === activeSig}
          onApply={() => applySaved(name)}
          onDelete={(e) => deleteCustomLayout(name, e)}
        />
      ))}
    </div>
  ) : (
    // Empty saved-layouts state: invite saving the first one.
    <button
      onClick={() => { setShowSaveOverlay(true); setAddOpen(false); }}
      className="w-full flex flex-col items-center gap-1 border border-dashed border-[var(--border-strong)] rounded-[var(--radius-panel)] px-4 py-5 text-center hover:border-[var(--accent-color)] hover:bg-[var(--accent-soft)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
    >
      <span className="text-[11px] font-medium text-[var(--text-secondary)]">No saved layouts yet</span>
      <span className="text-[10px] text-[var(--text-tertiary)]">Arrange your desk, then save your first layout — it lives in this browser.</span>
    </button>
  );

  const templateGallery = (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 min-w-0">
      {templateKeys.map((k) => (
        <LayoutCard
          key={k}
          name={TEMPLATES[k].name}
          panes={TEMPLATES[k].layout}
          active={layoutSignature(TEMPLATES[k].layout) === activeSig}
          onApply={() => loadTemplate(k)}
        />
      ))}
    </div>
  );

  const toolBtn = 'flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] px-2.5 py-1.5 transition-colors focus-visible:outline-none focus-visible:bg-[var(--surface-3)]';
  return (
    <>
      <div className="flex-1 flex flex-col w-full h-full min-w-0 text-[var(--text-primary)] bg-[var(--background)] overflow-hidden select-none relative">
        {/* ── Command bar: identity on the left, one consolidated toolbar on the right ── */}
        <div className="flex-none bg-[var(--surface)] border-b border-[var(--border)] px-3 py-2 flex items-center gap-3 z-40 min-w-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-1 h-3.5 rounded-full bg-[var(--accent-color)] shrink-0" aria-hidden="true" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)] truncate">Workspace</span>
            <span className="hidden sm:inline text-[10px] tabular-nums text-[var(--text-tertiary)] border border-[var(--border)] rounded-[var(--radius-control)] px-1.5 py-0.5 shrink-0">
              {layout.length} panes
            </span>
          </div>
          <div className="flex-1" />
          <div className="relative shrink-0">
            <div className="inline-flex items-stretch bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius-control)] overflow-hidden divide-x divide-[var(--border)]">
              <button
                onClick={() => { setLoadOpen(!loadOpen); setAddOpen(false); setShowSaveOverlay(false); }}
                aria-expanded={loadOpen}
                className={`${toolBtn} ${loadOpen ? 'text-[var(--accent-color)] bg-[var(--accent-soft)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]'}`}
              >
                <span className="hidden md:inline">Layouts</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${loadOpen ? 'rotate-180 text-[var(--accent-color)]' : 'text-[var(--text-tertiary)]'}`} />
              </button>
              <button
                ref={saveTriggerRef}
                onClick={() => { setShowSaveOverlay(true); setLoadOpen(false); setAddOpen(false); }}
                className={`${toolBtn} text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]`}
              >
                <span className="hidden md:inline">Save</span>
                <Plus className="w-3 h-3 md:hidden" />
              </button>
              <button
                onClick={() => { setAddOpen(!addOpen); setLoadOpen(false); setShowSaveOverlay(false); }}
                aria-expanded={addOpen}
                className={`${toolBtn} ${addOpen ? 'text-[var(--text-primary)] bg-[var(--surface-3)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]'}`}
              >
                <Plus className="w-3 h-3 text-[var(--success)]" /> <span className="hidden md:inline">Add Widget</span>
              </button>
            </div>
            {addOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-72 max-h-[26rem] overflow-y-auto bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-panel)] z-50 text-left" style={{ boxShadow: OVERLAY_SHADOW }}>
                <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-semibold px-3 pt-2.5 pb-1.5 tracking-[0.16em]">Add widget</div>
                <div className="pb-1.5">
                  {visibleWidgets.map((w) => (
                    <button key={w.type} onClick={() => addWidget(w.type)} className="w-full text-left px-3 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)] transition-colors">
                      {w.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Layout library band: gallery of large selectable cards with schematic previews ── */}
        {loadOpen && (
          <div className="flex-none bg-[var(--surface)] border-b border-[var(--border)] max-h-[46vh] overflow-y-auto px-3 py-3 min-w-0">
            <div className="flex flex-col gap-4 min-w-0">
              <section className="min-w-0">
                <div className="flex items-baseline justify-between gap-3 mb-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Saved · this browser</span>
                  <span className="text-[10px] tabular-nums text-[var(--text-tertiary)]">{savedNames.length}</span>
                </div>
                {savedGallery}
              </section>
              <section className="min-w-0">
                <div className="flex items-baseline justify-between gap-3 mb-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Templates</span>
                  <span className="text-[10px] tabular-nums text-[var(--text-tertiary)]">{templateKeys.length}</span>
                </div>
                {templateGallery}
              </section>
            </div>
          </div>
        )}

        <div ref={containerRef} className="flex-1 overflow-auto bg-[var(--background)] p-2 relative h-full">
          {isNarrow && layout.length > 0 ? (
            // Narrow screens: full-width vertical stack in reading order (row then
            // column). No absolute positioning, no drag/resize handles — those are
            // desktop affordances. Each pane keeps a usable height derived from its
            // grid rows so charts/tables have room to breathe.
            <div className="flex flex-col gap-2 w-full">
              {[...layout].sort((a, b) => (a.y - b.y) || (a.x - b.x)).map((p) => {
                const meta = widgetMeta(p.widget);
                return (
                  <div key={p.i} style={{ height: Math.max(240, p.h * ROW_HEIGHT) }}>
                    <Pane title={meta.title} onClose={() => closePane(p.i)} onMaximize={() => setMaximized(p.i)}>
                      <ErrorBoundary label={meta.title}>
                        {renderWidget(p.widget)}
                      </ErrorBoundary>
                    </Pane>
                  </div>
                );
              })}
            </div>
          ) : (
          <div className="relative w-full" style={{ height: gridHeight }}>
            {layout.map((p) => {
              const meta = widgetMeta(p.widget);
              const style: React.CSSProperties = {
                position: 'absolute',
                left: p.x * (colWidth + GAP),
                top: p.y * (ROW_HEIGHT + GAP),
                width: p.w * colWidth + (p.w - 1) * GAP,
                height: p.h * ROW_HEIGHT + (p.h - 1) * GAP,
                transition: interaction.current?.id === p.i ? 'none' : 'all 0.15s ease-out',
                zIndex: interaction.current?.id === p.i ? 10 : 1,
              };
              return (
                <div key={p.i} style={style}>
                  <Pane
                    title={meta.title}
                    onClose={() => closePane(p.i)}
                    onMaximize={() => setMaximized(p.i)}
                    onHeaderPointerDown={(e) => startInteraction(p.i, 'move', e)}
                  >
                    <ErrorBoundary label={meta.title}>
                      {renderWidget(p.widget)}
                    </ErrorBoundary>
                  </Pane>
                  <div
                    onPointerDown={(e) => startInteraction(p.i, 'resize', e)}
                    className="absolute bottom-0 right-0 w-3.5 h-3.5 cursor-se-resize z-20"
                    style={{ background: 'linear-gradient(135deg, transparent 45%, var(--text-tertiary) 45%, var(--text-tertiary) 55%, transparent 55%)', touchAction: 'none' }}
                    title="Resize"
                  />
                </div>
              );
            })}
            {layout.length === 0 && !loading && (
              // Empty desk: the layout library takes over the canvas as a centered
              // gallery — restore a saved layout, apply a template, or start blank.
              <div className="absolute inset-0 overflow-auto p-3 md:p-6">
                <div className="w-full max-w-3xl mx-auto flex flex-col gap-5 min-w-0">
                  <div className="pt-4 md:pt-8 flex flex-col items-center gap-2 text-center">
                    <span className="w-8 h-1 rounded-full bg-[var(--accent-color)]" aria-hidden="true" />
                    <h2 className="text-[12px] font-semibold uppercase tracking-[0.2em] text-[var(--text-primary)]">Empty desk</h2>
                    <p className="text-[11px] text-[var(--text-tertiary)] max-w-sm leading-relaxed">
                      No active panes. Restore a saved layout, apply a template below, or start blank and save your first layout once the desk feels right.
                    </p>
                  </div>

                  {savedNames.length > 0 && (
                    <section className="min-w-0">
                      <div className="flex items-baseline justify-between gap-3 mb-2">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Saved · this browser</span>
                        <span className="text-[10px] tabular-nums text-[var(--text-tertiary)]">{savedNames.length}</span>
                      </div>
                      {savedGallery}
                    </section>
                  )}

                  <section className="min-w-0">
                    <div className="flex items-baseline justify-between gap-3 mb-2">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Templates</span>
                      <span className="text-[10px] tabular-nums text-[var(--text-tertiary)]">{templateKeys.length}</span>
                    </div>
                    {templateGallery}
                  </section>

                  <button
                    onClick={() => { setAddOpen(true); setLoadOpen(false); setShowSaveOverlay(false); }}
                    className="self-center text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-tertiary)] border border-[var(--border)] rounded-[var(--radius-control)] px-3 py-2 hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
                  >
                    Or start blank — add a single widget
                  </button>
                </div>
              </div>
            )}
            {layout.length === 0 && loading && (
              // Honest skeleton: ghost the exact geometry of the layout being restored
              // (Standard Terminal), not a generic SaaS card grid.
              <div className="absolute inset-0" aria-busy="true" aria-label="Restoring workspace">
                {TEMPLATES.A.layout.map((p) => (
                  <div
                    key={p.i}
                    className="absolute bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-panel)] overflow-hidden animate-pulse"
                    style={{
                      left: p.x * (colWidth + GAP),
                      top: p.y * (ROW_HEIGHT + GAP),
                      width: p.w * colWidth + (p.w - 1) * GAP,
                      height: p.h * ROW_HEIGHT + (p.h - 1) * GAP,
                    }}
                  >
                    <div className="h-7 border-b border-[var(--border)] bg-[var(--surface-2)]" />
                  </div>
                ))}
                <div className="absolute left-3 bottom-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                  Restoring workspace…
                </div>
              </div>
            )}
          </div>
          )}
        </div>

        {maximized && (() => {
          const p = layout.find((x) => x.i === maximized);
          if (!p) return null;
          return (
            <div className="fixed inset-0 z-[100] bg-[var(--background)]/95 backdrop-blur-sm p-4 flex flex-col">
              <Pane
                title={widgetMeta(p.widget).title}
                isMaximized
                onMaximize={() => setMaximized(null)}
                onClose={() => { closePane(p.i); setMaximized(null); }}
              >
                <ErrorBoundary label={widgetMeta(p.widget).title}>
                  {renderWidget(p.widget)}
                </ErrorBoundary>
              </Pane>
            </div>
          );
        })()}
      </div>

      {showSaveOverlay && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => { setShowSaveOverlay(false); setSaveName(''); }}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-workspace-title"
            onClick={(e) => e.stopPropagation()}
            style={{ boxShadow: OVERLAY_SHADOW }}
            className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-panel)] p-5 w-full max-w-sm flex flex-col gap-4"
          >
            <h2 id="save-workspace-title" className="text-[var(--text-primary)] font-semibold text-[11px] tracking-[0.14em] uppercase">Save Workspace</h2>
            <p className="text-[var(--text-tertiary)] text-[10px] leading-relaxed">
              Saved locally in this browser.
            </p>
            <label htmlFor="save-workspace-name" className="sr-only">Workspace name</label>
            <input
              id="save-workspace-name"
              ref={saveInputRef}
              type="text"
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              placeholder="Workspace name"
              className="bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] px-3 py-2 text-[11px] font-medium focus:outline-none focus:border-[var(--success)] transition-colors rounded-[var(--radius-control)]"
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveCustomLayout();
              }}
            />
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => { setShowSaveOverlay(false); setSaveName(''); }}
                className="text-[10px] uppercase font-semibold tracking-[0.12em] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] px-3 py-2 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveCustomLayout}
                disabled={!saveName.trim()}
                className="text-[10px] uppercase font-semibold tracking-[0.12em] bg-[var(--success)] text-[var(--primary-contrast)] hover:opacity-90 rounded-[var(--radius-control)] px-4 py-2 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          role="alert"
          style={{ boxShadow: OVERLAY_SHADOW }}
          className={`fixed bottom-5 right-5 z-[300] flex items-center gap-2.5 bg-[var(--surface-2)] border rounded-[var(--radius-panel)] px-4 py-3 text-[10px] font-medium text-[var(--text-primary)] max-w-xs ${toast.tone === 'success' ? 'border-[var(--success)]/30' : 'border-[var(--danger)]/30'}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${toast.tone === 'success' ? 'bg-[var(--success)]' : 'bg-[var(--danger)]'}`} />
          <span>{toast.text}</span>
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title ?? ''}
        message={confirm?.message ?? ''}
        confirmLabel={confirm?.confirmLabel}
        danger={confirm?.danger}
        onConfirm={() => { confirm?.onConfirm(); setConfirm(null); }}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}

export default WorkspaceView;
