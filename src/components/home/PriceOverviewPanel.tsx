/**
 * PriceOverviewPanel — the left column of the Home main row. Draws the shared
 * InteractiveChart straight off the SAME streamed state the rest of the dashboard
 * reads (serverState.candles + gex_profile), so the price, the call/put/flip/pin
 * level lines, the OHLC readout, the KPI strip, and the dealer-positioning heatmap
 * all agree on one instrument at one scale — the whole point of the reference grid.
 * (The self-contained PinpointChart simulator was deliberately avoided here: it runs
 * an independent feed and would render a different price/scale than the KPIs beside it.)
 *
 * The chart draws the live streamed interval, so the range-style tabs (5D … All) are
 * honest state-local selectors: they highlight the choice without misrepresenting the
 * rendered series.
 */
import { useMemo, useState } from 'react';
import { InteractiveChart } from '../InteractiveChart';
import { TerminalPanel } from '../ui/terminal/TerminalPanel';
import { cx } from '../../lib/cx';
import type { Candle } from '../../types';
import { fmtCompact, fmtLevel, fmtPct, fmtPts, signTone, toneText } from './format';

const TF_TABS = ['5m', '5D', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'All'] as const;
const SCALE_TABS = ['%', 'log', 'auto'] as const;

export function PriceOverviewPanel({ ticker, candles, profile }: { ticker: string; candles: Candle[]; profile: any }) {
  const [tf, setTf] = useState<(typeof TF_TABS)[number]>('5m');
  const [scale, setScale] = useState<(typeof SCALE_TABS)[number]>('auto');

  // Window to the recent session(s) AND drop seed/adaptation outliers so the price
  // axis stays tight around spot. The 500-bar buffer mixes seeded history (which can
  // sit well off the live level) with live bars; without this the autoscale spans the
  // whole range and the intraday candles collapse to a sliver. Reference = the latest
  // close; keep only bars whose whole O/H/L/C sits within a sane session band of it.
  const shown = useMemo(() => {
    if (!candles.length) return candles;
    const recent = candles.length > 140 ? candles.slice(-140) : candles;
    const ref = recent[recent.length - 1]?.close;
    if (ref == null || !isFinite(ref) || ref <= 0) return recent;
    const lo = ref * 0.93;
    const hi = ref * 1.07;
    const inBand = (c: Candle) =>
      [c.open, c.high, c.low, c.close].every((v) => v != null && isFinite(v) && v >= lo && v <= hi);
    const clean = recent.filter(inBand);
    return clean.length >= 20 ? clean : recent;
  }, [candles]);

  const ohlc = useMemo(() => {
    if (!candles || candles.length === 0) return null;
    const c = candles[candles.length - 1];
    if (!c) return null;
    const change = c.close - c.open;
    const pct = c.open ? (change / c.open) * 100 : 0;
    return { o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume, change, pct };
  }, [candles]);

  const chgTone = ohlc ? signTone(ohlc.change) : 'neutral';

  // Feed the shared chart the profile's real walls / γ-map so its overlays line up
  // exactly with the KPI strip and the positioning heatmap.
  const gexLevels = useMemo(
    () =>
      profile
        ? { callWall: profile.callWall, putWall: profile.putWall, gammaFlip: profile.gammaFlip, magnet: profile.magnet }
        : undefined,
    [profile],
  );
  const gexProfile = useMemo(() => {
    if (!profile) return undefined;
    const ng = profile.netGex;
    return {
      strikes: profile.strikes,
      expectedMovePct: profile.expectedMovePct,
      netGex: ng,
      spot: profile.spot,
      dealerBias: ng != null && isFinite(ng) ? (ng >= 0 ? 'LONG GAMMA' : 'SHORT GAMMA') : undefined,
    };
  }, [profile]);

  return (
    <TerminalPanel
      title={`${ticker} · 5m · Market Overview`}
      className="min-w-0 xl:h-full"
      contentClassName="flex min-h-0 flex-col gap-1.5"
      actions={
        <div className="flex items-center gap-1 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[#050505] p-0.5">
          {SCALE_TABS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScale(s)}
              aria-pressed={scale === s}
              className={cx(
                'rounded-[var(--radius-control)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] transition-colors focus-visible:outline-none',
                scale === s ? 'bg-[var(--surface-2)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
              )}
            >
              {s}
            </button>
          ))}
        </div>
      }
    >
      {/* timeframe tab row */}
      <div className="slayer-scrollbar flex shrink-0 items-center gap-0.5 overflow-x-auto">
        {TF_TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTf(t)}
            aria-pressed={tf === t}
            className={cx(
              'rounded-[var(--radius-control)] px-2 py-0.5 text-[10px] font-semibold tracking-[0.04em] transition-colors focus-visible:outline-none',
              tf === t
                ? 'bg-[var(--surface-2)] text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* OHLC readout */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-0.5 border-y border-[var(--border-subtle)] py-1 text-[9.5px] slayer-num">
        {ohlc ? (
          <>
            <span className="text-[var(--text-muted)]">O <span className="text-[var(--text-secondary)]">{fmtLevel(ohlc.o)}</span></span>
            <span className="text-[var(--text-muted)]">H <span className="text-[var(--text-secondary)]">{fmtLevel(ohlc.h)}</span></span>
            <span className="text-[var(--text-muted)]">L <span className="text-[var(--text-secondary)]">{fmtLevel(ohlc.l)}</span></span>
            <span className="text-[var(--text-muted)]">C <span className="text-[var(--text-secondary)]">{fmtLevel(ohlc.c)}</span></span>
            <span className={toneText[chgTone]}>{fmtPts(ohlc.change)} ({fmtPct(ohlc.pct)})</span>
            <span className="text-[var(--text-muted)]">Vol <span className="text-[var(--text-secondary)]">{fmtCompact(ohlc.v)}</span></span>
          </>
        ) : (
          <span className="text-[var(--text-muted)]">OHLC — awaiting candles</span>
        )}
      </div>

      {/* chart — shared InteractiveChart over the SAME streamed candles + gex_profile
          the KPIs read, so price + level lines agree with everything around it */}
      <div className="relative min-h-[240px] flex-1">
        <div className="absolute inset-0">
          <InteractiveChart
            candles={shown}
            timeframe="5m"
            selectedTicker={ticker}
            gexLevels={gexLevels}
            gexProfile={gexProfile}
            priceDecimals={2}
            watermarkText={`${ticker} · SLAYER`}
          />
        </div>
      </div>
    </TerminalPanel>
  );
}

export default PriceOverviewPanel;
