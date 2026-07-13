/**
 * DealerFlowChartPanel — the left column of the Dealer Flow main row. Draws the
 * shared InteractiveChart straight off the SAME streamed state the rest of the
 * page reads (serverState.candles + gex_profile), so price, the call/put/flip/pin
 * level lines, the OHLC readout, the KPI strip and the pressure matrix all agree on
 * one instrument at one scale.
 *
 * The windowing + outlier-guard is copied verbatim from home/PriceOverviewPanel so
 * the price axis stays tight around spot (the 500-bar buffer mixes seeded history
 * that can sit well off the live level). The timeframe tabs are honest state-local
 * selectors: the chart draws the streamed 5m interval, so they highlight the choice
 * without misrepresenting the rendered series.
 */
import { useMemo, useState } from 'react';
import { InteractiveChart } from '../InteractiveChart';
import { TerminalPanel } from '../ui/terminal/TerminalPanel';
import { cx } from '../../lib/cx';
import type { Candle } from '../../types';
import { fmtCompact, fmtLevel, fmtPct, fmtPts, signTone, toneText } from '../home/format';

const TF_TABS = ['1m', '5m', '15m', '1H', '1D'] as const;

export function DealerFlowChartPanel({ ticker, candles, profile }: { ticker: string; candles: Candle[]; profile: any }) {
  const [tf, setTf] = useState<(typeof TF_TABS)[number]>('5m');

  // Window to the recent session(s) AND drop seed/adaptation outliers so the price
  // axis stays tight around spot — the exact guard PriceOverviewPanel uses.
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
      title="Dealer Flow Chart"
      subtitle={`${ticker} · 5m streamed · dealer level overlays`}
      className="min-w-0 xl:h-full"
      contentClassName="flex min-h-0 flex-col gap-1.5"
      actions={
        <div className="slayer-scrollbar flex items-center gap-0.5 overflow-x-auto rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[#050505] p-0.5">
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
      }
    >
      {/* OHLC readout */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-[var(--border-subtle)] pb-1 text-[9.5px] slayer-num">
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

      {/* chart — shared InteractiveChart over the SAME streamed candles + gex_profile */}
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

export default DealerFlowChartPanel;
