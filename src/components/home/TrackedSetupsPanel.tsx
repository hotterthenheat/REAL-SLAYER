/**
 * TrackedSetupsPanel — a live read of the tracked-setups store (Scan → Track). Shows
 * the setup contract, its lifecycle status, level, entry confidence and current
 * reward (premium change re-priced from the live feed). Honest empty state when the
 * user hasn't tracked anything. Nothing is fabricated — it mirrors Trade History.
 */
import { useMemo } from 'react';
import { TerminalPanel } from '../ui/terminal/TerminalPanel';
import { MiniBar, Badge, FooterLink, Th } from './ui';
import { fmtLevel, fmtPct, signTone, toneText, toneVar, type Tone } from './format';
import { useTrackingStore, STATUS_LABEL, type TrackStatus } from '../../lib/trackedSetups';

const STATUS_TONE: Record<TrackStatus, Tone> = {
  REVIEWED: 'neutral',
  TRACKED: 'pin',
  ACTIVE: 'positive',
  INVALIDATED: 'negative',
  RESOLVED_WIN: 'positive',
  RESOLVED_LOSS: 'negative',
  EXPIRED: 'neutral',
  CANCELLED: 'neutral',
};

export function TrackedSetupsPanel({ onOpen }: { onOpen: () => void }) {
  const setups = useTrackingStore((s) => s.setups);

  const rows = useMemo(
    () =>
      setups
        .filter((s) => s.status !== 'CANCELLED')
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 6),
    [setups],
  );

  return (
    <TerminalPanel
      title="Tracked Setups"
      className="min-w-0"
      padded={false}
      contentClassName="flex flex-col"
      footer={<FooterLink label="View all setups" onClick={onOpen} />}
    >
      {rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-3 py-8 text-center">
          <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">
            No tracked setups — track one from Pinpoint or SkyVision.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                <Th>Setup</Th>
                <Th>Status</Th>
                <Th align="right">Level</Th>
                <Th className="w-[56px]">Conf.</Th>
                <Th align="right">Reward</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const reward = s.premiumChangePct;
                const confTone: Tone = s.confidence >= 70 ? 'positive' : s.confidence >= 50 ? 'warning' : 'negative';
                return (
                  <tr key={s.id} className="border-b border-[var(--border-subtle)] last:border-0">
                    <td className="max-w-[120px] truncate px-2 py-1.5 text-[10.5px] font-semibold text-[var(--text-primary)] slayer-num">
                      {s.contract}
                    </td>
                    <td className="px-2 py-1.5">
                      <Badge label={STATUS_LABEL[s.status]} tone={STATUS_TONE[s.status]} />
                    </td>
                    <td className="px-2 py-1.5 text-right text-[10.5px] slayer-num text-[var(--text-secondary)]">{fmtLevel(s.strike)}</td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1">
                        <MiniBar pct={s.confidence} color={toneVar[confTone]} className="w-[34px]" />
                        <span className="text-[8.5px] slayer-num text-[var(--text-tertiary)]">{Math.round(s.confidence)}</span>
                      </div>
                    </td>
                    <td className={`px-2 py-1.5 text-right text-[10px] slayer-num ${toneText[signTone(reward)]}`}>{fmtPct(reward)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </TerminalPanel>
  );
}

export default TrackedSetupsPanel;
