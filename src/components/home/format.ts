/**
 * Local formatting + tone helpers for the Home terminal dashboard. These live
 * beside the dashboard widgets (never in the shared format lib) so the page can
 * carry its own compact $/B/M money format without touching global files. The
 * magnitude helpers mirror PinpointGexView's fmtBnSigned / fmtCompact so the two
 * surfaces read the same numbers.
 */

/** Semantic data tones — never the silver brand accent (that's brand-only). */
export type Tone = 'neutral' | 'positive' | 'negative' | 'call' | 'pin' | 'warning' | 'flip' | 'king';

export const toneText: Record<Tone, string> = {
  neutral: 'text-[var(--text-primary)]',
  positive: 'text-[var(--positive-ink)]',
  negative: 'text-[var(--negative-ink)]',
  call: 'text-[var(--call)]',
  pin: 'text-[var(--pin)]',
  warning: 'text-[var(--warning-ink)]',
  flip: 'text-[var(--flip)]',
  king: 'text-[var(--king)]',
};

export const toneVar: Record<Tone, string> = {
  neutral: 'var(--text-primary)',
  positive: 'var(--positive-ink)',
  negative: 'var(--negative-ink)',
  call: 'var(--call)',
  pin: 'var(--pin)',
  warning: 'var(--warning-ink)',
  flip: 'var(--flip)',
  king: 'var(--king)',
};

/** Sign → tone. Zero reads neutral. */
export function signTone(v: number | null | undefined): Tone {
  if (v == null || !isFinite(v) || v === 0) return 'neutral';
  return v > 0 ? 'positive' : 'negative';
}

/** Level price with thousands separators, no decimals: 5,570. */
export function fmtLevel(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—';
  return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/** Price with two decimals + thousands separators: 5,573.42. */
export function fmtPrice2(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—';
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Signed big-number in billions: "-11.86B" / "+3.40B" (falls back to M). */
export function fmtBnSigned(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—';
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '+';
  if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(1)}M`;
  return `${sign}${a.toFixed(0)}`;
}

/** Compact magnitude with optional sign: +842.6M, -28.52B, 4.1K. */
export function fmtCompact(v: number | null | undefined, signed = false): string {
  if (v == null || !isFinite(v)) return '—';
  const sign = v < 0 ? '-' : signed ? '+' : '';
  const a = Math.abs(v);
  if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(a / 1e9 >= 100 ? 0 : 2)}B`;
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(a / 1e6 >= 100 ? 0 : 1)}M`;
  if (a >= 1e3) return `${sign}${(a / 1e3).toFixed(a / 1e3 >= 100 ? 0 : 1)}K`;
  return `${sign}${a.toFixed(0)}`;
}

/** Bare magnitude (no sign — colour encodes direction): 1.3B, 212M, 4K. */
export function fmtMag(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e9) return `${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(a / 1e6).toFixed(0)}M`;
  if (a >= 1e3) return `${(a / 1e3).toFixed(0)}K`;
  return `${a.toFixed(0)}`;
}

/** Signed percent, N decimals: +0.33%. */
export function fmtPct(v: number | null | undefined, decimals = 2, signed = true): string {
  if (v == null || !isFinite(v)) return '—';
  const sign = signed && v > 0 ? '+' : '';
  return `${sign}${v.toFixed(decimals)}%`;
}

/** Signed points, N decimals: +18.37. */
export function fmtPts(v: number | null | undefined, decimals = 2): string {
  if (v == null || !isFinite(v)) return '—';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(decimals)}`;
}

/** New-York wall-clock, honest ET stamp. `HH:MM` or `HH:MM:SS`. Never called at
 *  module scope — always inside render/effect so it reflects the current frame. */
export function nyClock(withSeconds = false): string {
  return new Date().toLocaleTimeString('en-US', {
    hour12: false,
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
  });
}
