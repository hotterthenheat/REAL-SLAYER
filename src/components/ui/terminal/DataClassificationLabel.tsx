import React from 'react';
import { cx } from '../../../lib/cx';

/**
 * DataClassificationLabel — the shared, honest provenance marker required by the
 * design brief: a trader must be able to tell whether a value is raw market data,
 * a derived level, model output, an inference, or degraded (delayed/stale).
 *
 * Deliberately subtle: a tiny mono tag that reads as metadata, not decoration.
 * Chrome is neutral (never the silver brand accent — provenance is not "brand"),
 * and only the two DEGRADED states borrow the semantic warning/danger tones,
 * because delayed/stale data is a genuine risk signal.
 *
 *   RAW       straight from the market-data feed (quotes, OHLC, OI, volume)
 *   DERIVED   computed directly from raw values (walls, distance, net exposure)
 *   MODELED   output of a pricing/vol/probability model (IV surface, RND, P(touch))
 *   INFERRED  a judgement layered on data (dealer positioning, sentiment, regime)
 *   DELAYED   real but not real-time (provider delay) — warning tone
 *   STALE     last value is past its freshness budget — danger tone
 */
export type DataClass = 'RAW' | 'DERIVED' | 'MODELED' | 'INFERRED' | 'DELAYED' | 'STALE';

const META: Record<DataClass, { label: string; title: string; tone: 'neutral' | 'warn' | 'danger' }> = {
  RAW: { label: 'RAW', title: 'Raw market data — direct from the feed.', tone: 'neutral' },
  DERIVED: { label: 'DERIVED', title: 'Derived — computed directly from raw market values.', tone: 'neutral' },
  MODELED: { label: 'MODELED', title: 'Modeled — output of a pricing / volatility / probability model, not observed fact.', tone: 'neutral' },
  INFERRED: { label: 'INFERRED', title: 'Inferred — a judgement layered on the data (e.g. dealer positioning, sentiment).', tone: 'neutral' },
  DELAYED: { label: 'DELAYED', title: 'Delayed — real data, but not real-time (provider delay).', tone: 'warn' },
  STALE: { label: 'STALE', title: 'Stale — last value is past its freshness window; treat with caution.', tone: 'danger' },
};

const toneClass: Record<'neutral' | 'warn' | 'danger', string> = {
  // Neutral provenance reads as quiet metadata — muted text on a hairline, no hue.
  neutral: 'text-[var(--text-faint)] border-[var(--border-subtle)]',
  // Degraded states carry a real semantic warning/danger tone (a genuine risk).
  warn: 'text-[var(--warning-ink)] border-[color-mix(in_srgb,var(--warning-ink)_40%,transparent)]',
  danger: 'text-[var(--negative-ink)] border-[color-mix(in_srgb,var(--negative-ink)_45%,transparent)]',
};

export function DataClassificationLabel({
  kind,
  className,
  showDot = false,
}: {
  kind: DataClass;
  className?: string;
  /** Render a leading status dot (used for DELAYED/STALE where a glance matters). */
  showDot?: boolean;
}) {
  const m = META[kind];
  return (
    <span
      title={m.title}
      aria-label={m.title}
      className={cx(
        'inline-flex items-center gap-1 rounded-[var(--radius-control)] border px-1 py-px',
        'text-[8.5px] font-semibold uppercase leading-none tracking-[0.12em] slayer-num',
        toneClass[m.tone],
        className,
      )}
    >
      {showDot && (
        <span
          aria-hidden="true"
          className="h-1 w-1 shrink-0 rounded-full"
          style={{ background: 'currentColor' }}
        />
      )}
      {m.label}
    </span>
  );
}

export default DataClassificationLabel;
