import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Slayer terminal Tooltip — a lightweight, dependency-free hover/focus tooltip.
 * Dark, sharp, mono; portals to <body> so it never clips inside chart panels.
 * Reserved for genuinely dense affordances — pair it with <Term> for market-term
 * glossary, not for labelling obvious buttons.
 */

type Side = 'top' | 'bottom';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: Side;
  /** Max width of the bubble in px (default 260). */
  width?: number;
  disabled?: boolean;
}

const GAP = 8; // px between trigger and bubble
const PAD = 8; // viewport edge padding

export function Tooltip({ content, children, side = 'top', width = 260, disabled }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; placement: Side }>({ top: 0, left: 0, placement: side });
  const triggerRef = useRef<HTMLElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const id = useId();

  const place = useCallback(() => {
    const t = triggerRef.current?.getBoundingClientRect();
    const b = bubbleRef.current?.getBoundingClientRect();
    if (!t || !b) return;
    let placement: Side = side;
    if (side === 'top' && t.top - b.height - GAP < PAD) placement = 'bottom';
    if (side === 'bottom' && t.bottom + b.height + GAP > window.innerHeight - PAD) placement = 'top';
    const top = placement === 'top' ? t.top - b.height - GAP : t.bottom + GAP;
    let left = t.left + t.width / 2 - b.width / 2;
    left = Math.max(PAD, Math.min(left, window.innerWidth - b.width - PAD));
    setPos({ top, left, placement });
  }, [side]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onScroll = () => setOpen(false);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (disabled) return children;

  const show = () => setOpen(true);
  const hide = () => setOpen(false);

  const trigger = React.cloneElement(children as React.ReactElement<any>, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
      const r = (children as any).ref;
      if (typeof r === 'function') r(node);
      else if (r) r.current = node;
    },
    onMouseEnter: (e: React.MouseEvent) => { show(); (children.props as any).onMouseEnter?.(e); },
    onMouseLeave: (e: React.MouseEvent) => { hide(); (children.props as any).onMouseLeave?.(e); },
    onFocus: (e: React.FocusEvent) => { show(); (children.props as any).onFocus?.(e); },
    onBlur: (e: React.FocusEvent) => { hide(); (children.props as any).onBlur?.(e); },
    'aria-describedby': open ? id : undefined,
  } as any);

  return (
    <>
      {trigger}
      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={bubbleRef}
          id={id}
          role="tooltip"
          style={{ position: 'fixed', top: pos.top, left: pos.left, maxWidth: width, zIndex: 9999 }}
          className="pointer-events-none animate-[stip_120ms_ease-out] rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] px-2.5 py-2 text-[11px] leading-snug text-[var(--text-secondary)] shadow-[0_8px_28px_-8px_rgba(0,0,0,0.7)]"
        >
          {content}
          <span
            aria-hidden
            style={{
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%) rotate(45deg)',
              width: 7, height: 7,
              background: 'var(--surface-2)',
              borderRight: '1px solid var(--border-strong)',
              borderBottom: '1px solid var(--border-strong)',
              ...(pos.placement === 'top'
                ? { bottom: -4, borderTop: 'none', borderLeft: 'none' }
                : { top: -4, transform: 'translateX(-50%) rotate(225deg)' }),
            }}
          />
        </div>,
        document.body
      )}
      <style>{`@keyframes stip{from{opacity:0;transform:translateY(${side === 'top' ? '2px' : '-2px'}) scale(.98)}to{opacity:1;transform:none}}`}</style>
    </>
  );
}

/**
 * Market-term glossary. Keep definitions short, plain-English, and trader-useful.
 * These are the ONLY things that should get an auto-tooltip.
 */
export const GLOSSARY: Record<string, { label: string; def: string }> = {
  gex: { label: 'GEX', def: 'Gamma Exposure — estimated dealer hedging pressure by strike. Positive GEX dampens moves; negative GEX accelerates them.' },
  vex: { label: 'VEX', def: 'Vanna Exposure — how dealer delta hedges shift as implied volatility changes.' },
  dex: { label: 'DEX', def: 'Delta Exposure — net directional hedging dealers carry across the chain.' },
  cex: { label: 'CEX', def: 'Charm Exposure — how dealer delta decays as time passes, forcing hedging into the close.' },
  vanna: { label: 'Vanna', def: 'Sensitivity of delta to a change in implied volatility — drives hedging when IV moves.' },
  charm: { label: 'Charm', def: 'Delta decay over time — pushes dealer hedging flows, strongest near expiration.' },
  king: { label: 'King', def: 'The strike carrying the largest absolute exposure — the market’s strongest magnet/pin.' },
  callWall: { label: 'Call Wall', def: 'Strike with the heaviest call gamma — tends to act as overhead resistance / dealer supply.' },
  putWall: { label: 'Put Wall', def: 'Strike with the heaviest put gamma — tends to act as support / dealer demand.' },
  gammaFlip: { label: 'Gamma Flip', def: 'Price where net dealer gamma flips sign. Above it, moves are dampened; below it, moves are amplified.' },
  netGex: { label: 'Net GEX', def: 'Total gamma exposure across the book. Large positive = pinning/mean-reversion; negative = trend/volatility.' },
  vwap: { label: 'VWAP', def: 'Volume-Weighted Average Price — the session’s average fill price, a common intraday fair-value anchor.' },
  iv: { label: 'IV', def: 'Implied Volatility — the market’s expected forward volatility priced into options.' },
  oi: { label: 'OI', def: 'Open Interest — the number of option contracts currently outstanding at a strike.' },
  gexNode: { label: 'GEX node', def: 'On-chart marker sized by net gamma at a strike/time — bigger node = stronger dealer pressure there.' },
};

interface TermProps {
  /** Glossary id (see GLOSSARY) or an inline definition via `def`. */
  id?: keyof typeof GLOSSARY;
  def?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  side?: Side;
}

/**
 * <Term id="gex">GEX</Term> — renders a label with a subtle dotted underline that
 * reveals its plain-English definition on hover/focus. Falls back to its children
 * as the label if none is provided.
 */
export function Term({ id, def, children, className = '', side = 'top' }: TermProps) {
  const entry = id ? GLOSSARY[id] : undefined;
  const content = def ?? entry?.def;
  const label = children ?? entry?.label ?? id;
  if (!content) return <>{label}</>;
  return (
    <Tooltip content={content} side={side}>
      <span
        tabIndex={0}
        className={`cursor-help underline decoration-dotted decoration-[var(--text-tertiary)] underline-offset-[3px] outline-none focus-visible:decoration-[var(--text-secondary)] ${className}`}
      >
        {label}
      </span>
    </Tooltip>
  );
}
