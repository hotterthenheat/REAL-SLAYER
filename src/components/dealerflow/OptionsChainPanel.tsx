/**
 * OptionsChainPanel — the near-the-money 0DTE chain of the Dealer Flow middle row.
 * CALLS (BID ASK LAST Δ VOL OI) | STRIKE | PUTS (BID ASK LAST Δ VOL OI). Quotes and
 * greeks come from the server's real near-the-money option_chain (bid/ask/delta/OI/
 * IV); per-side VOL is joined from gex_profile.strikes. Only sourceable columns
 * carry a value — LAST is not in this feed, so it renders "—" for every row rather
 * than being fabricated; when no per-contract chain streams, BID/ASK/Δ fall back to
 * "—" and OI/VOL come from the profile. The row nearest spot is highlighted.
 */
import { useMemo } from 'react';
import { TerminalPanel } from '../ui/terminal/TerminalPanel';
import { fmtCompact, fmtLevel } from '../home/format';

const CALL = 'var(--call)';
const PUT = 'var(--negative-ink)';

interface Side { bid?: number; ask?: number; delta?: number; vol?: number; oi?: number; }
interface ChainRow { strike: number; call: Side; put: Side; }

const q = (v?: number) => (v == null || !isFinite(v) || v <= 0 ? '—' : v.toFixed(2));
const d = (v?: number) => (v == null || !isFinite(v) ? '—' : v.toFixed(2));
const n = (v?: number) => (v == null || !isFinite(v) ? '—' : fmtCompact(v));

