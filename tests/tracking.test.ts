/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tracked-setups engine regression tests. This is the "Track Result" half of the product
 * promise, so its lifecycle + honesty rules must not silently break:
 *   - a call gains as spot rises; loses as spot falls
 *   - target reached → RESOLVED_WIN; invalidation touched → INVALIDATED; time out → EXPIRED
 *   - a setup on a DIFFERENT underlying is held (never fabricated), only time can expire it
 *   - dedupe: the same live contract can't be tracked twice
 *   - live performance is kept strictly apart from model/sample tracks
 */
import assert from 'assert';
import {
  useTrackingStore, resolveSetup, computeStats, splitByMode, isTerminal,
  type TrackInput, type TrackedSetup, type MarketContext,
} from '../src/lib/trackedSetups';

console.log('--- RUNNING TRACKED-SETUPS TEST SUITE ---');

const T0 = 1_000_000_000_000;
const baseCall: TrackInput = {
  source: 'skyvision', dataMode: 'live', ticker: 'SPX', contract: 'SPX 5500C',
  direction: 'BULLISH', strike: 5500, expiry: '0DTE', optionType: 'C',
  setupScore: 90, confidence: 80, premiumAtTrack: 10, spotAtTrack: 5500,
  expectedMovePct: 40, invalidationLevel: 5450, entryDelta: 0.5, entryThetaPerDay: -0.5, dteDays: 2,
};

function freshStore() { useTrackingStore.getState().clearAll(); }
function ctx(over: Partial<MarketContext>): MarketContext {
  return { ticker: 'SPX', spot: 5500, now: T0 + 60_000, ...over };
}

function testGainAndWin() {
  console.log('Testing call gains with spot + resolves to a win at target...');
  freshStore();
  const { setup } = useTrackingStore.getState().track(baseCall, T0);
  assert.strictEqual(setup.status, 'TRACKED', 'starts TRACKED');

  // Spot +40 → delta 0.5 → premium +20 on a 10 base = +200% (well past the 40% target).
  const r1 = resolveSetup(setup, ctx({ spot: 5540, now: T0 + 60_000 }));
  assert.ok(r1.premiumChangePct > 0, 'premium change is positive as spot rises');
  assert.ok(r1.maxGainPct >= r1.premiumChangePct, 'maxGain tracks the peak');
  assert.strictEqual(r1.status, 'RESOLVED_WIN', 'past target → RESOLVED_WIN');
  assert.ok((r1.finalReturnPct ?? 0) > 0, 'winning final return is positive');
  console.log(`  ✔ +${r1.premiumChangePct.toFixed(0)}% → RESOLVED_WIN`);
}

function testActiveThenInvalidation() {
  console.log('Testing invalidation touch → INVALIDATED...');
  freshStore();
  const { setup } = useTrackingStore.getState().track(baseCall, T0);
  // Small move up first: becomes ACTIVE, not resolved.
  const active = resolveSetup(setup, ctx({ spot: 5503, now: T0 + 30_000 }));
  assert.strictEqual(active.status, 'ACTIVE', 'small move → ACTIVE');
  // Now spot dives below the 5450 invalidation for a call.
  const dead = resolveSetup(active, ctx({ spot: 5440, now: T0 + 90_000 }));
  assert.strictEqual(dead.status, 'INVALIDATED', 'below invalidation → INVALIDATED');
  assert.ok(dead.invalidationTouched, 'invalidation flagged');
  assert.ok(isTerminal(dead.status), 'invalidated is terminal');
  console.log('  ✔ ACTIVE then INVALIDATED below the level');
}

function testHeldOnOtherUnderlying() {
  console.log('Testing a setup on another underlying is held (not fabricated)...');
  freshStore();
  const { setup } = useTrackingStore.getState().track(baseCall, T0);
  const held = resolveSetup(setup, { ticker: 'NDX', spot: 20000, now: T0 + 60_000 });
  assert.strictEqual(held, setup, 'non-matching ticker within its window → unchanged reference');
  // But time still expires it once past the window.
  const expired = resolveSetup(setup, { ticker: 'NDX', spot: 20000, now: setup.expiresAt + 1 });
  assert.strictEqual(expired.status, 'EXPIRED', 'past expiry → EXPIRED even without observation');
  console.log('  ✔ held off-underlying; expires only on time');
}

function testDedupe() {
  console.log('Testing dedupe of the same live contract...');
  freshStore();
  const a = useTrackingStore.getState().track(baseCall, T0);
  const b = useTrackingStore.getState().track(baseCall, T0 + 5_000);
  assert.strictEqual(b.duplicate, true, 'second track of same contract is a duplicate');
  assert.strictEqual(useTrackingStore.getState().setups.length, 1, 'only one record stored');
  assert.strictEqual(a.setup.id, b.setup.id, 'returns the existing record');
  console.log('  ✔ one contract, one record');
}

function testLiveVsModelSeparation() {
  console.log('Testing live vs model/sample stat separation...');
  freshStore();
  // One resolved LIVE win, one resolved SAMPLE loss.
  const liveWin: TrackedSetup = { ...mk('live'), status: 'RESOLVED_WIN', finalReturnPct: 120 };
  const sampleLoss: TrackedSetup = { ...mk('sample'), status: 'INVALIDATED', finalReturnPct: -80 };
  const { live, modelSample } = splitByMode([liveWin, sampleLoss]);
  const liveStats = computeStats(live);
  const modelStats = computeStats(modelSample);
  assert.strictEqual(liveStats.winRate, 100, 'live win-rate is 100% (1-0)');
  assert.strictEqual(modelStats.winRate, 0, 'sample win-rate is 0% (0-1)');
  assert.strictEqual(liveStats.losses, 0, 'sample loss never counts against live');
  console.log('  ✔ sample loss does not touch the live win-rate');
}

// Minimal resolved record for stat tests.
function mk(mode: TrackedSetup['dataMode']): TrackedSetup {
  return {
    id: `x_${mode}`, createdAt: T0, updatedAt: T0, source: 'skyvision', kind: 'contract', dataMode: mode,
    ticker: 'SPX', contract: 'SPX 5500C', direction: 'BULLISH', strike: 5500, expiry: '0DTE', optionType: 'C',
    setupScore: 90, confidence: 80, premiumAtTrack: 10, spotAtTrack: 5500, fairValue: null, expectedMovePct: 40,
    invalidationLevel: 5450, dealerReason: '—', volatilityReason: '—', liquidityGrade: '—',
    entryDelta: 0.5, entryThetaPerDay: -0.5, dteDays: 2, expiresAt: T0 + 2 * 86_400_000,
    status: 'ACTIVE', currentPremium: 10, premiumChangePct: 0, maxGainPct: 0, maxDrawdownPct: 0,
    invalidationTouched: false, targetReached: false, resolvedAt: T0, finalReturnPct: 0,
  };
}

testGainAndWin();
testActiveThenInvalidation();
testHeldOnOtherUnderlying();
testDedupe();
testLiveVsModelSeparation();

console.log('🎉 ALL TRACKED-SETUPS TESTS PASSED! 🎉');
