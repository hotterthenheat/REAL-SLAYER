/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * FORWARD LOG — the append-only prediction record + outcome math (spec §25/§27.9).
 *
 * This is the pure, DB-agnostic core: what a resolvable prediction IS, how it is
 * labeled once its horizon prints, and how the labeled history is shaped for the
 * isotonic (PAV) calibrator. The server store (src/server/predictionLog.ts) is the
 * only thing that touches Postgres; it delegates the actual win/return math here so
 * the resolution rule lives in one tested place.
 *
 * Spec rules embodied:
 *   • "A score alone is NOT a prediction." A record carries direction + entrySpot
 *     (+ optional target) so the labeler can actually resolve it (§25).
 *   • Records are append-only: only the null resolution columns are ever filled;
 *     createdAt / features / predictedProb are never edited or back-filled (§27.9).
 *   • Isotonic calibration stays in cold-start passthrough until ≥200 labeled
 *     outcomes exist (§25/§26 #27) — enforced by the store's read, honored here in
 *     the shaping contract.
 */

/** The long-premium side a SkyVision play takes. */
export type PredictionDirection = 'call' | 'put';

/** A resolvable forward-log prediction (§25). */
export interface PredictionRecord {
  predictionId: string;
  ticker: string;
  kind: string;              // 'skyscore' | 'trade' | 'discovery' | …
  direction: PredictionDirection;
  entrySpot: number;         // underlying spot at prediction time — the resolution anchor
  targetPrice: number | null;// optional touch target; null ⇒ resolve by direction vs entry
  predictedProb: number;     // 0-100 win probability the model emitted (the score to calibrate)
  features: Record<string, unknown>; // feature vector (regimeContext breakdown) for KNN / audit
  horizonMs: number;         // how long until the outcome is knowable
  createdAt: number;         // epoch ms
}

export interface LabeledOutcome {
  win: boolean;
  realizedReturn: number;    // direction-signed fractional return of the underlying
}

/** Mode → forward horizon. All FREE (§26) — initial values, calibration in progress. */
export const HORIZON_MS: Record<string, number> = {
  INTRADAY: 4 * 3_600_000,        // ~half a session
  NEAR_TERM: 3 * 24 * 3_600_000,  // 3 calendar days
  SWING: 10 * 24 * 3_600_000,     // 2 trading weeks
};

/** Deterministic, collision-stable id: identity + createdAt. No RNG, so a retried
 *  insert within the same createdAt bucket is idempotent against the unique index. */
export function makePredictionId(ticker: string, kind: string, direction: PredictionDirection, createdAt: number): string {
  return `${kind}:${ticker}:${direction}:${createdAt}`;
}

/** True once the record's horizon has fully printed and the outcome is knowable. */
export function isMatured(rec: Pick<PredictionRecord, 'createdAt' | 'horizonMs'>, now: number): boolean {
  return now >= rec.createdAt + rec.horizonMs;
}

/**
 * §25 outcome resolution against the underlying price at horizon.
 *   win ⟺ direction 'call' ? price_end > entrySpot : price_end < entrySpot
 *         (or target touch when a targetPrice is set and reached by price_end).
 *   realizedReturn = direction-signed (price_end − entrySpot) / entrySpot.
 */
export function labelOutcome(
  rec: Pick<PredictionRecord, 'direction' | 'entrySpot' | 'targetPrice'>,
  priceEnd: number,
): LabeledOutcome {
  const up = rec.direction === 'call';
  const dirSign = up ? 1 : -1;
  const realizedReturn = rec.entrySpot > 0 ? (dirSign * (priceEnd - rec.entrySpot)) / rec.entrySpot : 0;
  const win = rec.targetPrice != null && rec.targetPrice > 0
    ? (up ? priceEnd >= rec.targetPrice : priceEnd <= rec.targetPrice)
    : (up ? priceEnd > rec.entrySpot : priceEnd < rec.entrySpot);
  return { win, realizedReturn };
}

/** One labeled row as read back from the log. */
export interface LabeledRow { predictedProb: number; outcomeWin: boolean | null; }
export interface CalibrationPoint { predicted: number; actual: number; }

/**
 * Shape labeled rows for the isotonic/PAV calibrator (§25): predicted ∈ [0,1],
 * actual ∈ {0,1}. Unlabeled rows are dropped. The 200-outcome cold-start guard
 * lives at the calibrator; this only prepares the points it consumes.
 */
export function shapeCalibrationHistory(rows: LabeledRow[]): CalibrationPoint[] {
  const out: CalibrationPoint[] = [];
  for (const r of rows) {
    if (r.outcomeWin == null) continue;
    const predicted = Math.max(0, Math.min(1, r.predictedProb / 100));
    out.push({ predicted, actual: r.outcomeWin ? 1 : 0 });
  }
  return out;
}
