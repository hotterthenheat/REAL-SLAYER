import React from 'react';
import { Search, X } from 'lucide-react';

/**
 * SearchInput — the one search field for the terminal. The app had several hand-rolled search
 * bars (Admin user search, Pinpoint market search, the SkyVision scanner filter) each with its
 * own icon placement, casing, clear affordance and focus treatment. This unifies the visual
 * language while staying flexible enough for the specialised ones: `variant="accent"` keeps
 * Pinpoint's accent terminal look, `uppercase` matches the scanner filter, `rightSlot` carries a
 * kbd hint, and `onFocus`/`onClick` let a caller keep its own dropdown/combobox behaviour.
 */

type Size = 'sm' | 'md';
type Variant = 'default' | 'accent';

export interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  /** Accessible name — required; rendered sr-only when no visible label exists. */
  ariaLabel: string;
  placeholder?: string;
  size?: Size;
  variant?: Variant;
  uppercase?: boolean;
  /** Show a pulsing accent dot (Pinpoint's live-search cue). */
  pulseDot?: boolean;
  /** When set, a clear (×) button appears while there's a value. */
  onClear?: () => void;
  /** Right-aligned content — e.g. a keyboard hint. */
  rightSlot?: React.ReactNode;
  className?: string;
  inputClassName?: string;
  id?: string;
  autoFocus?: boolean;
  onFocus?: () => void;
  onClick?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  inputRef?: React.Ref<HTMLInputElement>;
}

const SIZE: Record<Size, string> = {
  sm: 'h-8 text-[10px]',
  md: 'h-9 text-[11px]',
};

export function SearchInput({
  value, onChange, ariaLabel, placeholder, size = 'md', variant = 'default',
  uppercase, pulseDot, onClear, rightSlot, className = '', inputClassName = '',
  id, autoFocus, onFocus, onClick, onKeyDown, inputRef,
}: SearchInputProps) {
  const accent = variant === 'accent';
  const iconColor = accent ? 'text-[var(--accent-color)]' : 'text-[var(--text-tertiary)]';
  return (
    <div
      onClick={onClick}
      className={`relative flex items-center gap-2 rounded-md border px-3 transition-colors ${SIZE[size]} ${
        accent
          ? 'bg-[var(--surface)] border-[var(--accent-color)]/30 hover:border-[var(--accent-color)] focus-within:border-[var(--border-strong)]'
          : 'bg-[var(--surface-2)] border-[var(--border)] focus-within:border-[var(--border-strong)]'
      } ${className}`}
    >
      {pulseDot
        ? <span className="w-2 h-2 shrink-0 rounded-sm bg-[var(--accent-color)] animate-pulse opacity-80" aria-hidden="true" />
        : <Search className={`w-3.5 h-3.5 shrink-0 ${iconColor}`} aria-hidden="true" />}
      <label htmlFor={id} className="sr-only">{ariaLabel}</label>
      <input
        id={id}
        ref={inputRef}
        type="text"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        aria-label={ariaLabel}
        placeholder={placeholder}
        className={`w-full min-w-0 bg-transparent border-none outline-none font-mono tracking-widest ${
          accent ? 'text-[var(--accent-color)] placeholder:text-[var(--accent-color)]/40' : 'text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]'
        } ${uppercase ? 'uppercase' : ''} ${inputClassName}`}
      />
      {onClear && value.length > 0 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          aria-label="Clear search"
          className="shrink-0 rounded p-0.5 text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-color)]"
        >
          <X className="w-3 h-3" />
        </button>
      )}
      {rightSlot && <div className="shrink-0">{rightSlot}</div>}
    </div>
  );
}

export default SearchInput;
