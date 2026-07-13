/**
 * DealerPressureMatrix — the dense per-strike dealer-pressure table, the right
 * column of the Dealer Flow main row. Every figure is a direct read of the live
 * gex_profile.strikes[]: PRESSURE = per-side signed gamma exposure (callGex /
 * putGex), OI = per-side open interest (callOi / putOi — the server ships OI, not a
 * delta-of-OI, so the column is labelled OI honestly), VOL = per-side traded
 * volume, NET = netGex. Cells are tinted on a diverging emerald(+)/rose(−) scale by
 * magnitude. The SPOT row is marked, and PIN / FLIP badges land on the strikes
 * nearest the magnet / gamma-flip. Nothing is fabricated — absent cells read "—".
 */
import { useMemo } from 'react';
import { TerminalPanel } from '../ui/terminal/TerminalPanel';
import { fmtCompact, fmtLevel, fmtPrice2, nyClock } from '../home/format';

const WINDOW = 11; // ±strikes around spot

/** Diverging tint by magnitude: emerald for +, rose for −, washed near zero. */
function diverge(v: number | null | undefined, max: number): { color: string; bg: string } {
  if (v == null || !isFinite(v) || max <= 0) return { color: 'var(--text-faint)', bg: 'transparent' };
  const mag = Math.min(1, Math.abs(v) / max);
  const ink = v >= 0 ? 'var(--positive-ink)' : 'var(--negative-ink)';
  return {
    color: mag < 0.06 ? 'var(--text-muted)' : ink,
    bg: `color-mix(in srgb, ${ink} ${Math.round(mag * 24)}%, transparent)`,
  };
}

function PressCell({ v, max }: { v: number | null | undefined; max: number }) {
  const s = diverge(v, max);
  return (
    <td className="px-2 py-1 text-right slayer-num text-[10px] tabular-nums" style={{ background: s.bg }}>
      <span style={{ color: s.color }}>{v == null || !isFinite(v) ? '—' : fmtCompact(v, true)}</span>
    </td>
  );
}
function CountCell({ v }: { v: number | null | undefined }) {
  return (
    <td className="px-2 py-1 text-right slayer-num text-[10px] tabular-nums text-[var(--text-secondary)]">
      {v == null || !isFinite(v) ? '—' : fmtCompact(v)}
    </td>
  );
}

