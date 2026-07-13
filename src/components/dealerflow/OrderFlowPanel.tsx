/**
 * OrderFlowPanel — the order-flow rail of the Dealer Flow middle row. The platform
 * transport does not stream an L2 depth-of-market / time-and-sales tape, so rather
 * than fabricate prints this panel derives an HONEST tape proxy from the streamed
 * candles: signed volume = volume × sign(close−open). From that it builds the
 * cumulative-delta line, the delta-by-price diverging histogram, and the BUY/SELL/
 * DELTA/VWAP/POC footer. The derivation is badged MODELED · candle proxy. If no
 * candles are streaming, the honest "awaiting order-flow feed" state stands.
 *
 * Tabs (FLOW / PRINTS / GEX CHANGE / VOLUME) are state-local selectors over the same
 * real material; PRINTS renders the honest no-L2-feed state (there is no print tape).
 */
import { useMemo, useState } from 'react';
import { TerminalPanel } from '../ui/terminal/TerminalPanel';
import { Badge } from '../home/ui';
import { cx } from '../../lib/cx';
import type { Candle } from '../../types';
import { fmtCompact, fmtPrice2 } from '../home/format';

const TABS = ['FLOW', 'PRINTS', 'GEX CHANGE', 'VOLUME'] as const;
type Tab = (typeof TABS)[number];
const BUCKETS = 12;

const POS = 'var(--positive-ink)';
const NEG = 'var(--negative-ink)';

