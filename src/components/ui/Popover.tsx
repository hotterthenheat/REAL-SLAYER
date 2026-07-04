import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Slayer terminal Popover — a dependency-free, anchored portal panel for secondary
 * controls (expiry pickers, chart settings, filter menus) so the primary surface
 * stays clean. Portals to <body> to escape panel overflow, flips at the viewport
 * edge, and closes on outside-click / Esc. Dark, sharp, mono — matches the terminal.
 *
 * Uncontrolled by default; pass `open`/`onOpenChange` for controlled use.
 */

type Side = 'bottom' | 'top';
type Align = 'start' | 'center' | 'end';

interface PopoverProps {
  /** The clickable anchor. Its onClick is preserved and augmented to toggle. */
  trigger: React.ReactElement;
  children: React.ReactNode;
  side?: Side;
  align?: Align;
  /** Panel width in px, or 'trigger' to match the anchor width. */
  width?: number | 'trigger';
  /** Controlled open state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  /** Close when a click lands inside the panel (default false — good for menus). */
  closeOnInsideClick?: boolean;
}

const GAP = 6;
const PAD = 8;

export function Popover({
  trigger,
  children,
  side = 'bottom',
  align = 'start',
  width = 260,
  open: openProp,
  onOpenChange,
  className = '',
  closeOnInsideClick = false,
}: PopoverProps) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = useCallback(
    (v: boolean) => { if (openProp === undefined) setOpenState(v); onOpenChange?.(v); },
    [openProp, onOpenChange],
  );

  const [pos, setPos] = useState<{ top: number; left: number; width?: number; placement: Side }>({ top: 0, left: 0, placement: side });
  const triggerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const id = useId();

  const place = useCallback(() => {
    const t = triggerRef.current?.getBoundingClientRect();
    const p = panelRef.current?.getBoundingClientRect();
    if (!t || !p) return;
    let placement: Side = side;
    if (side === 'bottom' && t.bottom + p.height + GAP > window.innerHeight - PAD && t.top - p.height - GAP > PAD) placement = 'top';
    if (side === 'top' && t.top - p.height - GAP < PAD && t.bottom + p.height + GAP < window.innerHeight - PAD) placement = 'bottom';
    const top = placement === 'bottom' ? t.bottom + GAP : t.top - p.height - GAP;
    let left = align === 'start' ? t.left : align === 'end' ? t.right - p.width : t.left + t.width / 2 - p.width / 2;
    left = Math.max(PAD, Math.min(left, window.innerWidth - p.width - PAD));
    setPos({ top, left, width: width === 'trigger' ? t.width : undefined, placement });
  }, [side, align, width]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onScroll = () => place();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); } };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [open, setOpen]);

  const anchor = React.cloneElement(trigger as React.ReactElement<any>, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
      const r = (trigger as any).ref;
      if (typeof r === 'function') r(node);
      else if (r) r.current = node;
    },
    onClick: (e: React.MouseEvent) => { (trigger.props as any).onClick?.(e); if (!e.defaultPrevented) setOpen(!open); },
    'aria-haspopup': 'dialog',
    'aria-expanded': open,
    'aria-controls': open ? id : undefined,
  } as any);

  return (
    <>
      {anchor}
      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          id={id}
          role="dialog"
          onClick={closeOnInsideClick ? () => setOpen(false) : undefined}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: pos.width ?? (typeof width === 'number' ? width : undefined),
            zIndex: 9998,
          }}
          className={`animate-[spop_130ms_cubic-bezier(.16,1,.3,1)] overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] shadow-[0_18px_50px_-12px_rgba(0,0,0,0.8)] backdrop-blur-md ${className}`}
        >
          {children}
        </div>,
        document.body,
      )}
      {open && <style>{`@keyframes spop{from{opacity:0;transform:translateY(${pos.placement === 'bottom' ? '-4px' : '4px'}) scale(.985)}to{opacity:1;transform:none}}`}</style>}
    </>
  );
}

export default Popover;
