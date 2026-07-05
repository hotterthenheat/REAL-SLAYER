/**
 * Slayer terminal Spinner — the one indeterminate-wait indicator, so every loader
 * across the app (auth gate, chart mount, form submit) reads the same. Carries
 * role="status" + an accessible label. For measurable progress use Progress; for
 * data-panel placeholders use Skeleton.
 */

type Size = 'xs' | 'sm' | 'md' | 'lg';
type Tone = 'primary' | 'secondary' | 'accent' | 'onAccent';

const SIZE: Record<Size, number> = { xs: 14, sm: 16, md: 24, lg: 32 };
const BORDER: Record<Size, number> = { xs: 2, sm: 2, md: 2, lg: 3 };
const TONE: Record<Tone, string> = {
  primary: 'var(--text-primary)',
  secondary: 'var(--text-secondary)',
  accent: 'var(--accent-color)',
  onAccent: 'var(--surface)',
};

interface SpinnerProps {
  size?: Size;
  tone?: Tone;
  /** Accessible label announced to screen readers. */
  label?: string;
  className?: string;
}

export function Spinner({ size = 'md', tone = 'primary', label = 'Loading', className = '' }: SpinnerProps) {
  const px = SIZE[size];
  const color = TONE[tone];
  return (
    <span
      role="status"
      aria-label={label}
      className={`inline-block animate-spin rounded-full ${className}`}
      style={{
        width: px,
        height: px,
        // A single bright arc on a faint ring reads as motion even at small sizes.
        border: `${BORDER[size]}px solid color-mix(in srgb, ${color} 22%, transparent)`,
        borderTopColor: color,
      }}
    />
  );
}

export default Spinner;
