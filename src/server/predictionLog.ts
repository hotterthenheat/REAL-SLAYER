/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PREDICTION LOG — the server-side, append-only forward log (spec §25/§27.9).
 *
 * The ONLY module that touches the Postgres `predictions` table. It delegates the
 * win/return resolution to the pure core (src/lib/forwardLog) so the rule lives in
 * one tested place. Every call is resilient: a DB outage is a no-op (insert) or an
 * empty read (calibration) — never a thrown error into the market tick loop, so the
 * app degrades exactly as it does elsewhere when the DB is absent.
 *
 * The resolution anchors the spec requires — direction, entrySpot, targetPrice —
 * ride inside the row's `features` JSON (`__resolve`), so the existing table
 * resolves predictions with no schema migration. Records are append-only: inserts
 * are idempotent on predictionId and labeling only ever fills the null resolution
 * columns; createdAt / features / predictedProb are never edited (§27.9).
 */
import { and, eq, isNull, isNotNull, desc } from 'drizzle-orm';
import { db } from '../db';
import { predictions } from '../db/schema';
import {
  labelOutcome, shapeCalibrationHistory,
  type PredictionRecord, type CalibrationPoint, type PredictionDirection,
} from '../lib/forwardLog';

interface ResolveAnchor { direction: PredictionDirection; entrySpot: number; targetPrice: number | null; }

/** Append a prediction (idempotent on predictionId). Returns true on a real insert. */
export async function dbInsertPrediction(rec: PredictionRecord): Promise<boolean> {
  try {
    const anchor: ResolveAnchor = { direction: rec.direction, entrySpot: rec.entrySpot, targetPrice: rec.targetPrice };
    const features = JSON.stringify({ ...rec.features, __resolve: anchor });
    await db.insert(predictions).values({
      predictionId: rec.predictionId,
      ticker: rec.ticker,
      kind: rec.kind,
      predictedProb: Math.round(rec.predictedProb),
      features,
      horizonMs: rec.horizonMs,
      createdAt: rec.createdAt,
    }).onConflictDoNothing({ target: predictions.predictionId });
    return true;
  } catch {
    return false;
  }
}

/** Resolve every matured, unlabeled prediction for `ticker` against the current
 *  spot. Only fills the null resolution columns; returns the count labeled. */
export async function dbLabelMaturedPredictions(ticker: string, priceNow: number, now: number): Promise<number> {
  try {
    const rows = await db.select().from(predictions).where(and(
      eq(predictions.ticker, ticker),
      isNull(predictions.labeledAt),
    ));
    let labeled = 0;
    for (const row of rows) {
      if (now < row.createdAt + row.horizonMs) continue; // not matured yet
      let anchor: ResolveAnchor | null = null;
      try { anchor = JSON.parse(row.features || '{}').__resolve ?? null; } catch { anchor = null; }
      if (!anchor || !(anchor.entrySpot > 0)) continue;   // unresolvable ⇒ leave it (never fabricate an outcome)
      const { win, realizedReturn } = labelOutcome(anchor, priceNow);
      await db.update(predictions).set({
        labeledAt: now,
        outcomeWin: win,
        realizedReturn: realizedReturn.toFixed(6),
      }).where(eq(predictions.id, row.id));
      labeled++;
    }
    return labeled;
  } catch {
    return 0;
  }
}

/** Labeled outcome history for a kind, shaped for the isotonic (PAV) calibrator.
 *  DB outage ⇒ []. The 200-outcome cold-start guard lives at the calibrator. */
export async function dbGetCalibrationHistory(kind: string, limit = 5000): Promise<CalibrationPoint[]> {
  try {
    const rows = await db
      .select({ predictedProb: predictions.predictedProb, outcomeWin: predictions.outcomeWin })
      .from(predictions)
      .where(and(eq(predictions.kind, kind), isNotNull(predictions.labeledAt)))
      .orderBy(desc(predictions.createdAt))
      .limit(limit);
    return shapeCalibrationHistory(rows);
  } catch {
    return [];
  }
}