export function OrderFlowPanel({ candles, netGex, netGexTrend }: { candles: Candle[]; netGex?: number; netGexTrend: string }) {
  const [tab, setTab] = useState<Tab>('FLOW');

  const flow = useMemo(() => {
    const cs = (candles || []).filter((c) => c && isFinite(c.close) && isFinite(c.open) && isFinite(c.volume));
    if (cs.length < 2) return null;
    const win = cs.slice(-120);
    let buyVol = 0, sellVol = 0, pv = 0, vol = 0, cum = 0;
    const cumSeries: number[] = [];
    let lo = Infinity, hi = -Infinity;
    for (const c of win) {
      const typical = (c.high + c.low + c.close) / 3;
      lo = Math.min(lo, typical); hi = Math.max(hi, typical);
      const dir = c.close > c.open ? 1 : c.close < c.open ? -1 : 0;
      if (dir > 0) buyVol += c.volume; else if (dir < 0) sellVol += c.volume;
      pv += typical * c.volume; vol += c.volume;
      cum += dir * c.volume;
      cumSeries.push(cum);
    }
    if (!(hi > lo)) return null;
    // Delta-by-price buckets (buy / sell volume per price band).
    const span = hi - lo || 1;
    const buckets = Array.from({ length: BUCKETS }, (_, i) => ({
      price: hi - ((i + 0.5) / BUCKETS) * span, // top bucket = highest price
      buy: 0, sell: 0, total: 0,
    }));
    for (const c of win) {
      const typical = (c.high + c.low + c.close) / 3;
      let idx = Math.floor(((hi - typical) / span) * BUCKETS);
      idx = Math.max(0, Math.min(BUCKETS - 1, idx));
      const dir = c.close > c.open ? 1 : c.close < c.open ? -1 : 0;
      if (dir >= 0) buckets[idx].buy += c.volume; else buckets[idx].sell += c.volume;
      buckets[idx].total += c.volume;
    }
    const maxSide = Math.max(1, ...buckets.map((b) => Math.max(b.buy, b.sell)));
    const maxTotal = Math.max(1, ...buckets.map((b) => b.total));
    const poc = buckets.reduce((m, b) => (b.total > m.total ? b : m), buckets[0]);
    const vwap = vol > 0 ? pv / vol : null;
    return {
      buyVol, sellVol, delta: buyVol - sellVol, vwap, poc: poc.price,
      cumSeries, cumLast: cumSeries[cumSeries.length - 1] ?? 0,
      buckets, maxSide, maxTotal,
    };
  }, [candles]);

  const tabBtn = (t: Tab) => (
    <button
      key={t}
      type="button"
      onClick={() => setTab(t)}
      aria-pressed={tab === t}
      className={cx(
        'rounded-[var(--radius-control)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] transition-colors focus-visible:outline-none',
        tab === t ? 'bg-[var(--surface-2)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
      )}
    >
      {t}
    </button>
  );

  // Cumulative-delta sparkline path.
  const cdPath = useMemo(() => {
    if (!flow || flow.cumSeries.length < 2) return '';
    const cd = flow.cumSeries;
    const mn = Math.min(...cd), mx = Math.max(...cd), rng = mx - mn || 1;
    return cd.map((v, i) => `${(i / (cd.length - 1)) * 100},${30 - ((v - mn) / rng) * 28 - 1}`).join(' ');
  }, [flow]);
  const cdZeroY = useMemo(() => {
    if (!flow || flow.cumSeries.length < 2) return 15;
    const cd = flow.cumSeries;
    const mn = Math.min(...cd), mx = Math.max(...cd), rng = mx - mn || 1;
    return 30 - ((0 - mn) / rng) * 28 - 1;
  }, [flow]);

  const stat = (label: string, value: string, color?: string) => (
    <div className="min-w-0 flex-1 px-2 py-1">
      <div className="text-[7.5px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</div>
      <div className="mt-0.5 slayer-num text-[10.5px] font-semibold tabular-nums" style={{ color: color ?? 'var(--text-primary)' }}>{value}</div>
    </div>
  );

  const histogram = (mode: 'delta' | 'volume') => (
    <div className="flex flex-col gap-px">
      {flow!.buckets.map((b, i) => {
        const isPoc = b.price === flow!.poc;
        if (mode === 'delta') {
          const buyW = (b.buy / flow!.maxSide) * 100;
          const sellW = (b.sell / flow!.maxSide) * 100;
          return (
            <div key={i} className="flex items-center gap-1 text-[8px] slayer-num">
              <span className="w-9 shrink-0 text-right text-[var(--text-tertiary)]">{fmtPrice2(b.price)}</span>
              <span className="flex h-[9px] flex-1 items-stretch">
                <span className="flex flex-1 justify-end">
                  <span style={{ width: `${sellW}%`, background: NEG }} className="rounded-l-[1px]" />
                </span>
                <span aria-hidden className="w-px bg-[var(--border-mid)]" />
                <span className="flex flex-1 justify-start">
                  <span style={{ width: `${buyW}%`, background: POS }} className="rounded-r-[1px]" />
                </span>
              </span>
            </div>
          );
        }
        const w = (b.total / flow!.maxTotal) * 100;
        return (
          <div key={i} className="flex items-center gap-1 text-[8px] slayer-num">
            <span className="w-9 shrink-0 text-right text-[var(--text-tertiary)]">{fmtPrice2(b.price)}</span>
            <span className="h-[9px] flex-1">
              <span className="block h-full rounded-[1px]" style={{ width: `${w}%`, background: isPoc ? 'var(--pin)' : 'color-mix(in srgb, var(--call) 60%, transparent)' }} />
            </span>
          </div>
        );
      })}
    </div>
  );

  return (
    <TerminalPanel
      title="Order Flow"
      className="min-w-0"
      padded={false}
      contentClassName="flex min-h-0 flex-col"
      actions={
        <div className="slayer-scrollbar flex items-center gap-0.5 overflow-x-auto rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[#050505] p-0.5">
          {TABS.map(tabBtn)}
        </div>
      }
    >
      {!flow ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Awaiting order-flow feed</div>
          <p className="max-w-[220px] text-[9.5px] leading-relaxed text-[var(--text-muted)]">
            Cumulative delta and delta-by-price activate when the depth-of-market tape (or a candle stream) is connected.
          </p>
        </div>
      ) : tab === 'PRINTS' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Awaiting L2 print tape</div>
          <p className="max-w-[220px] text-[9.5px] leading-relaxed text-[var(--text-muted)]">
            Time-and-sales prints require the depth-of-market stream, which this transport does not carry.
          </p>
        </div>
      ) : tab === 'GEX CHANGE' ? (
        <div className="flex flex-1 flex-col justify-center gap-2 p-3">
          <div className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Net GEX · frame trend</div>
          <div className="slayer-num text-[22px] font-bold leading-none" style={{ color: netGex == null ? 'var(--text-faint)' : netGex >= 0 ? POS : NEG }}>
            {netGex == null || !isFinite(netGex) ? '—' : fmtCompact(netGex, true)}
          </div>
          <div className="text-[9.5px] text-[var(--text-secondary)]">{netGexTrend} · observed frame-over-frame</div>
          <p className="mt-1 text-[9px] leading-relaxed text-[var(--text-muted)]">Per-strike GEX-change deltas require successive chain frames; the live trend of the aggregate is shown.</p>
        </div>
      ) : (
        <>
          {tab === 'FLOW' && (
            <div className="border-b border-[var(--border-subtle)] p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Cumulative Delta</span>
                <span className="slayer-num text-[11px] font-bold tabular-nums" style={{ color: flow.cumLast >= 0 ? POS : NEG }}>
                  {flow.cumLast >= 0 ? '+' : ''}{fmtCompact(flow.cumLast)}
                </span>
              </div>
              <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="mt-1.5 h-10 w-full">
                <line x1="0" y1={cdZeroY} x2="100" y2={cdZeroY} stroke="var(--border-mid)" strokeWidth="0.5" />
                <polyline points={cdPath} fill="none" stroke={flow.cumLast >= 0 ? POS : NEG} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
              </svg>
            </div>
          )}
          <div className="min-h-0 flex-1 p-2.5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                {tab === 'VOLUME' ? 'Volume by Price' : 'Delta by Price'}
              </span>
              {tab === 'VOLUME' && <span className="text-[7.5px] uppercase tracking-[0.1em] text-[var(--pin)]">POC</span>}
              {tab === 'FLOW' && (
                <span className="flex items-center gap-2 text-[7.5px] uppercase tracking-[0.1em]">
                  <span style={{ color: NEG }}>sell</span><span style={{ color: POS }}>buy</span>
                </span>
              )}
            </div>
            {histogram(tab === 'VOLUME' ? 'volume' : 'delta')}
          </div>
          {/* footer stats */}
          <div className="flex shrink-0 flex-wrap border-t border-[var(--border-subtle)] divide-x divide-[var(--border-subtle)]">
            {stat('Buy Vol', fmtCompact(flow.buyVol), POS)}
            {stat('Sell Vol', fmtCompact(flow.sellVol), NEG)}
            {stat('Delta', `${flow.delta >= 0 ? '+' : ''}${fmtCompact(flow.delta)}`, flow.delta >= 0 ? POS : NEG)}
            {stat('VWAP', flow.vwap != null ? fmtPrice2(flow.vwap) : '—')}
            {stat('POC', fmtPrice2(flow.poc))}
          </div>
        </>
      )}

      <div className="flex shrink-0 items-center justify-end border-t border-[var(--border-subtle)] px-2.5 py-1">
        <Badge label="Modeled · candle proxy" tone="warning" />
      </div>
    </TerminalPanel>
  );
}

export default OrderFlowPanel;
