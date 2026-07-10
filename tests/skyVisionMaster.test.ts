/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * SkyVision v2 master score (spec §20) — locks every rule the spec pins:
 * mode selection, weight sums, VRP no-flip + N/A guard, skew direction
 * (Xing-Zhang-Zhao), the fade-wall regime rule, the LIVE-gated informed-flow
 * multiplier, and the Fisher structural-shift cap.
 */
import assert from 'node:assert';
import {
  computeSkyVisionMaster, selectMode, MODE_WEIGHTS, __resetSkyVisionMasterState,
  type SkyVisionMasterInput,
} from '../src/lib/skyVisionMaster';
import type { AssetEdge } from '../src/lib/quantEdge';

console.log('--- RUNNING SKYVISION v2 MASTER SCORE SUITE ---');

const mkEdge = (p: any): AssetEdge => p as unknown as AssetEdge;
const baseInput = (over: Partial<SkyVisionMasterInput> = {}): SkyVisionMasterInput => ({
  ticker: 'TST', dteDays: 5, direction: 'BULLISH', leadIsCall: true,
  spot: 100, callWall: 105, putWall: 95, contractStrength: 50, emaStructure: 50,
  edge: null, gammaVelocity: 0, isLive: false, ...over,
});

console.log('Testing mode selection + weight sets sum to exactly 1.00...');
{
  assert.strictEqual(selectMode(0.5), 'INTRADAY');
  assert.strictEqual(selectMode(7), 'NEAR_TERM');
  assert.strictEqual(selectMode(30), 'SWING');
  for (const [mode, w] of Object.entries(MODE_WEIGHTS)) {
    const sum = w.vrp + w.skew + w.regime + w.clock + w.gexVel + w.contract + w.emaStructure;
    assert.ok(Math.abs(sum - 1) < 1e-9, `${mode} weights sum to 1.00 (got ${sum})`);
  }
  console.log('✔ modes + weight sums');
}

console.log('Testing VRP: N/A guard ⇒ 50, cheap ⇒ >50, rich ⇒ <50, and NO direction flip...');
{
  __resetSkyVisionMasterState();
  const na = computeSkyVisionMaster(baseInput({ ticker: 'A1', edge: mkEdge({ vrp: { richness: 'N/A', ratio: 0 } }) }));
  assert.strictEqual(na.subScores.vrp, 50, 'N/A ⇒ 50 (not a fabricated max signal)');
  const cheap = computeSkyVisionMaster(baseInput({ ticker: 'A2', edge: mkEdge({ vrp: { richness: 'IV CHEAP', ratio: 0.8 } }) }));
  assert.ok(cheap.subScores.vrp > 50, `cheap IV favors buyers (>50), got ${cheap.subScores.vrp}`);
  const rich = computeSkyVisionMaster(baseInput({ ticker: 'A3', edge: mkEdge({ vrp: { richness: 'IV RICH', ratio: 1.3 } }) }));
  assert.ok(rich.subScores.vrp < 50, `rich IV penalizes buyers (<50), got ${rich.subScores.vrp}`);
  // No direction flip: a put lead sees the SAME vrp score (both plays are long premium).
  const richPut = computeSkyVisionMaster(baseInput({ ticker: 'A4', leadIsCall: false, direction: 'BEARISH', edge: mkEdge({ vrp: { richness: 'IV RICH', ratio: 1.3 } }) }));
  assert.strictEqual(rich.subScores.vrp, richPut.subScores.vrp, 'VRP identical for call vs put lead (no flip)');
  console.log(`✔ VRP — N/A=50, cheap=${cheap.subScores.vrp}, rich=${rich.subScores.vrp} (call==put)`);
}

