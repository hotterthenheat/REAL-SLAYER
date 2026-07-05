import { useId } from 'react';

/**
 * Slayer terminal Switch — an accessible on/off toggle for boolean settings
 * (multi-expiry aggregation, auto-refresh, overlay layers). Keyboard-operable,
 * ARIA switch role, Slayer tokens. On = accent/success track; off = inset surface.
 * Reserve for true binary state; use ToggleGroup for 2+ mutually-exclusive choices.
 */

type Tone = 'accent' | 'success';
type Size = 'sm' | 'md';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  /** Visually-hidden label when no visible text is rendered. */
  ariaLabel?: string;
  tone?: Tone;
  size?: Size;
  disabled?: boolean;
  className?: string;
  id?: string;
}

const TONE: Record<Tone, string> = { accent: 'var(--accent-color)', success: 'var(--success)' };

export function Switch({ checked, onChange, label, ariaLabel, tone = 'accent', size = 'md', disabled, className = '', id }: SwitchProps) {
  const auto = useId();
  const sid = id ?? auto;
  const dims = size === 'sm'
    ? { w: 30, h: 16, knob: 11, off: 2, on: 16 }
    : { w: 38, h: 20, knob: 14, off: 3, on: 21 };
  const on = TONE[tone];

  const btn = (
    <button
      type="button"
      role="switch"
      id={sid}
      aria-checked={checked}
      aria-label={label ? undefined : ariaLabel}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative shrink-0 rounded-full border transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]/40 ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
      style={{
        width: dims.w,
        height: dims.h,
        background: checked ? `color-mix(in srgb, ${on} 26%, transparent)` : 'var(--surface-3)',
        borderColor: checked ? `color-mix(in srgb, ${on} 55%, transparent)` : 'var(--border-strong)',
      }}
    >
      <span
        className="absolute top-1/2 rounded-full shadow-sm transition-transform duration-200"
        style={{
          width: dims.knob,
          height: dims.knob,
          left: dims.off,
          // GPU-composited slide (translateX) instead of animating the layout `left`.
          transform: `translateY(-50%) translateX(${checked ? dims.on - dims.off : 0}px)`,
          background: checked ? on : 'var(--text-tertiary)',
        }}
      />
    </button>
  );

  if (!label) return <span className={className}>{btn}</span>;
  return (
    <label htmlFor={sid} className={`inline-flex items-center gap-2 select-none ${disabled ? 'opacity-40' : 'cursor-pointer'} ${className}`}>
      {btn}
      <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">{label}</span>
    </label>
  );
}

export default Switch;
