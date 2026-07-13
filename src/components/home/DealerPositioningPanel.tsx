/**
 * DealerPositioningPanel — the right column of the Home main row. Wraps the compact
 * DealerHeatmap with the reference chrome: a titled header carrying read-only EXPIRY
 * / DATE selectors (the server ships one aggregated chain, so these are honest
 * read-only readouts, not filters that can't act). All values come from the live
 * gex_profile passed in.
 */
import { TerminalPanel } from '../ui/terminal/TerminalPanel';
import { DealerHeatmap, type HeatRow } from './DealerHeatmap';

export function DealerPositioningPanel({ profile, ticker }: { profile: any; ticker: string }) {
  const strikes: HeatRow[] = Array.isArray(profile?.strikes)
    ? profile.strikes
        .filter((s: any) => s && isFinite(s.strike))
        .map((s: any) => ({ strike: s.strike, net: isFinite(s.netGex) ? s.netGex : 0 }))
    : [];

  const expiry = profile?.expiryDate
    ? profile.expiryLabel
      ? `${profile.expiryDate} · ${profile.expiryLabel}`
      : String(profile.expiryDate)
    : `${ticker} PIPELINE`;

  const readout = (label: string, value: string) => (
    <span className="flex items-center gap-1.5">
      <span className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</span>
      <span className="slayer-readout slayer-num cursor-default select-none px-1.5 py-0.5 text-[9px]">{value}</span>
    </span>
  );

  return (
    <TerminalPanel
      title="Dealer Positioning Map"
      subtitle="Net dealer pressure by strike"
      className="min-w-0 xl:h-full"
      contentClassName="flex min-h-0 flex-col"
      actions={
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
          {readout('Expiry', expiry)}
          {readout('Date', 'All Dates')}
        </div>
      }
    >
      <DealerHeatmap
        strikes={strikes}
        spot={profile?.spot}
        callWall={profile?.callWall}
        putWall={profile?.putWall}
        pin={profile?.magnet}
      />
    </TerminalPanel>
  );
}

export default DealerPositioningPanel;
