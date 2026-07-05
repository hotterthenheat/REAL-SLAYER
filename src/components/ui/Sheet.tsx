import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Slayer terminal Sheet — a portalled slide-in panel with a dimmed backdrop, for
 * heavier secondary surfaces (a full expiry ladder, filter stacks, detail drawers)
 * where a Popover would be too small. Slides from any edge; closes on Esc, backdrop
 * click, or the built-in header close. Locks body scroll while open, and animates
 * out (rather than vanishing) when dismissed.
 */

type SheetSide = 'right' | 'left' | 'bottom';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  side?: SheetSide;
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Width (right/left) or height (bottom), as a CSS size. */
  size?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

const EXIT_MS = 190;

const anim: Record<SheetSide, { from: string; base: string }> = {
  right: { from: 'translateX(16px)', base: 'top-0 right-0 h-full border-l' },
  left: { from: 'translateX(-16px)', base: 'top-0 left-0 h-full border-r' },
  bottom: { from: 'translateY(16px)', base: 'bottom-0 left-0 w-full border-t rounded-t-xl' },
};

export function Sheet({ open, onClose, side = 'right', title, description, size, children, footer, className = '' }: SheetProps) {
  // Keep the panel mounted through its exit animation: `mounted` controls DOM
  // presence, `leaving` swaps enter → exit keyframes.
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setLeaving(false);
      return;
    }
    if (!mounted) return;
    setLeaving(true);
    const t = window.setTimeout(() => { setMounted(false); setLeaving(false); }, EXIT_MS);
    return () => window.clearTimeout(t);
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  if (!mounted || typeof document === 'undefined') return null;

  const cfg = anim[side];
  const sizeStyle: React.CSSProperties = side === 'bottom'
    ? { height: size ?? '70vh', maxHeight: '90vh' }
    : { width: size ?? '380px', maxWidth: '92vw' };

  const backdropAnim = leaving ? 'sheetfadeout 170ms ease-in forwards' : 'sheetfade 140ms ease-out';
  const panelAnim = leaving ? `sheetout ${EXIT_MS}ms ease-in forwards` : 'sheetin 200ms cubic-bezier(.16,1,.3,1)';

  return createPortal(
    <div className="fixed inset-0 z-[9997]" role="dialog" aria-modal="true">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        style={{ animation: backdropAnim }}
      />
      <div
        style={{ ...sizeStyle, animation: panelAnim }}
        className={`absolute ${cfg.base} flex flex-col border-[var(--border-strong)] bg-[var(--surface)] shadow-[0_0_60px_-8px_rgba(0,0,0,0.85)] ${className}`}
      >
        {(title || description) && (
          <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
            <div className="flex flex-col gap-0.5 min-w-0">
              {title && <span className="font-mono text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)]">{title}</span>}
              {description && <span className="text-[11px] text-[var(--text-tertiary)]">{description}</span>}
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 rounded-md border border-[var(--border)] px-1.5 py-1 text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="border-t border-[var(--border)] px-4 py-3">{footer}</div>}
      </div>
      <style>{`
        @keyframes sheetfade{from{opacity:0}to{opacity:1}}
        @keyframes sheetfadeout{from{opacity:1}to{opacity:0}}
        @keyframes sheetin{from{opacity:.4;transform:${cfg.from}}to{opacity:1;transform:none}}
        @keyframes sheetout{from{opacity:1;transform:none}to{opacity:0;transform:${cfg.from}}}
        @media (prefers-reduced-motion: reduce){[role=dialog]>div{animation-duration:.01ms!important}}
      `}</style>
    </div>,
    document.body,
  );
}

export default Sheet;
