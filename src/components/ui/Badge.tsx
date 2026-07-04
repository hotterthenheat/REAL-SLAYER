import React from 'react';

/**
 * Slayer terminal Badge — a compact status pill in the terminal's token palette.
 * Replaces the app's many hand-rolled `bg-x/10 border-x/30 text-x` inline pills with
 * one consistent chrome. Tones map to market semantics (bull=success, bear=danger,
 * model/warn, live/info, accent). Add `dot` for a leading status dot, `pulse` to make
 * it breathe (live feeds only). Keep the label terse — this is chrome, not prose.
 */

type Tone = 'neutral' | 'success' | 'danger' | 'warning' | 'info' | 'accent';
type Size = 'sm' | 'md';

const TONES: Record<Tone, { fg: string; bg: string; bd: string }> = {
  neutral: { fg: 'var(--text-secondary)', bg: 'var(--surface-3)', bd: 'var(--border)' },
  success: { fg: 'var(--success)', bg: 'color-mix(in srgb, var(--success) 12%, transparent)', bd: 'color-mix(in srgb, var(--success) 30%, transparent)' },
  danger: { fg: 'var(--danger)', bg: 'color-mix(in srgb, var(--danger) 12%, transparent)', bd: 'color-mix(in srgb, var(--danger) 30%, transparent)' },
  warning: { fg: 'var(--warning)', bg: 'color-mix(in srgb, var(--warning) 12%, transparent)', bd: 'color-mix(in srgb, var(--warning) 30%, transparent)' },
  info: { fg: 'var(--info)', bg: 'color-mix(in srgb, var(--info) 12%, transparent)', bd: 'color-mix(in srgb, var(--info) 30%, transparent)' },
  accent: { fg: 'var(--accent-color)', bg: 'color-mix(in srgb, var(--accent-color) 12%, transparent)', bd: 'color-mix(in srgb, var(--accent-color) 30%, transparent)' },
};

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  size?: Size;
  dot?: boolean;
  pulse?: boolean;
}

export function Badge({ tone = 'neutral', size = 'md', dot, pulse, className = '', style, children, ...rest }: BadgeProps) {
  const t = TONES[tone];
  const sz = size === 'sm' ? 'text-[8px] px-1.5 py-[1px] gap-1' : 'text-[9.5px] px-2 py-0.5 gap-1.5';
  return (
    <span
      className={`inline-flex items-center rounded font-mono font-black uppercase tracking-widest leading-none whitespace-nowrap ${sz} ${className}`}
      style={{ color: t.fg, background: t.bg, border: `1px solid ${t.bd}`, ...style }}
      {...rest}
    >
      {dot && (
        <span className="relative flex h-1.5 w-1.5">
          {pulse && <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70" style={{ background: t.fg }} />}
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: t.fg }} />
        </span>
      )}
      {children}
    </span>
  );
}

export default Badge;
