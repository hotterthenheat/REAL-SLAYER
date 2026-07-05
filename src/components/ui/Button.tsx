import React from 'react';

/**
 * Button — the terminal's one button. Slayer had no shared button, so every CTA hand-rolled its
 * own classes; the inverted primary style alone was copy-pasted a dozen times. This consolidates
 * the variants that already existed in the wild (primary/secondary/danger/outline/ghost) in the
 * Slayer terminal style. Pattern learned from Animate UI's Button; rebuilt with our tokens, no
 * shadcn/Next deps. Forwards ref and all native button props; adopt incrementally.
 */

type Variant = 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost';
type Size = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

// Deliberately NOT forcing uppercase/tracking here — Slayer's CTAs are a mix of small-caps and
// title-case (e.g. "Enable 2FA"), so casing stays the caller's choice to avoid changing copy.
// Radius defaults to rounded-md but is overridable via className.
const BASE = 'inline-flex items-center justify-center gap-1.5 rounded-md font-bold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-color)]';

const SIZE: Record<Size, string> = {
  sm: 'px-2.5 py-1.5 text-[10px]',
  md: 'px-3 py-2 text-xs',
  lg: 'px-5 py-2.5 text-xs',
  icon: 'p-2',
};

const VARIANT: Record<Variant, string> = {
  primary: 'border border-transparent bg-[var(--text-primary)] text-[var(--bg-base)] hover:opacity-90',
  secondary: 'border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]',
  danger: 'border border-[var(--danger)]/40 bg-transparent text-[var(--danger)] hover:bg-[var(--danger)]/10 hover:border-[var(--danger)]/60',
  outline: 'border border-[var(--border-strong)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-2)]',
  ghost: 'border border-transparent bg-transparent text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)]',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', className = '', type = 'button', ...props }, ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`${BASE} ${SIZE[size]} ${VARIANT[variant]} ${className}`}
      {...props}
    />
  );
});

export default Button;
