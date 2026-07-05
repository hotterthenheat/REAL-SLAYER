import { useCallback, useRef, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';

/**
 * CopyButton — one copy-to-clipboard control with an animated confirmation, replacing the
 * copied-state + setTimeout + "Copy"/"Copied" toggle that was hand-rolled in Settings, the 2FA
 * flow, and elsewhere. Pattern learned from Animate UI's copy button; rebuilt in Slayer's
 * terminal style (no shadcn/Next deps). Reduced-motion aware, and announces the copy via
 * aria-live so it isn't a silent success.
 */

type Size = 'sm' | 'md' | 'icon';
type Variant = 'default' | 'primary';

interface CopyButtonProps {
  /** The text placed on the clipboard. */
  content: string;
  /** Visible label when idle (default "Copy"). The copied label is always "Copied". */
  label?: string;
  size?: Size;
  /** 'default' = quiet bordered chip; 'primary' = prominent inverted CTA (e.g. share a link). */
  variant?: Variant;
  className?: string;
  title?: string;
  onCopied?: () => void;
}

const SIZE: Record<Size, string> = {
  sm: 'px-2 py-1 text-[9px] gap-1',
  md: 'px-3 py-2 text-[10px] gap-1.5',
  icon: 'p-1.5',
};

const IDLE: Record<Variant, string> = {
  default: 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]',
  primary: 'border-transparent bg-[var(--text-primary)] text-[var(--bg-base)] hover:opacity-90',
};

export function CopyButton({ content, label = 'Copy', size = 'md', variant = 'default', className = '', title, onCopied }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduce = useReducedMotion();

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard?.writeText(content);
    } catch {
      /* clipboard blocked (insecure context / permissions) — still flip the state so the
         user gets feedback; the value is on screen to copy manually. */
    }
    setCopied(true);
    onCopied?.();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  }, [content, onCopied]);

  const iconSize = size === 'icon' ? 'w-3.5 h-3.5' : 'w-3 h-3';
  const anim = reduce
    ? { initial: false as const, animate: {}, exit: {} }
    : { initial: { scale: 0.6, opacity: 0 }, animate: { scale: 1, opacity: 1 }, exit: { scale: 0.6, opacity: 0 } };

  return (
    <button
      type="button"
      onClick={copy}
      title={title}
      aria-label={copied ? 'Copied to clipboard' : `Copy ${label.toLowerCase()}`}
      className={`inline-flex items-center justify-center rounded-md border font-bold uppercase tracking-widest transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-color)] ${SIZE[size]} ${
        copied ? 'border-[var(--success)]/50 bg-[var(--success)]/10 text-[var(--success)]' : IDLE[variant]
      } ${className}`}
    >
      <span className="relative inline-flex w-3.5 h-3.5 items-center justify-center" aria-hidden="true">
        <AnimatePresence mode="wait" initial={false}>
          {copied ? (
            <motion.span key="check" {...anim} transition={{ duration: 0.15 }} className="absolute inset-0 inline-flex items-center justify-center">
              <Check className={iconSize} />
            </motion.span>
          ) : (
            <motion.span key="copy" {...anim} transition={{ duration: 0.15 }} className="absolute inset-0 inline-flex items-center justify-center">
              <Copy className={iconSize} />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      {size !== 'icon' && <span>{copied ? 'Copied' : label}</span>}
      <span className="sr-only" aria-live="polite">{copied ? 'Copied to clipboard' : ''}</span>
    </button>
  );
}

export default CopyButton;
