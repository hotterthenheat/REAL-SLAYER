/*
  Candlestick color themes. The heatmap/nodes carry the page's color, so the
  default keeps price structure neutral (monochrome) to complement the minimal
  dark UI without competing with the analytics. Flip CANDLE_THEME to switch.
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
  // Neutral, premium — cool light up / slate down
  mono: {
    up: '#c7cfd9',
    down: '#565c68',
    wickUp: '#c7cfd9',
    wickDown: '#565c68',
    volUp: 'rgba(199,207,217,0.20)',
    volDown: 'rgba(86,92,104,0.30)',
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