console.log('Testing SKEW follows the smirk: high put-skew percentile favors PUT buyers...');
{
  __resetSkyVisionMasterState();
  const hi = mkEdge({ skew: { rrPercentile: 90 } });
  const call = computeSkyVisionMaster(baseInput({ ticker: 'S1', leadIsCall: true, edge: hi }));
  const put = computeSkyVisionMaster(baseInput({ ticker: 'S2', leadIsCall: false, direction: 'BEARISH', edge: hi }));
  assert.strictEqual(call.subScores.skew, 10, 'high rrPct ⇒ call skew score 100−90=10');
  assert.strictEqual(put.subScores.skew, 90, 'high rrPct ⇒ put skew score 90 (put buyers favored)');
  assert.ok(put.subScores.skew > call.subScores.skew, 'put favored over call on steep put smirk');
  console.log(`✔ SKEW — call=${call.subScores.skew}, put=${put.subScores.skew}`);
}

console.log('Testing REGIME fade-wall rule + persistence...');
{
  __resetSkyVisionMasterState();
  // Trending: directional lead confirmed.
  const trend = computeSkyVisionMaster(baseInput({ ticker: 'R1', edge: mkEdge({ regime: { hurst: 0.7, state: 'TREND_EXPANSION' } }) }));
  assert.strictEqual(trend.subScores.regime, 70, 'H>0.55 + directional ⇒ 70');
  // Mean-reverting call NEAR the put wall (fade the down-extension) ⇒ confirmed.
  const fade = computeSkyVisionMaster(baseInput({ ticker: 'R2', leadIsCall: true, spot: 95.2, putWall: 95, edge: mkEdge({ regime: { hurst: 0.3, state: 'MEAN_REVERSION' } }) }));
  assert.strictEqual(fade.subScores.regime, 70, 'MR + call near PUT wall ⇒ fade confirmed 70');
  // Mean-reverting call near the CALL wall (chasing the up-extension) ⇒ anti-edge.
  const chase = computeSkyVisionMaster(baseInput({ ticker: 'R3', leadIsCall: true, spot: 104.9, callWall: 105, putWall: 95, edge: mkEdge({ regime: { hurst: 0.3, state: 'MEAN_REVERSION' } }) }));
  assert.strictEqual(chase.subScores.regime, 35, 'MR + call chasing CALL wall ⇒ anti-edge 35');
  console.log(`✔ REGIME — trend=${trend.subScores.regime}, fade=${fade.subScores.regime}, chase=${chase.subScores.regime}`);
}

console.log('Testing DEALER CLOCK sign + percentile (singleton guard ⇒ half-swing; warm history ⇒ magnitude)...');
{
  const clk = (charm: number, vanna: number) => mkEdge({ dealerClock: { weightedCharm: charm, weightedVanna: vanna, session: 'MIDDAY' } });
  // First tick: percentileRank singleton guard returns 50 ⇒ half of the ±35 swing.
  __resetSkyVisionMasterState();
  const bull = computeSkyVisionMaster(baseInput({ ticker: 'C1', leadIsCall: true, edge: clk(6e5, 2e5) }));
  assert.ok(bull.subScores.clock > 50, `cv>0 + call ⇒ >50 (${bull.subScores.clock})`);
  __resetSkyVisionMasterState();
  const bear = computeSkyVisionMaster(baseInput({ ticker: 'C2', leadIsCall: false, direction: 'BEARISH', edge: clk(6e5, 2e5) }));
  assert.ok(bear.subScores.clock < 50 && Math.abs((bull.subScores.clock - 50) + (bear.subScores.clock - 50)) <= 1, 'call/put clock symmetric about 50 (±1 rounding)');
  // cv < 0 flips a call lead below 50.
  __resetSkyVisionMasterState();
  const bullNeg = computeSkyVisionMaster(baseInput({ ticker: 'C3', leadIsCall: true, edge: clk(-6e5, -2e5) }));
  assert.ok(bullNeg.subScores.clock < 50, `cv<0 + call ⇒ <50 (${bullNeg.subScores.clock})`);
  // Warm a small-magnitude history, then a large |cv| ranks ~100th pct ⇒ near-max swing.
  __resetSkyVisionMasterState();
  for (let i = 0; i < 12; i++) computeSkyVisionMaster(baseInput({ ticker: 'C4', leadIsCall: true, edge: clk(1e3, 0) }));
  const bigMag = computeSkyVisionMaster(baseInput({ ticker: 'C4', leadIsCall: true, edge: clk(1e8, 0) }));
  assert.ok(bigMag.subScores.clock >= 84, `large |cv| vs own history ⇒ near-max (${bigMag.subScores.clock})`);
  console.log(`✔ CLOCK — bull=${bull.subScores.clock}, bear=${bear.subScores.clock}, bigMag=${bigMag.subScores.clock}`);
}

