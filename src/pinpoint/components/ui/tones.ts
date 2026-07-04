/*
  Shared tone maps for directional/status color.
  Full class strings kept static so Tailwind JIT picks them up.
  Rule: a tone is never the only signal — always paired with a label or icon.
*/

export type Tone = 'bull' | 'bear' | 'warn' | 'select' | 'neutral';

export const toneText: Record<Tone, string> = {
  bull: 'text-bull',
  bear: 'text-bear',
  warn: 'text-warn',
  select: 'text-select',
  neutral: 'text-textPrimary',
};

export const toneDot: Record<Tone, string> = {
  bull: 'bg-bull',
  bear: 'bg-bear',
  warn: 'bg-warn',
  select: 'bg-select',
  neutral: 'bg-textMuted',
};

export const toneBadge: Record<Tone, string> = {
  bull: 'bg-bull/10 text-bull border-bull/20',
  bear: 'bg-bear/10 text-bear border-bear/20',
  warn: 'bg-warn/10 text-warn border-warn/20',
  select: 'bg-select/10 text-select border-select/20',
  neutral: 'bg-white/[0.04] text-textSecondary border-borderSubtle',
};

export const toneBar: Record<Tone, string> = {
  bull: 'bg-bull/70',
  bear: 'bg-bear/70',
  warn: 'bg-warn/70',
  select: 'bg-select/70',
  neutral: 'bg-white/20',
};
