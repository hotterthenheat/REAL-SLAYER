import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Slayer terminal ResizableSplit — a two-pane horizontal splitter with a draggable
 * hairline handle, for the layouts traders actually re-balance (chart ↔ matrix,
 * chart ↔ flow). Ratio persists per `storageKey`. Collapses to a clean vertical
 * stack below `wideMin` so it never fights small screens.
 */

function useIsWide(min: number) {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(`(min-width:${min}px)`);
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [min]);
  return wide;
}

interface ResizableSplitProps {
  left: React.ReactNode;
  right: React.ReactNode;
  /** Left pane fraction 0–1 (default 0.58). */
  defaultRatio?: number;
  min?: number;
  max?: number;
  storageKey?: string;
  wideMin?: number;
  className?: string;
}

export function ResizableSplit({
  left,
  right,
  defaultRatio = 0.58,
  min = 0.35,
  max = 0.72,
  storageKey,
  wideMin = 1280,
  className = '',
}: ResizableSplitProps) {
  const wide = useIsWide(wideMin);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  const [ratio, setRatio] = useState<number>(() => {
    if (typeof window !== 'undefined' && storageKey) {
      const v = Number(window.localStorage.getItem(storageKey));
      if (Number.isFinite(v) && v >= min && v <= max) return v;
    }
    return defaultRatio;
  });

  const onMove = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const r = Math.min(max, Math.max(min, (clientX - rect.left) / rect.width));
    setRatio(r);
  }, [min, max]);

  useEffect(() => {
    const move = (e: PointerEvent) => { if (dragging.current) onMove(e.clientX); };
    const up = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (storageKey) window.localStorage.setItem(storageKey, String(ratio));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [onMove, ratio, storageKey]);

  const startDrag = () => {
    dragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const nudge = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') setRatio(r => Math.max(min, r - 0.02));
    if (e.key === 'ArrowRight') setRatio(r => Math.min(max, r + 0.02));
  };

  if (!wide) {
    return <div className={`flex flex-col gap-4 ${className}`}>{left}{right}</div>;
  }

  return (
    <div ref={containerRef} className={`flex items-stretch ${className}`}>
      <div className="min-w-0" style={{ flexBasis: `${ratio * 100}%` }}>{left}</div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panels"
        tabIndex={0}
        onPointerDown={startDrag}
        onKeyDown={nudge}
        className="group relative mx-2 flex w-1 shrink-0 cursor-col-resize items-center justify-center rounded-full bg-[var(--border)] outline-none transition-colors hover:bg-[var(--primary)] focus-visible:bg-[var(--primary)]"
      >
        <span className="absolute h-8 w-3 rounded-full" />
        <span className="pointer-events-none absolute h-6 w-[3px] rounded-full bg-[var(--text-tertiary)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
      </div>
      <div className="min-w-0" style={{ flexBasis: `${(1 - ratio) * 100}%` }}>{right}</div>
    </div>
  );
}
