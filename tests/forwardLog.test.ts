/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Forward-log core (spec §25) — locks the resolution rule that makes a prediction
 * labelable: win by direction vs entry (or target touch), direction-signed return,
 * maturity gate, deterministic id, and the calibration-history shaping contract.
 */
import assert from 'node:assert';
import {
  labelOutcome, isMatured, makePredictionId, shapeCalibrationHistory, HORIZON_MS,
  wilsonInterval, toCalibratorHistory, CALIBRATION_MIN_SAMPLES,
} from '../src/lib/forwardLog';
import { calibrateIsotonicLoss } from '../src/lib/v11Math';

console.log('--- RUNNING FORWARD-LOG CORE SUITE ---');

console.log('Testing labelOutcome — direction vs entry + signed return...');
{
  // Call: up close ⇒ win, positive return; down close ⇒ loss, negative return.
  const cUp = labelOutcome({ direction: 'call', entrySpot: 100, targetPrice: null }, 103);
  assert.ok(cUp.win && Math.abs(cUp.realizedReturn - 0.03) < 1e-9, `call up ⇒ win +3% (${cUp.realizedReturn})`);
  const cDn = labelOutcome({ direction: 'call', entrySpot: 100, targetPrice: null }, 98);
  assert.ok(!cDn.win && Math.abs(cDn.realizedReturn - -0.02) < 1e-9, `call down ⇒ loss −2% (${cDn.realizedReturn})`);
  // Put: down close ⇒ win with POSITIVE direction-signed return; up close ⇒ loss.
  const pDn = labelOutcome({ direction: 'put', entrySpot: 100, targetPrice: null }, 97);
  assert.ok(pDn.win && Math.abs(pDn.realizedReturn - 0.03) < 1e-9, `put down ⇒ win +3% signed (${pDn.realizedReturn})`);
  const pUp = labelOutcome({ direction: 'put', entrySpot: 100, targetPrice: null }, 102);
  assert.ok(!pUp.win && Math.abs(pUp.realizedReturn - -0.02) < 1e-9, `put up ⇒ loss −2% signed (${pUp.realizedReturn})`);
  console.log('✔ labelOutcome direction/return');
}

console.log('Testing labelOutcome — target touch overrides direction-vs-entry...');
{
  // Call with a target: above entry but below target ⇒ NOT a win (target not reached).
  const near = labelOutcome({ direction: 'call', entrySpot: 100, targetPrice: 105 }, 103);
  assert.ok(!near.win, 'call above entry but below target ⇒ not yet a win');
  const hit = labelOutcome({ direction: 'call', entrySpot: 100, targetPrice: 105 }, 106);
  assert.ok(hit.win, 'call reaching target ⇒ win');
  const putHit = labelOutcome({ direction: 'put', entrySpot: 100, targetPrice: 95 }, 94);
  assert.ok(putHit.win, 'put reaching target ⇒ win');
  console.log('✔ target-touch resolution');
}

console.log('Testing maturity gate + deterministic id + horizons...');
{
  const rec = { createdAt: 1000, horizonMs: 500 };
  assert.ok(!isMatured(rec, 1400), 'not matured before horizon');
  assert.ok(isMatured(rec, 1500), 'matured at horizon');
  assert.ok(isMatured(rec, 9999), 'matured after horizon');
  assert.strictEqual(makePredictionId('SPX', 'skyscore', 'call', 1720000000000), 'skyscore:SPX:call:1720000000000', 'id is deterministic');
  assert.ok(HORIZON_MS.INTRADAY < HORIZON_MS.NEAR_TERM && HORIZON_MS.NEAR_TERM < HORIZON_MS.SWING, 'horizons increase by mode');
  console.log('✔ maturity + id + horizons');
}

console.log('Testing shapeCalibrationHistory — drops unlabeled, maps prob & win...');
{
  const pts = shapeCalibrationHistory([
    { predictedProb: 80, outcomeWin: true },
    { predictedProb: 40, outcomeWin: false },
    { predictedProb: 60, outcomeWin: null },   // unresolved ⇒ dropped
    { predictedProb: 150, outcomeWin: true },  // clamps to 1.0
  ]);
  assert.strictEqual(pts.length, 3, 'unlabeled rows dropped');
  assert.deepStrictEqual(pts[0], { predicted: 0.8, actual: 1 }, 'win ⇒ actual 1, prob/100');
  assert.deepStrictEqual(pts[1], { predicted: 0.4, actual: 0 }, 'loss ⇒ actual 0');
  assert.strictEqual(pts[2].predicted, 1, 'prob>100 clamps to 1');
  console.log('✔ calibration-history shaping');
}

console.log('Testing Wilson interval + calibrator mapping + cold-start passthrough (§25)...');
{
  assert.deepStrictEqual(wilsonInterval(0, 0), { center: 0, low: 0, high: 0 }, 'n=0 ⇒ zeros');
  const w = wilsonInterval(60, 100);
  assert.ok(w.low > 0 && w.high < 1 && w.low < 0.6 && w.high > 0.6, `60/100 ⇒ CI brackets 0.6 (${w.low.toFixed(2)}-${w.high.toFixed(2)})`);
  const hist = toCalibratorHistory([{ predicted: 0.8, actual: 1 }, { predicted: 0.3, actual: 0 }]);
  assert.deepStrictEqual(hist, [{ pred: 0.8, win: 1 }, { pred: 0.3, win: 0 }], 'maps to {pred,win} (win 0/1)');
  assert.strictEqual(calibrateIsotonicLoss(0.62, hist), 0.62, 'cold-start (<200) ⇒ isotonic passes raw prob through');
  assert.strictEqual(CALIBRATION_MIN_SAMPLES, 200, 'cold-start floor is 200 (Rule 27 — do not lower)');
  console.log(`✔ calibration helpers — wilson 60/100 = [${w.low.toFixed(2)}, ${w.high.toFixed(2)}], cold-start passthrough ok`);
}

console.log('🎉 ALL FORWARD-LOG CORE TESTS PASSED! 🎉');
