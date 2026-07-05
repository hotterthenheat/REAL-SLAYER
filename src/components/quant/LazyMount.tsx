import React, { useEffect, useRef, useState } from 'react';

/**
 * LazyMount — renders its children only while the placeholder is on (or near) screen,
 * and UNMOUNTS them once scrolled well away. Used to bound the number of live WebGL
 * contexts on a page full of 3D surfaces: browsers silently drop the oldest GL context
 * past their limit (~8–16), which is the classic "panel goes blank/white" failure. By
 * unmounting off-screen 3D panels, only the visible ones hold a context.
 *
 * While unmounted it reserves the same height (so scroll position is stable) and shows
 * an optional placeholder instead of a raw white/empty gap.
 */
export default function LazyMount({
  children,
  minHeight = 300,
  rootMargin = '200px',
  placeholder,
}: {
  children: React.ReactNode;
  minHeight?: number;
  rootMargin?: string;
  placeholder?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setShow(true); return; }
    const io = new IntersectionObserver((entries) => {
      setShow(entries.some(e => e.isIntersecting));
    }, { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);

  return (
    <div ref={ref} style={{ minHeight: show ? undefined : minHeight }}>
      {show ? children : (placeholder ?? (
        <div style={{ minHeight }} className="flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)]">
          <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-tertiary)]">Scroll to load 3D surface…</span>
        </div>
      ))}
    </div>
  );
}
