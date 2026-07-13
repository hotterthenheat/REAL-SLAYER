/**
 * MarketInsightPanel — 3–4 synthesized dealer reads derived from the live state
 * (net-gamma regime, price vs pin/walls, break scenarios), mirroring the Pinpoint
 * "Positioning Insight" style. Tagged INFERRED because these are judgements layered
 * on the data, not raw values. Footer stamps the last update from the streamed feed.
 */
import { useMemo } from 'react';
import { TerminalPanel } from '../ui/terminal/TerminalPanel';
import { DataClassificationLabel } from '../ui/terminal/DataClassificationLabel';
import { fmtLevel, toneVar, type Tone } from './format';

interface InsightModel {
  spot?: number;
  netGex?: number;
  callWall?: number;
  putWall?: number;
  magnet?: number;
  netGexTrend: string;
  positiveGamma: boolean | null;
}

export function MarketInsightPanel({ model, updatedAt }: { model: InsightModel; updatedAt: string }) {
  const bullets = useMemo(() => {
    const { spot, netGex, callWall, putWall, magnet, netGexTrend, positiveGamma } = model;
    const out: { key: string; tone: Tone; text: string }[] = [];

    if (netGex != null && positiveGamma != null) {
      out.push({
        key: 'regime',
        tone: netGex < 0 ? 'negative' : 'positive',
        text:
          netGex < 0
            ? `Net GEX negative at ${fmtCompactBn(netGex)} — dealers short gamma, hedging chases price; ${netGexTrend.toLowerCase()} exposure argues trend over mean-reversion.`
            : `Net GEX positive at ${fmtCompactBn(netGex)} — dealers long gamma, they fade extensions; ${netGexTrend.toLowerCase()} grip favors a compressing range.`,
      });
    }

    if (spot != null && magnet != null) {
      const above = spot > magnet;
      out.push({
        key: 'pin',
        tone: 'warning',
        text: `Price ${above ? 'holding above' : 'sitting below'} pin ${fmtLevel(magnet)}${callWall != null ? ` with call wall ${fmtLevel(callWall)} overhead` : ''} — drift magnetizes back toward the pin on light momentum.`,
      });
    }

    if (callWall != null) {
      out.push({
        key: 'up',
        tone: 'call',
        text: `Break above ${fmtLevel(callWall)} (call wall) releases short-gamma supply — an air pocket opens toward the next strike higher.`,
      });
    }

    if (putWall != null) {
      out.push({
        key: 'down',
        tone: 'negative',
        text: `Watch ${fmtLevel(putWall)} put wall for downside defense — support thins fast on a break below it.`,
      });
    }

    return out.slice(0, 4);
  }, [model]);

  return (
    <TerminalPanel
      title="Market Insight"
      className="min-w-0"
      padded={false}
      contentClassName="flex flex-col gap-2 p-2.5"
      actions={<DataClassificationLabel kind="INFERRED" />}
      footer={
        <div className="flex items-center justify-between">
          <span className="text-[9px] slayer-num text-[var(--text-tertiary)]">Updated {updatedAt} ET</span>
        </div>
      }
    >
      {bullets.length === 0 ? (
        <p className="text-[10px] text-[var(--text-muted)]">Reads resolve once the dealer profile prints.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {bullets.map((b) => (
            <li key={b.key} className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-[5px] h-1 w-1 shrink-0 rounded-full" style={{ background: toneVar[b.tone] }} />
              <span className="text-[10px] leading-snug text-[var(--text-secondary)]">{b.text}</span>
            </li>
          ))}
        </ul>
      )}
    </TerminalPanel>
  );
}

function fmtCompactBn(v: number): string {
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '+';
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1)}M`;
  return `${sign}$${a.toFixed(0)}`;
}

export default MarketInsightPanel;