export function OptionsChainPanel({ profile, optionChain }: { profile: any; optionChain?: any[] }) {
  const spot: number | undefined = profile?.spot;

  const model = useMemo(() => {
    const strikes: any[] = Array.isArray(profile?.strikes) ? profile.strikes.filter((s: any) => isFinite(s?.strike)) : [];
    const volByStrike = new Map<number, any>(strikes.map((s: any) => [s.strike, s]));
    let rows: ChainRow[] = [];
    let atmIv: number | null = null;

    if (Array.isArray(optionChain) && optionChain.length) {
      const byStrike = new Map<number, { strike: number; call?: any; put?: any }>();
      for (const c of optionChain) {
        if (!isFinite(c?.strike)) continue;
        const row: { strike: number; call?: any; put?: any } = byStrike.get(c.strike) || { strike: c.strike };
        if (c.type === 'call') row.call = c; else row.put = c;
        byStrike.set(c.strike, row);
      }
      const near = [...byStrike.values()]
        .sort((a, b) => Math.abs(a.strike - (spot ?? a.strike)) - Math.abs(b.strike - (spot ?? b.strike)))
        .slice(0, 11);
      rows = near.map((r) => {
        const v = volByStrike.get(r.strike);
        return {
          strike: r.strike,
          call: { bid: r.call?.bid, ask: r.call?.ask, delta: r.call?.delta, oi: r.call?.openInterest, vol: v?.callVolume },
          put: { bid: r.put?.bid, ask: r.put?.ask, delta: r.put?.delta, oi: r.put?.openInterest, vol: v?.putVolume },
        };
      });
      const atm = near[0];
      const ivs = [atm?.call?.iv, atm?.put?.iv].filter((x) => x != null && isFinite(x)) as number[];
      atmIv = ivs.length ? ivs.reduce((a, b) => a + b, 0) / ivs.length : null;
    } else {
      const near = [...strikes]
        .sort((a, b) => Math.abs(a.strike - (spot ?? a.strike)) - Math.abs(b.strike - (spot ?? b.strike)))
        .slice(0, 11);
      rows = near.map((s) => ({
        strike: s.strike,
        call: { oi: s.callOi, vol: s.callVolume },
        put: { oi: s.putOi, vol: s.putVolume },
      }));
    }
    rows.sort((a, b) => b.strike - a.strike);
    const atmStrike = rows.length
      ? rows.reduce((m, r) => (Math.abs(r.strike - (spot ?? r.strike)) < Math.abs(m.strike - (spot ?? m.strike)) ? r : m), rows[0]).strike
      : null;
    return { rows, atmStrike, atmIv };
  }, [profile, optionChain, spot]);

  const th = (label: string, color?: string) => (
    <th className="whitespace-nowrap px-1.5 py-1 text-right text-[8px] font-semibold uppercase tracking-[0.08em]" style={{ color: color ?? 'var(--text-muted)' }}>{label}</th>
  );
  const cell = (v: string, color?: string) => (
    <td className="px-1.5 py-1 text-right slayer-num text-[9.5px] tabular-nums" style={{ color: color ?? 'var(--text-secondary)' }}>{v}</td>
  );

  const foot = (label: string, value: string) => (
    <div className="min-w-0 flex-1 px-2.5 py-2">
      <div className="text-[7.5px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</div>
      <div className="mt-0.5 slayer-num text-[11px] font-semibold tabular-nums text-[var(--text-primary)]">{value}</div>
    </div>
  );

  return (
    <TerminalPanel
      title="Options Chain"
      subtitle="0DTE · near-the-money"
      className="min-w-0"
      padded={false}
      contentClassName="flex min-h-0 flex-col"
      actions={
        <span className="slayer-readout slayer-num cursor-default select-none px-1.5 py-0.5 text-[9px]">
          {profile?.expiryDate ? String(profile.expiryDate) : '0DTE'}
        </span>
      }
    >
      <div className="slayer-scrollbar min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-[var(--bg-panel)]">
            <tr className="border-b border-[var(--border-subtle)]">
              <th colSpan={6} className="px-1.5 py-1 text-center text-[8.5px] font-semibold uppercase tracking-[0.12em]" style={{ color: CALL }}>Calls</th>
              <th className="border-x border-[var(--border-subtle)] px-1.5 py-1 text-center text-[8.5px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Strike</th>
              <th colSpan={6} className="px-1.5 py-1 text-center text-[8.5px] font-semibold uppercase tracking-[0.12em]" style={{ color: PUT }}>Puts</th>
            </tr>
            <tr className="border-b border-[var(--border-subtle)]">
              {th('Bid', CALL)}{th('Ask', CALL)}{th('Last', CALL)}{th('Δ', CALL)}{th('Vol', CALL)}{th('OI', CALL)}
              <th className="border-x border-[var(--border-subtle)] px-1.5 py-1 text-center text-[8px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">·</th>
              {th('Bid', PUT)}{th('Ask', PUT)}{th('Last', PUT)}{th('Δ', PUT)}{th('Vol', PUT)}{th('OI', PUT)}
            </tr>
          </thead>
          <tbody>
            {model.rows.length === 0 ? (
              <tr><td colSpan={13} className="px-2 py-8 text-center text-[10px] text-[var(--text-muted)]">No chain streaming for this ticker.</td></tr>
            ) : (
              model.rows.map((r) => {
                const isAtm = r.strike === model.atmStrike;
                return (
                  <tr key={r.strike} className="border-b border-[var(--border-subtle)] last:border-0" style={isAtm ? { background: 'color-mix(in srgb, var(--text-primary) 5%, transparent)' } : undefined}>
                    {cell(q(r.call.bid))}{cell(q(r.call.ask))}{cell('—', 'var(--text-faint)')}{cell(d(r.call.delta), CALL)}{cell(n(r.call.vol))}{cell(n(r.call.oi))}
                    <td className="border-x border-[var(--border-subtle)] px-1.5 py-1 text-center slayer-num text-[10px] font-semibold text-[var(--text-primary)]">{fmtLevel(r.strike)}</td>
                    {cell(q(r.put.bid))}{cell(q(r.put.ask))}{cell('—', 'var(--text-faint)')}{cell(d(r.put.delta), PUT)}{cell(n(r.put.vol))}{cell(n(r.put.oi))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="flex shrink-0 border-t border-[var(--border-subtle)] divide-x divide-[var(--border-subtle)]">
        {foot('IV (ATM)', model.atmIv != null ? `${(model.atmIv * 100).toFixed(1)}%` : '—')}
        {foot('IV Pctl', '—')}
        {foot('IV Change', '—')}
      </div>
    </TerminalPanel>
  );
}

export default OptionsChainPanel;