console.log('Testing informed-flow multiplier is LIVE-gated + alignment-gated...');
{
  __resetSkyVisionMasterState();
  const edge = mkEdge({ vpin: { vpin: 0.5 }, netDelta: { direction: 'BULLISH' } });
  const sim = computeSkyVisionMaster(baseInput({ ticker: 'F1', isLive: false, edge }));
  assert.strictEqual(sim.flowMultiplier, 1.0, 'SIMULATED tape ⇒ no multiplier');
  const aligned = computeSkyVisionMaster(baseInput({ ticker: 'F2', isLive: true, leadIsCall: true, edge }));
  assert.strictEqual(aligned.flowMultiplier, 1.10, 'LIVE + VPIN>0.4 + tape aligned ⇒ ×1.10');
  const against = computeSkyVisionMaster(baseInput({ ticker: 'F3', isLive: true, leadIsCall: false, direction: 'BEARISH', edge }));
  assert.strictEqual(against.flowMultiplier, 0.80, 'LIVE + informed flow AGAINST ⇒ ×0.80');
  console.log(`✔ FLOW — sim=${sim.flowMultiplier}, aligned=${aligned.flowMultiplier}, against=${against.flowMultiplier}`);
}

console.log('Testing Fisher structural-shift caps the score at 55...');
{
  __resetSkyVisionMasterState();
  const strong = { contractStrength: 100, emaStructure: 100 };
  const noShift = computeSkyVisionMaster(baseInput({ ticker: 'G1', ...strong, edge: mkEdge({ fisher: { structuralShift: false } }) }));
  assert.ok(noShift.score > 55, `no shift ⇒ strong score allowed (${noShift.score})`);
  const shift = computeSkyVisionMaster(baseInput({ ticker: 'G2', ...strong, edge: mkEdge({ fisher: { structuralShift: true } }) }));
  assert.ok(shift.score <= 55 && shift.fisherCapped, `structural shift ⇒ capped ≤55 (${shift.score})`);
  console.log(`✔ FISHER — noShift=${noShift.score}, shift=${shift.score} (capped)`);
}

console.log('Testing full integration: bounded score + populated regimeContext...');
{
  __resetSkyVisionMasterState();
  const r = computeSkyVisionMaster(baseInput({
    ticker: 'Z1', dteDays: 0.5, isLive: true, gammaVelocity: 3e8,
    edge: mkEdge({
      vrp: { richness: 'IV CHEAP', ratio: 0.85 },
      skew: { rrPercentile: 60 },
      regime: { hurst: 0.62, state: 'TREND_EXPANSION' },
      dealerClock: { weightedCharm: 4e5, weightedVanna: 1e5, session: 'OPEN' },
      vpin: { vpin: 0.3 }, netDelta: { direction: 'BULLISH' },
      fisher: { structuralShift: false },
    }),
  }));
  assert.ok(r.score >= 0 && r.score <= 100, 'score in [0,100]');
  assert.strictEqual(r.mode, 'INTRADAY', '0.5 DTE ⇒ INTRADAY');
  assert.strictEqual(r.regimeContext.vrpSignal, 'IV CHEAP', 'regimeContext carries vrp signal');
  assert.strictEqual(r.regimeContext.hurst, 0.62, 'regimeContext carries hurst');
  assert.ok(r.regimeContext.signsUnresolved.includes('GEXVEL_SIGN'), 'unresolved signs surfaced');
  console.log(`✔ integration — score=${r.score}, mode=${r.mode}, ctx ok`);
}

console.log('🎉 ALL SKYVISION v2 MASTER SCORE TESTS PASSED! 🎉');
