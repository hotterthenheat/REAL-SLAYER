/**
 * KeyLevelsPanel — the dealer level ladder: Call Wall / Pin / Put Wall / Flip /
 * King, each with its distance from spot, a classification, and a normalized
 * |net-gamma| strength bar. Every level is derived from the live gex_profile
 * (walls, magnet, gammaFlip) and the King level is the single strongest strike by
 * |netGex| in the chain. Absent levels render "—".
 */
import { useMemo } from 'react';
import { TerminalPanel } from '../ui/terminal/TerminalPanel';
import { MiniBar, FooterLink, Th } from './ui';
import { fmtLevel, fmtPct, signTone, toneText, toneVar, type Tone } from './format';

interface LevelRow {
  name: string;
  nameTone: Tone;
  price: number | null | undefined;
  type: string;
  typeTone: Tone;
  strengthPct: number;
  strengthColor: string;
}

export function KeyLevelsPanel({ profile, onOpen }: { profile: any; onOpen: () => void }) {
  const spot: number | undefined = profile?.spot;

  const rows = useMemo<LevelRow[]>(() => {
    const asc: any[] = Array.isArray(profile?.strikes)
      ? [...profile.strikes].filter((s) => isFinite(s?.strike)).sort((a, b) => a.strike - b.strike)
      : [];
    const maxAbs = Math.max(1e-9, ...asc.map((s) => Math.abs(s.netGex ?? 0)));
    const netAt = (level: number | null | undefined): number => {
      if (level == null || !isFinite(level) || asc.length === 0) return 0;
      let best = asc[0];
      for (const s of asc) if (Math.abs(s.strike - level) < Math.abs(best.strike - level)) best = s;
      return best.netGex ?? 0;
    };
    // King = strongest single strike by |netGex|.
    let king: any = null;
    for (const s of asc) if (!king || Math.abs(s.netGex ?? 0) > Math.abs(king.netGex ?? 0)) king = s;

    const strength = (net: number) => Math.min(100, (Math.abs(net) / maxAbs) * 100);

    return [
      { name: 'Call Wall', nameTone: 'call', price: profile?.callWall, type: 'Resistance', typeTone: 'negative', strengthPct: strength(netAt(profile?.callWall)), strengthColor: toneVar.call },
      { name: 'Pin Level', nameTone: 'pin', price: profile?.magnet, type: 'Magnet', typeTone: 'pin', strengthPct: strength(netAt(profile?.magnet)), strengthColor: toneVar.pin },
      { name: 'Put Wall', nameTone: 'negative', price: profile?.putWall, type: 'Support', typeTone: 'positive', strengthPct: strength(netAt(profile?.putWall)), strengthColor: toneVar.negative },
      { name: 'Flip Level', nameTone: 'flip', price: profile?.gammaFlip, type: 'Regime', typeTone: 'flip', strengthPct: strength(netAt(profile?.gammaFlip)), strengthColor: toneVar.flip },
      { name: 'King Level', nameTone: 'king', price: king?.strike, type: 'Heaviest γ', typeTone: 'king', strengthPct: king ? strength(king.netGex ?? 0) : 0, strengthColor: toneVar.king },
    ];
  }, [profile]);

  const distOf = (price: number | null | undefined): number | null =>
    price != null && isFinite(price) && spot ? ((price - spot) / spot) * 100 : null;

  return (
    <TerminalPanel
      title="Key Levels"
      className="min-w-0"
      padded={false}
      contentClassName="flex flex-col"
      footer={<FooterLink label="View full level map" onClick={onOpen} />}
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[var(--border-subtle)]">
              <Th>Level</Th>
              <Th align="right">Price</Th>
              <Th align="right">Dist.</Th>
              <Th>Type</Th>
              <Th className="w-[64px]">Strength</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const dist = distOf(r.price);
              return (
                <tr key={r.name} className="border-b border-[var(--border-subtle)] last:border-0">
                  <td className={`px-2 py-1.5 text-[10.5px] font-semibold ${toneText[r.nameTone]}`}>{r.name}</td>
                  <td className="px-2 py-1.5 text-right text-[10.5px] slayer-num text-[var(--text-primary)]">{fmtLevel(r.price)}</td>
                  <td className={`px-2 py-1.5 text-right text-[10px] slayer-num ${toneText[signTone(dist)]}`}>
                    {dist == null ? '—' : fmtPct(dist)}
                  </td>
                  <td className={`px-2 py-1.5 text-[9.5px] font-semibold uppercase tracking-[0.06em] ${toneText[r.typeTone]}`}>{r.type}</td>
                  <td className="px-2 py-1.5">
                    <MiniBar pct={r.strengthPct} color={r.strengthColor} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </TerminalPanel>
  );
}

export default KeyLevelsPanel;
