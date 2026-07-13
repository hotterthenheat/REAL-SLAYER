/**
 * RealTimeFlowPanel — the multi-ticker flow board of the Dealer Flow bottom row.
 * TICKER | PRICE | %CHG | DELTA | GEX | DEX | VOL | OI | FLOW BIAS. The transport
 * streams live spot prices for every tracked ticker (serverState.liveSpotPrices) but
 * a full dealer chain only for the ticker in view — so PRICE is real for every row,
 * the in-view row is fully sourced from its gex_profile / candles / dealer gauge, and
 * the cells that cannot be sourced for the other tickers read "—" rather than being
 * fabricated. The in-view row carries an IN VIEW badge.
 */
import { TerminalPanel } from '../ui/terminal/TerminalPanel';
import { Th, Badge } from '../home/ui';
import { fmtBnSigned, fmtCompact, fmtPct, fmtPrice2, signTone, toneText, type Tone } from '../home/format';

export interface FlowRow {
  ticker: string;
  price: number | null;
  isInView: boolean;
  chgPct: number | null;
  delta: number | null;
  gex: number | null;
  dex: number | null;
  vol: number | null;
  oi: number | null;
  bias: string | null;
  biasTone: Tone;
}

const num = (v: number | null, signed = false) => (v == null || !isFinite(v) ? '—' : fmtCompact(v, signed));

export function RealTimeFlowPanel({ rows, updated }: { rows: FlowRow[]; updated: string }) {
  return (
    <TerminalPanel
      title="Real-Time Flow"
      subtitle="multi-ticker · live spots"
      className="min-w-0"
      padded={false}
      contentClassName="flex min-h-0 flex-col"
      actions={<Badge label="Partial · in-view sourced" tone="warning" />}
    >
      <div className="slayer-scrollbar max-h-[280px] min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-[var(--bg-panel)]">
            <tr className="border-b border-[var(--border-subtle)]">
              <Th>Ticker</Th>
              <Th align="right">Price</Th>
              <Th align="right">%Chg</Th>
              <Th align="right">Delta</Th>
              <Th align="right">GEX</Th>
              <Th align="right">DEX</Th>
              <Th align="right">Vol</Th>
              <Th align="right">OI</Th>
              <Th align="right">Flow Bias</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={9} className="px-2 py-8 text-center text-[10px] text-[var(--text-muted)]">Only one ticker streaming right now.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.ticker} className="border-b border-[var(--border-subtle)] last:border-0" style={r.isInView ? { background: 'color-mix(in srgb, var(--text-primary) 5%, transparent)' } : undefined}>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    <span className="flex items-center gap-1.5">
                      <span className="slayer-num text-[10.5px] font-semibold text-[var(--text-primary)]">{r.ticker}</span>
                      {r.isInView && (
                        <span className="rounded-[2px] border px-1 py-px text-[7.5px] font-bold uppercase leading-none tracking-[0.08em] slayer-num" style={{ color: 'var(--pin)', borderColor: 'color-mix(in srgb, var(--pin) 55%, transparent)', background: 'color-mix(in srgb, var(--pin) 14%, transparent)' }}>In View</span>
                      )}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right slayer-num text-[10px] text-[var(--text-primary)]">{r.price == null ? '—' : fmtPrice2(r.price)}</td>
                  <td className={`px-2 py-1.5 text-right slayer-num text-[10px] ${r.chgPct == null ? 'text-[var(--text-faint)]' : toneText[signTone(r.chgPct)]}`}>{r.chgPct == null ? '—' : fmtPct(r.chgPct)}</td>
                  <td className={`px-2 py-1.5 text-right slayer-num text-[10px] ${r.delta == null ? 'text-[var(--text-faint)]' : toneText[signTone(r.delta)]}`}>{num(r.delta, true)}</td>
                  <td className={`px-2 py-1.5 text-right slayer-num text-[10px] ${r.gex == null ? 'text-[var(--text-faint)]' : toneText[signTone(r.gex)]}`}>{r.gex == null ? '—' : fmtBnSigned(r.gex)}</td>
                  <td className={`px-2 py-1.5 text-right slayer-num text-[10px] ${r.dex == null ? 'text-[var(--text-faint)]' : toneText[signTone(r.dex)]}`}>{num(r.dex, true)}</td>
                  <td className="px-2 py-1.5 text-right slayer-num text-[10px] text-[var(--text-secondary)]">{num(r.vol)}</td>
                  <td className="px-2 py-1.5 text-right slayer-num text-[10px] text-[var(--text-secondary)]">{num(r.oi)}</td>
                  <td className={`px-2 py-1.5 text-right text-[9.5px] font-semibold uppercase tracking-[0.06em] ${r.bias == null ? 'text-[var(--text-faint)]' : toneText[r.biasTone]}`}>{r.bias ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex shrink-0 items-center justify-between border-t border-[var(--border-subtle)] px-2.5 py-1">
        <span className="slayer-num text-[8px] uppercase tracking-[0.1em] text-[var(--text-tertiary)]">{rows.length} tickers · price streamed</span>
        <span className="slayer-num text-[8px] uppercase tracking-[0.1em] text-[var(--text-tertiary)]">updated {updated} ET</span>
      </div>
    </TerminalPanel>
  );
}

export default RealTimeFlowPanel;
