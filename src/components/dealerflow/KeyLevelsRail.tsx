/**
 * KeyLevelsRail — the dealer level ladder of the Dealer Flow middle row. Mirrors
 * home/KeyLevelsPanel's derivation (levels straight off gex_profile; King = the
 * single strongest strike by |netGex|; per-level PRESSURE = |netGex| at the nearest
 * real strike) but in the reference's LEVEL | PRICE | DIST. | PRESSURE shape with a
 * DEALER BIAS · NET GEX · NET DEX footer. Absent levels read "—"; nothing invented.
 */
import { useMemo } from 'react';
import { TerminalPanel } from '../ui/terminal/TerminalPanel';
import { Th } from '../home/ui';
import { fmtBnSigned, fmtCompact, fmtLevel, fmtMag, fmtPct, signTone, toneText, toneVar, type Tone } from '../home/format';

interface Row { id: string; label: string; price?: number; tone: Tone; }

export function KeyLevelsRail({ profile, biasWord, biasTone, netDex }: {
  profile: any;
  biasWord: string;
  biasTone: Tone;
  netDex?: number;
}) {
  const spot: number | undefined = profile?.spot;
  const netGex: number | undefined = profile?.netGex;

  const rows = useMemo(() => {
    const strikes: any[] = Array.isArray(profile?.strikes) ? profile.strikes.filter((s: any) => isFinite(s?.strike)) : [];
    const pressureAt = (level?: number): number | null => {
      if (level == null || !isFinite(level) || !strikes.length) return null;
      let best: any = null, bd = Infinity;
      for (const s of strikes) { const d = Math.abs(s.strike - level); if (d < bd) { bd = d; best = s; } }
      return best ? Math.abs(best.netGex ?? 0) : null;
    };
    // King = strongest single strike by |netGex|.
    let king: any = null;
    for (const s of strikes) if (!king || Math.abs(s.netGex ?? 0) > Math.abs(king.netGex ?? 0)) king = s;

    const base: Row[] = [
      { id: 'callWall', label: 'Call Wall', price: profile?.callWall, tone: 'call' },
      { id: 'spot', label: 'Spot', price: spot, tone: 'neutral' },
      { id: 'putWall', label: 'Put Wall', price: profile?.putWall, tone: 'negative' },
      { id: 'pin', label: 'Pin Level', price: profile?.magnet, tone: 'pin' },
      { id: 'flip', label: 'Flip Level', price: profile?.gammaFlip, tone: 'warning' },
      { id: 'king', label: 'King Level', price: king?.strike, tone: 'negative' },
    ];
    return base.map((r) => ({
      ...r,
      dist: r.price != null && isFinite(r.price) && spot ? ((r.price - spot) / spot) * 100 : null,
      pressure: r.id === 'king' && king ? Math.abs(king.netGex ?? 0) : pressureAt(r.price),
    }));
  }, [profile, spot]);

  const foot = (label: string, value: string, tone: Tone) => (
    <div className="min-w-0 flex-1 px-2.5 py-2">
      <div className="text-[7.5px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</div>
      <div className={`mt-0.5 slayer-num text-[11px] font-semibold tabular-nums ${toneText[tone]}`}>{value}</div>
    </div>
  );

  return (
    <TerminalPanel
      title="Key Levels Rail"
      className="min-w-0"
      padded={false}
      contentClassName="flex flex-col"
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[var(--border-subtle)]">
              <Th>Level</Th>
              <Th align="right">Price</Th>
              <Th align="right">Dist.</Th>
              <Th align="right">Pressure</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-[var(--border-subtle)] last:border-0">
                <td className="px-2.5 py-1.5">
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: toneVar[r.tone] }} />
                    <span className={`text-[10px] font-semibold uppercase tracking-[0.06em] ${toneText[r.tone]}`}>{r.label}</span>
                  </span>
                </td>
                <td className="px-2.5 py-1.5 text-right slayer-num text-[10.5px] font-semibold text-[var(--text-primary)]">{fmtLevel(r.price)}</td>
                <td className={`px-2.5 py-1.5 text-right slayer-num text-[10px] ${r.id === 'spot' ? 'text-[var(--text-muted)]' : toneText[signTone(r.dist)]}`}>
                  {r.id === 'spot' ? '—' : r.dist == null ? '—' : fmtPct(r.dist)}
                </td>
                <td className="px-2.5 py-1.5 text-right slayer-num text-[10px] text-[var(--text-secondary)]">
                  {r.pressure == null ? '—' : `$${fmtMag(r.pressure)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex shrink-0 border-t border-[var(--border-subtle)] divide-x divide-[var(--border-subtle)]">
        {foot('Dealer Bias', biasWord, biasTone)}
        {foot('Net GEX', fmtBnSigned(netGex), signTone(netGex))}
        {foot('Net DEX', fmtCompact(netDex, true), signTone(netDex))}
      </div>
    </TerminalPanel>
  );
}

export default KeyLevelsRail;
