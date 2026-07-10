/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * SkyVision v2 wiring (spec §20) — proves the master score flows end-to-end
 * through the server service: tickSkyVision(scope, edgeCache, dealerDynCache) →
 * computeForAsset → computeSkyVisionMaster → getSkyVision().masterV2. Also proves
 * the component-by-component abstention when a ticker has no AssetEdge this tick.
 */
import assert from 'node:assert';
import { tickSkyVision, getSkyVision } from '../src/server/skyVisionService';
import { ASSET_LIST } from '../src/data';
import type { AssetEdge } from '../src/lib/quantEdge';
import type { DealerDynamics } from '../src/lib/dealerDynamics';

console.log('--- RUNNING SKYVISION v2 WIRING TEST ---');

const asset = ASSET_LIST[0];
const t = asset.ticker;
const edge = {
  vrp: { richness: 'IV CHEAP', ratio: 0.85 },
  skew: { rrPercentile: 60 },
  regime: { hurst: 0.62, state: 'TREND_EXPANSION' },
  dealerClock: { weightedCharm: 4e5, weightedVanna: 1e5, session: 'OPEN' },
  vpin: { vpin: 0.3 },
  netDelta: { direction: 'BULLISH' },
  fisher: { structuralShift: false },
} as unknown as AssetEdge;
const dyn = { gamma: { velocity: 3e8 } } as unknown as DealerDynamics;

tickSkyVision([asset], { [t]: edge }, { [t]: dyn });
const sv = getSkyVision(t);
assert.ok(sv, 'sky vision produced for edged ticker');
assert.ok(sv!.masterV2, 'masterV2 attached to the frame');
const m = sv!.masterV2!;
assert.ok(m.score >= 0 && m.score <= 100, `score bounded (${m.score})`);
assert.ok(['INTRADAY', 'NEAR_TERM', 'SWING'].includes(m.mode), 'mode selected');
assert.ok(m.regimeContext?.breakdown, 'regimeContext breakdown present');
assert.strictEqual(m.regimeContext.vrpSignal, 'IV CHEAP', 'regimeContext carries the real vrp signal');
assert.ok(m.subScores.vrp > 50, `cheap IV ⇒ vrp>50 (${m.subScores.vrp})`);
console.log(`✔ edged ticker ${t}: masterV2 score=${m.score}, mode=${m.mode}, breakdown=${JSON.stringify(m.subScores)}`);

const asset2 = ASSET_LIST[1];
tickSkyVision([asset2], {}, {});
const sv2 = getSkyVision(asset2.ticker);
assert.ok(sv2?.masterV2, 'masterV2 present even without an AssetEdge');
assert.strictEqual(sv2!.masterV2!.subScores.vrp, 50, 'no edge ⇒ vrp abstains to 50 (no fabricated signal)');
assert.strictEqual(sv2!.masterV2!.subScores.skew, 50, 'no edge ⇒ skew abstains to 50');
console.log(`✔ un-edged ticker ${asset2.ticker}: masterV2 abstains (vrp=${sv2!.masterV2!.subScores.vrp}), score=${sv2!.masterV2!.score}`);

console.log('🎉 ALL SKYVISION v2 WIRING TESTS PASSED! 🎉');
