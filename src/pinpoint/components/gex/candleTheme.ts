/*
  Candlestick color themes. Institutional default: emerald up / rose down, matching
  the reference terminals (Flowseeker) — price direction reads instantly by color.
  Flip CANDLE_THEME_KEY to switch.
*/

export interface CandleTheme {
  up: string;
  down: string;
  wickUp: string;
  wickDown: string;
  volUp: string;
  volDown: string;
}

export const CANDLE_THEMES = {
  // Institutional emerald / rose — green up, red down (Flowseeker reference).
  mono: {
    up: '#34D399',
    down: '#F86A6F',
    wickUp: '#26C281',
    wickDown: '#D6484D',
    volUp: 'rgba(38,194,129,0.22)',
    volDown: 'rgba(214,72,77,0.24)',
  },
  // Classic emerald / rose
  classic: {
    up: '#10b981',
    down: '#f43f5e',
    wickUp: '#10b981',
    wickDown: '#f43f5e',
    volUp: 'rgba(16,185,129,0.28)',
    volDown: 'rgba(244,63,94,0.28)',
  },
  // Desaturated sage / clay
  muted: {
    up: '#6fae94',
    down: '#c47484',
    wickUp: '#6fae94',
    wickDown: '#c47484',
    volUp: 'rgba(111,174,148,0.24)',
    volDown: 'rgba(196,116,132,0.26)',
  },
} as const;

export type CandleThemeKey = keyof typeof CANDLE_THEMES;

export const CANDLE_THEME_KEY: CandleThemeKey = 'mono';

export const candleTheme: CandleTheme = CANDLE_THEMES[CANDLE_THEME_KEY];
