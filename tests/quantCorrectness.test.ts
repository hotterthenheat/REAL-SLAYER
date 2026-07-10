/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Quant correctness regression suite — locks the formula fixes from the
 * quant-correctness audit so real market data flows through provably-correct math:
 *   1. realizedVol.periodsPerYear annualizes daily bars as 252/yr (not 68.25).
 *   2. computeSkewAnalytics.skewSlopeAtm has the sign of a true dσ/dK.
 *   3. computeRiskNeutralDensity.skewBias measures smile asymmetry (log-space),
 *      not lognormal convexity — flat vol ⇒ SYMMETRIC, put skew ⇒ DOWNSIDE.
 */
import assert from 'node:assert';
import { periodsPerYear } from '../src/lib/realizedVol';
import { computeSkewAnalytics, solveImpliedRND, buildStrategySuite, type OptionLeg } from '../src/lib/quantSuite';
import { computeRiskNeutralDensity } from '../src/lib/riskNeutral';
import type { ChainContract } from '../src/lib/v11Math';

console.log('--- RUNNING QUANT-CORRECTNESS REGRESSION SUITE ---');

console.log('Testing periodsPerYear annualizes intraday AND daily/slower bars correctly...');
{
  // Intraday (≤390-min session) bars pack inside the session: 252·390/interval.
  assert.strictEqual(periodsPerYear(5), (252 * 390) / 5, '5-min → 19656/yr');
  assert.strictEqual(periodsPerYear(390), 252, 'a 390-min session bar → 252/yr');
  // Daily bar (≈1440 calendar-min) is ONE bar per session ⇒ 252/yr, NOT 68.25.
  assert.strictEqual(periodsPerYear(1440), 252, 'daily (1440-min) → 252/yr');
  const dailyAnn = Math.sqrt(periodsPerYear(1440));
  assert.ok(Math.abs(dailyAnn - Math.sqrt(252)) < 1e-9, `daily annualizer √252≈15.87 (was √68.25≈8.26), got ${dailyAnn.toFixed(2)}`);
  // Weekly-ish (2 sessions) stays sane rather than exploding.
  assert.ok(periodsPerYear(2880) < 252 && periodsPerYear(2880) > 100, '2-session bar between 100 and 252/yr');
  console.log(`✔ periodsPerYear — 5m=${periodsPerYear(5)}, daily=${periodsPerYear(1440)} (√=${dailyAnn.toFixed(2)})`);
}

// Build a chain with a chosen IV(strike) shape and parity-consistent deltas so
// ivAtDelta(0.25) resolves a real 25Δ strike on each wing.
const spot = 100;
function buildChain(ivAt: (k: number) => number): ChainContract[] {
  const out: ChainContract[] = [];
  for (let k = 70; k <= 130; k += 2.5) {
    const iv = Math.max(0.1, Math.min(0.6, ivAt(k)));
    const callDelta = Math.max(0.02, Math.min(0.98, 0.5 * (1 - (k - spot) / (spot * 0.5))));
    const putDelta = callDelta - 1; // put-call parity: Δput = Δcall − 1
    const base = { strike: k, openInterest: 1000, iv, bid: 1, ask: 1.1, gamma: 0.02, vega: 2, theta: -0.1, vanna: 0.01, charm: -0.005 };
    out.push({ ...base, type: 'call', delta: callDelta });
    out.push({ ...base, type: 'put', delta: putDelta });
  }
  return out;
}

console.log('Testing skewSlopeAtm has the sign of a genuine dσ/dK (put skew ⇒ negative)...');
{
  // Put skew: IV higher at LOW strikes ⇒ smile slopes DOWN in strike ⇒ dσ/dK < 0.
  const putSkew = buildChain((k) => 0.25 + ((spot - k) / spot) * 0.4);
  const s = computeSkewAnalytics(putSkew, spot, 0.25);
  assert.ok(s.skewSlopeAtm < 0, `put-skew smile ⇒ skewSlopeAtm < 0, got ${s.skewSlopeAtm.toFixed(4)}`);
  // Risk reversal (call25 − put25) must agree in sign with the slope.
  assert.ok(s.riskReversal25D < 0, `put-skew ⇒ RR25 < 0, got ${s.riskReversal25D.toFixed(4)}`);
  // Call skew (IV higher at HIGH strikes) must flip the slope positive.
  const callSkew = buildChain((k) => 0.25 + ((k - spot) / spot) * 0.4);
  const s2 = computeSkewAnalytics(callSkew, spot, 0.25);
  assert.ok(s2.skewSlopeAtm > 0, `call-skew smile ⇒ skewSlopeAtm > 0, got ${s2.skewSlopeAtm.toFixed(4)}`);
  console.log(`✔ skewSlopeAtm sign — put-skew ${s.skewSlopeAtm.toFixed(4)}, call-skew ${s2.skewSlopeAtm.toFixed(4)}`);
}

console.log('Testing RND skewBias measures smile asymmetry, not lognormal convexity...');
{
  // Flat vol ⇒ (near-)lognormal RND ⇒ must read SYMMETRIC, NOT a false UPSIDE SKEW.
  const flat = computeRiskNeutralDensity(buildChain(() => 0.25), spot, 30);
  assert.ok(flat !== null, 'flat-vol RND computes');
  assert.strictEqual(flat!.skewBias, 'SYMMETRIC', `flat vol ⇒ SYMMETRIC, got ${flat!.skewBias}`);
  // Put skew ⇒ fatter left tail ⇒ DOWNSIDE SKEW.
  const putSkew = computeRiskNeutralDensity(buildChain((k) => 0.25 + ((spot - k) / spot) * 0.5), spot, 30);
  assert.ok(putSkew !== null, 'put-skew RND computes');
  assert.strictEqual(putSkew!.skewBias, 'DOWNSIDE SKEW', `put skew ⇒ DOWNSIDE SKEW, got ${putSkew!.skewBias}`);
  // fatTailRatio is finite and positive (band centred on the RND mean, not spot).
  assert.ok(isFinite(flat!.fatTailRatio) && flat!.fatTailRatio > 0, 'fatTailRatio finite/positive');
  console.log(`✔ skewBias — flat=${flat!.skewBias}, putSkew=${putSkew!.skewBias}, flat fatTail=${flat!.fatTailRatio.toFixed(2)}`);
}

console.log('Testing mock-leak provenance — a fabricated RND is flagged and cannot size Kelly...');
{
  // Sparse chain (<5) ⇒ solveImpliedRND returns a FALLBACK PRIOR, which must be flagged.
  const dummy = solveImpliedRND([], 100, 0.25);
  assert.strictEqual(dummy.isEstimate, true, 'sparse/degenerate chain ⇒ RND flagged isEstimate');
  const legs: OptionLeg[] = [{ id: 'x', strike: 100, type: 'call', action: 'buy', qty: 1, iv: 0.25, entryPrice: 2 }];
  const suite = buildStrategySuite(legs, 100, 30, 0.05, dummy);
  assert.strictEqual(suite.isEstimate, true, 'strategy suite carries the estimate flag');
  assert.strictEqual(suite.kellySizing, 0, 'no Kelly sizing off a fabricated distribution (§24/§27.6)');
  console.log(`✔ provenance — dummy.isEstimate=${dummy.isEstimate}, suite.kelly=${suite.kellySizing}`);
}

console.log('🎉 ALL QUANT-CORRECTNESS TESTS PASSED! 🎉');