export function DealerPressureMatrix({ profile, ticker }: { profile: any; ticker: string }) {
  const spot: number | undefined = profile?.spot;

  const model = useMemo(() => {
    const all: any[] = Array.isArray(profile?.strikes) ? profile.strikes.filter((s: any) => isFinite(s?.strike)) : [];
    if (!all.length) return { rows: [] as any[], pinStrike: null, flipStrike: null, spotStrike: null, pMax: 0, nMax: 0 };
    const asc = [...all].sort((a, b) => a.strike - b.strike);
    // Centre on spot, keep a ±WINDOW band, render descending (highest strike on top).
    let center = Math.floor(asc.length / 2);
    if (spot != null) {
      let bd = Infinity;
      asc.forEach((r, i) => { const d = Math.abs(r.strike - spot); if (d < bd) { bd = d; center = i; } });
    }
    const lo = Math.max(0, center - WINDOW);
    const hi = Math.min(asc.length - 1, center + WINDOW);
    const rows = asc.slice(lo, hi + 1).reverse();
    const nearest = (lvl?: number | null): number | null => {
      if (lvl == null || !isFinite(lvl)) return null;
      let best: number | null = null, bd = Infinity;
      for (const r of rows) { const d = Math.abs(r.strike - lvl); if (d < bd) { bd = d; best = r.strike; } }
      return best;
    };
    const pMax = Math.max(1e-9, ...rows.map((r) => Math.max(Math.abs(r.callGex ?? 0), Math.abs(r.putGex ?? 0))));
    const nMax = Math.max(1e-9, ...rows.map((r) => Math.abs(r.netGex ?? 0)));
    return {
      rows,
      pinStrike: nearest(profile?.magnet),
      flipStrike: nearest(profile?.gammaFlip),
      spotStrike: nearest(spot),
      pMax,
      nMax,
    };
  }, [profile, spot]);

  const expiry = profile?.expiryDate
    ? profile.expiryLabel ? `${profile.expiryDate} · ${profile.expiryLabel}` : String(profile.expiryDate)
    : '0DTE';
  const updated = useMemo(() => nyClock(), [profile]);

  const badge = (label: string, color: string) => (
    <span
      className="rounded-[2px] border px-1 py-px text-[7.5px] font-bold uppercase leading-none tracking-[0.08em] slayer-num"
      style={{ color, borderColor: `color-mix(in srgb, ${color} 55%, transparent)`, background: `color-mix(in srgb, ${color} 14%, transparent)` }}
    >
      {label}
    </span>
  );

  return (
    <TerminalPanel
      title="Dealer Pressure Matrix"
      className="min-w-0 xl:h-full"
      padded={false}
      contentClassName="flex min-h-0 flex-col"
      actions={
        <span className="flex items-center gap-1.5">
          <span className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Expiration</span>
          <span className="slayer-readout slayer-num cursor-default select-none px-1.5 py-0.5 text-[9px]">{expiry}</span>
        </span>
      }
    >
      <div className="slayer-scrollbar min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-[var(--bg-panel)]">
            <tr className="border-b border-[var(--border-subtle)]">
              <th rowSpan={2} className="whitespace-nowrap px-2 py-1 text-left align-bottom">
                <div className="text-[8.5px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Strike</div>
                <div className="slayer-num text-[8px] text-[var(--text-tertiary)]">Spot {fmtPrice2(spot)}</div>
              </th>
              <th colSpan={3} className="border-l border-[var(--border-subtle)] px-2 py-1 text-center text-[8.5px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--call)' }}>Calls</th>
              <th colSpan={3} className="border-l border-[var(--border-subtle)] px-2 py-1 text-center text-[8.5px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--negative-ink)' }}>Puts</th>
              <th rowSpan={2} className="whitespace-nowrap border-l border-[var(--border-subtle)] px-2 py-1 text-right align-bottom text-[8.5px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Net<br />Press.</th>
            </tr>
            <tr className="border-b border-[var(--border-subtle)] text-[8px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
              <th className="border-l border-[var(--border-subtle)] px-2 py-1 text-right">Press.</th>
              <th className="px-2 py-1 text-right">OI</th>
              <th className="px-2 py-1 text-right">Vol</th>
              <th className="border-l border-[var(--border-subtle)] px-2 py-1 text-right">Press.</th>
              <th className="px-2 py-1 text-right">OI</th>
              <th className="px-2 py-1 text-right">Vol</th>
            </tr>
          </thead>
          <tbody>
            {model.rows.length === 0 ? (
              <tr><td colSpan={8} className="px-2 py-8 text-center text-[10px] text-[var(--text-muted)]">No strike profile — awaiting feed.</td></tr>
            ) : (
              model.rows.map((r) => {
                const isSpot = r.strike === model.spotStrike;
                const net = diverge(r.netGex, model.nMax);
                return (
                  <tr
                    key={r.strike}
                    className="border-b border-[var(--border-subtle)] last:border-0"
                    style={isSpot ? { background: 'color-mix(in srgb, var(--text-primary) 5%, transparent)' } : undefined}
                  >
                    <td className="whitespace-nowrap px-2 py-1">
                      <span className="flex items-center gap-1.5">
                        <span className="slayer-num text-[10.5px] font-semibold text-[var(--text-primary)]">{fmtLevel(r.strike)}</span>
                        {isSpot && badge('Spot', 'var(--text-primary)')}
                        {r.strike === model.pinStrike && badge('Pin', 'var(--pin)')}
                        {r.strike === model.flipStrike && badge('Flip', 'var(--warning-ink)')}
                      </span>
                    </td>
                    <PressCell v={r.callGex} max={model.pMax} />
                    <CountCell v={r.callOi} />
                    <CountCell v={r.callVolume} />
                    <PressCell v={r.putGex} max={model.pMax} />
                    <CountCell v={r.putOi} />
                    <CountCell v={r.putVolume} />
                    <td className="px-2 py-1 text-right slayer-num text-[10px] font-semibold tabular-nums" style={{ background: net.bg }}>
                      <span style={{ color: net.color }}>{r.netGex == null || !isFinite(r.netGex) ? '—' : fmtCompact(r.netGex, true)}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* legend */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--border-subtle)] px-2.5 py-1.5">
        <span className="flex items-center gap-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
          <span className="inline-block h-2 w-2.5 rounded-[1px]" style={{ background: 'var(--positive-ink)' }} />Positive
        </span>
        <span className="flex items-center gap-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
          <span className="inline-block h-2 w-2.5 rounded-[1px] border border-[var(--border-mid)]" />Neutral
        </span>
        <span className="flex items-center gap-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
          <span className="inline-block h-2 w-2.5 rounded-[1px]" style={{ background: 'var(--negative-ink)' }} />Negative
        </span>
        <span className="ml-auto slayer-num text-[8px] uppercase tracking-[0.1em] text-[var(--text-tertiary)]">
          {model.rows.length} strikes · {ticker} · updated {updated}
        </span>
      </div>
    </TerminalPanel>
  );
}

export default DealerPressureMatrix;
