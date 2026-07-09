import React, { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Target,
  Search,
  RefreshCw,
  Info,
  X,
  Save,
  Plus,
  Star,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  AlertTriangle,
  Droplet,
  Crosshair,
  CheckCircle2,
  ArrowUpRight,
  Activity,
  Layers,
  Clock,
  Signal,
} from 'lucide-react';
import { AssetInfo } from '../types';
import { ASSET_LIST } from '../data';
import { useContractStore } from '../lib/store';
import { formatTime } from '../lib/timeUtils';
import { fmtNum } from '../lib/format';
import { DataStateBadge } from './ui/DataStateBadge';
import { deriveSetup, type DerivedSetup, type ScannerContract } from './scanner/SetupQueue';
import { TerminalPanel } from './ui/terminal/TerminalPanel';
import { DataTable, type Column } from './ui/terminal/DataTable';
import { StatusBadge, type BadgeTone } from './ui/terminal/StatusBadge';
import { toast } from './ui/toast';
import {
  useTrackingStore,
  setupKey,
  isTerminal,
  STATUS_LABEL,
  type TrackedSetup,
} from '../lib/trackedSetups';
import { loadWatchlist, saveWatchlist, toggleWatch } from '../lib/watchlist';

interface DiscoveryViewProps {
  systemScore: any;
  discovery?: {
    mispricedCalls: any[];
    mispricedPuts: any[];
    mostImproved: any[];
    nearInvalidation: any[];
  };
  onSelectContract: (asset: AssetInfo, strike: number, isCall: boolean) => void;
}

// SAMPLE / ILLUSTRATIVE options tiles — static demo rows used to seed the layout
// before/without a connected options feed. These are NOT a live scan and the
// numbers are placeholders; the UI labels this view "SAMPLE DATA".
const INITIAL_CONTRACTS = [
  // SHELF: CONVICTION
  {
    id: 'spx-7620-c',
    ticker: 'SPX',
    strike: 5520,
    isCall: true,
    health: 96,
    expectedMove: '+42.5%',
    action: 'ENTER' as const,
    narrative: 'Heavy institutional volume cluster matched. Dealer buy walls are perfectly positioned.',
    tagText: 'CONVICTION',
    shelf: 'conviction',
    delta: 0.54,
    gamma: 0.024,
    vega: 0.14,
    theta: -0.81,
    volume: 14205,
    price: 5.40,
    bid: 5.35,
    ask: 5.45,
    t1: 7.20,
    p1: 33
  },
  {
    id: 'spy-515-c',
    ticker: 'SPY',
    strike: 515,
    isCall: true,
    health: 93,
    expectedMove: '+36.2%',
    action: 'ENTER' as const,
    narrative: 'Unusually clean volume profile confirms call momentum.',
    tagText: 'CONVICTION',
    shelf: 'conviction',
    delta: 0.48,
    gamma: 0.038,
    vega: 0.12,
    theta: -0.45,
    volume: 38201,
    price: 3.20,
    bid: 3.18,
    ask: 3.22,
    t1: 4.35,
    p1: 36
  },
  {
    id: 'qqq-448-c',
    ticker: 'QQQ',
    strike: 448,
    isCall: true,
    health: 91,
    expectedMove: '+29.0%',
    action: 'ENTER' as const,
    narrative: 'Dealer block purchases confirm near-term floor.',
    tagText: 'CONVICTION',
    shelf: 'conviction',
    delta: 0.52,
    gamma: 0.041,
    vega: 0.15,
    theta: -0.55,
    volume: 22401,
    price: 4.20,
    bid: 4.15,
    ask: 4.25,
    t1: 5.40,
    p1: 29
  },
  {
    id: 'ndx-18350-c',
    ticker: 'NDX',
    strike: 18350,
    isCall: true,
    health: 90,
    expectedMove: '+31.4%',
    action: 'ENTER' as const,
    narrative: 'Rapid acceleration in derivative order flow on Nasdaq nodes.',
    tagText: 'CONVICTION',
    shelf: 'conviction',
    delta: 0.49,
    gamma: 0.015,
    vega: 0.18,
    theta: -1.25,
    volume: 5204,
    price: 15.50,
    bid: 15.30,
    ask: 15.70,
    t1: 20.30,
    p1: 31
  },
  {
    id: 'spx-7600-c',
    ticker: 'SPX',
    strike: 5500,
    isCall: true,
    health: 95,
    expectedMove: '+39.1%',
    action: 'ENTER' as const,
    narrative: 'Below spot magnet concentration attracts structural institutional buyer hedging.',
    tagText: 'CONVICTION',
    shelf: 'conviction',
    delta: 0.62,
    gamma: 0.021,
    vega: 0.13,
    theta: -0.92,
    volume: 18940,
    price: 11.20,
    bid: 11.10,
    ask: 11.30,
    t1: 15.60,
    p1: 39
  },
  {
    id: 'spy-510-c',
    ticker: 'SPY',
    strike: 510,
    isCall: true,
    health: 92,
    expectedMove: '+34.8%',
    action: 'ENTER' as const,
    narrative: 'Slayer deep learning index detects massive localized volume sweep.',
    tagText: 'CONVICTION',
    shelf: 'conviction',
    delta: 0.58,
    gamma: 0.035,
    vega: 0.13,
    theta: -0.48,
    volume: 45100,
    price: 5.10,
    bid: 5.05,
    ask: 5.15,
    t1: 6.85,
    p1: 34
  },

  // SHELF: IMPROVED / VELOCITY
  {
    id: 'ndx-18300-c',
    ticker: 'NDX',
    strike: 18300,
    isCall: true,
    health: 89,
    expectedMove: '+55.2%',
    action: 'ENTER' as const,
    narrative: 'Rapid jump in scoring index over the last 15 minutes. High expansion.',
    tagText: 'VELOCITY',
    shelf: 'improved',
    delta: 0.58,
    gamma: 0.018,
    vega: 0.19,
    theta: -1.15,
    volume: 6310,
    price: 14.20,
    bid: 14.05,
    ask: 14.35,
    t1: 22.01,
    p1: 55
  },
  {
    id: 'qqq-446-c',
    ticker: 'QQQ',
    strike: 446,
    isCall: true,
    health: 88,
    expectedMove: '+32.4%',
    action: 'ENTER' as const,
    narrative: 'Dealer short blocks have dissolved, freeing up massive room overhead.',
    tagText: 'VELOCITY',
    shelf: 'improved',
    delta: 0.54,
    gamma: 0.043,
    vega: 0.16,
    theta: -0.58,
    volume: 29402,
    price: 3.80,
    bid: 3.75,
    ask: 3.85,
    t1: 5.05,
    p1: 32
  },
  {
    id: 'spy-514-c',
    ticker: 'SPY',
    strike: 514,
    isCall: true,
    health: 87,
    expectedMove: '+28.5%',
    action: 'ENTER' as const,
    narrative: 'Score rating surges as dealers transition from negative gamma to neutral gamma.',
    tagText: 'VELOCITY',
    shelf: 'improved',
    delta: 0.51,
    gamma: 0.039,
    vega: 0.12,
    theta: -0.46,
    volume: 18920,
    price: 2.80,
    bid: 2.77,
    ask: 2.83,
    t1: 3.60,
    p1: 28
  },
  {
    id: 'spx-7660-c',
    ticker: 'SPX',
    strike: 5560,
    isCall: true,
    health: 86,
    expectedMove: '+45.0%',
    action: 'ENTER' as const,
    narrative: 'Breakout momentum identified. Standard dispersion limit predicts vol expansion.',
    tagText: 'VELOCITY',
    shelf: 'improved',
    delta: 0.42,
    gamma: 0.019,
    vega: 0.14,
    theta: -0.84,
    volume: 9811,
    price: 4.80,
    bid: 4.70,
    ask: 4.90,
    t1: 6.95,
    p1: 45
  },
  {
    id: 'qqq-450-c',
    ticker: 'QQQ',
    strike: 450,
    isCall: true,
    health: 85,
    expectedMove: '+26.8%',
    action: 'ENTER' as const,
    narrative: 'Derivative speed indices ticking straight up; fast buy feedback loop active.',
    tagText: 'VELOCITY',
    shelf: 'improved',
    delta: 0.46,
    gamma: 0.040,
    vega: 0.17,
    theta: -0.61,
    volume: 15400,
    price: 2.65,
    bid: 2.61,
    ask: 2.69,
    t1: 3.35,
    p1: 26
  },
  {
    id: 'spx-7640-c',
    ticker: 'SPX',
    strike: 5540,
    isCall: true,
    health: 88,
    expectedMove: '+30.2%',
    action: 'ENTER' as const,
    narrative: 'Rapid acceleration in order flow profile matches strong buy trend.',
    tagText: 'VELOCITY',
    shelf: 'improved',
    delta: 0.52,
    gamma: 0.022,
    vega: 0.13,
    theta: -0.85,
    volume: 12401,
    price: 6.80,
    bid: 6.70,
    ask: 6.90,
    t1: 8.85,
    p1: 30
  },

  // SHELF: MISPRICED / ARBITRAGE
  {
    id: 'spy-442-p',
    ticker: 'SPY',
    strike: 442,
    isCall: false,
    health: 85,
    expectedMove: '+24.1%',
    action: 'HOLD' as const,
    narrative: 'Valuation curve points to an extreme temporary discount on deep puts.',
    tagText: 'MISPRICED',
    shelf: 'mispriced',
    delta: -0.12,
    gamma: 0.008,
    vega: 0.06,
    theta: -0.15,
    volume: 5310,
    price: 0.45,
    bid: 0.43,
    ask: 0.47,
    t1: 0.55,
    p1: 22
  },
  {
    id: 'spx-7650-c',
    ticker: 'SPX',
    strike: 5550,
    isCall: true,
    health: 83,
    expectedMove: '+18.5%',
    action: 'HOLD' as const,
    narrative: 'Priced exceptionally cheap relative to general spot move; heavy IV discount.',
    tagText: 'MISPRICED',
    shelf: 'mispriced',
    delta: 0.45,
    gamma: 0.020,
    vega: 0.14,
    theta: -0.83,
    volume: 8105,
    price: 5.10,
    bid: 5.00,
    ask: 5.20,
    t1: 6.05,
    p1: 18
  },
  {
    id: 'spy-508-p',
    ticker: 'SPY',
    strike: 508,
    isCall: false,
    health: 81,
    expectedMove: '+20.5%',
    action: 'HOLD' as const,
    narrative: 'Theoretical model price sits at $1.85, while active broker ask is $1.35.',
    tagText: 'MISPRICED',
    shelf: 'mispriced',
    delta: -0.38,
    gamma: 0.025,
    vega: 0.11,
    theta: -0.32,
    volume: 12502,
    price: 1.35,
    bid: 1.32,
    ask: 1.38,
    t1: 1.62,
    p1: 20
  },
  {
    id: 'spx-7590-p',
    ticker: 'SPX',
    strike: 5490,
    isCall: false,
    health: 84,
    expectedMove: '+27.0%',
    action: 'ENTER' as const,
    narrative: 'Implied volatility suppression created a perfect risk-to-reward underpricing node.',
    tagText: 'MISPRICED',
    shelf: 'mispriced',
    delta: -0.41,
    gamma: 0.018,
    vega: 0.13,
    theta: -0.75,
    volume: 7500,
    price: 12.80,
    bid: 12.60,
    ask: 13.00,
    t1: 16.25,
    p1: 27
  },
  {
    id: 'qqq-442-p',
    ticker: 'QQQ',
    strike: 442,
    isCall: false,
    health: 80,
    expectedMove: '+19.2%',
    action: 'HOLD' as const,
    narrative: 'Underpriced hedge option with high delta sensitivity relative to current spot.',
    tagText: 'MISPRICED',
    shelf: 'mispriced',
    delta: -0.39,
    gamma: 0.034,
    vega: 0.14,
    theta: -0.42,
    volume: 16210,
    price: 2.15,
    bid: 2.12,
    ask: 2.18,
    t1: 2.56,
    p1: 19
  },
  {
    id: 'ndx-18200-p',
    ticker: 'NDX',
    strike: 18200,
    isCall: false,
    health: 82,
    expectedMove: '+22.4%',
    action: 'HOLD' as const,
    narrative: 'Strong theoretical offset detected. Arbitrage spread calculated at 14.5%.',
    tagText: 'ARBITRAGE',
    shelf: 'mispriced',
    delta: -0.44,
    gamma: 0.014,
    vega: 0.18,
    theta: -1.10,
    volume: 3840,
    price: 42.10,
    bid: 41.50,
    ask: 42.70,
    t1: 51.50,
    p1: 22
  },

  // SHELF: INVALIDATION / BOUNDARIES
  {
    id: 'spx-7610-p',
    ticker: 'SPX',
    strike: 5510,
    isCall: false,
    health: 48,
    expectedMove: '-15.4%',
    action: 'REDUCE' as const,
    narrative: 'Slipped past main dealer GEX hedge floor. Tail risk exponentially flashing high.',
    tagText: 'INVALIDATION',
    shelf: 'invalidation',
    delta: -0.42,
    gamma: 0.021,
    vega: 0.13,
    theta: -0.85,
    volume: 15401,
    price: 18.50,
    bid: 18.30,
    ask: 18.70,
    t1: 15.65,
    p1: -15
  },
  {
    id: 'spy-440-p',
    ticker: 'SPY',
    strike: 440,
    isCall: false,
    health: 51,
    expectedMove: '-10.2%',
    action: 'SELL' as const,
    narrative: 'Liquidity sweep void detected below current level. Immediate defensive alert.',
    tagText: 'INVALIDATION',
    shelf: 'invalidation',
    delta: -0.10,
    gamma: 0.005,
    vega: 0.05,
    theta: -0.12,
    volume: 24500,
    price: 0.35,
    bid: 0.33,
    ask: 0.37,
    t1: 0.31,
    p1: -10
  },
  {
    id: 'spx-7580-p',
    ticker: 'SPX',
    strike: 5480,
    isCall: false,
    health: 41,
    expectedMove: '-24.0%',
    action: 'SELL' as const,
    narrative: 'Extreme threshold crossover boundary triggers automatic institutional liquidation.',
    tagText: 'INVALIDATION',
    shelf: 'invalidation',
    delta: -0.32,
    gamma: 0.016,
    vega: 0.12,
    theta: -0.80,
    volume: 11040,
    price: 8.50,
    bid: 8.35,
    ask: 8.65,
    t1: 6.45,
    p1: -24
  },
  {
    id: 'spy-502-p',
    ticker: 'SPY',
    strike: 502,
    isCall: false,
    health: 45,
    expectedMove: '-18.5%',
    action: 'SELL' as const,
    narrative: 'Brushed beneath primary dealer put wall support. Hedging dynamics turned negative.',
    tagText: 'INVALIDATION',
    shelf: 'invalidation',
    delta: -0.28,
    gamma: 0.022,
    vega: 0.09,
    theta: -0.28,
    volume: 19105,
    price: 2.10,
    bid: 2.05,
    ask: 2.15,
    t1: 1.71,
    p1: -18
  },
  {
    id: 'qqq-438-p',
    ticker: 'QQQ',
    strike: 438,
    isCall: false,
    health: 49,
    expectedMove: '-14.0%',
    action: 'REDUCE' as const,
    narrative: 'Unwinds beneath crucial volume-weighted index pivot. Support levels dissolve.',
    tagText: 'INVALIDATION',
    shelf: 'invalidation',
    delta: -0.31,
    gamma: 0.028,
    vega: 0.12,
    theta: -0.38,
    volume: 14210,
    price: 3.15,
    bid: 3.10,
    ask: 3.20,
    t1: 2.70,
    p1: -14
  },
  {
    id: 'ndx-18100-p',
    ticker: 'NDX',
    strike: 18100,
    isCall: false,
    health: 38,
    expectedMove: '-32.5%',
    action: 'SELL' as const,
    narrative: 'System score degraded as gamma flip point triggers extreme margin sell hedging.',
    tagText: 'INVALIDATION',
    shelf: 'invalidation',
    delta: -0.36,
    gamma: 0.010,
    vega: 0.16,
    theta: -1.02,
    volume: 2901,
    price: 28.50,
    bid: 28.00,
    ask: 29.00,
    t1: 19.20,
    p1: -32
  },

  // SHELF: WHALE SWEEPS
  {
    id: 'spx-7700-c',
    ticker: 'SPX',
    strike: 5600,
    isCall: true,
    health: 94,
    expectedMove: '+62.4%',
    action: 'ENTER' as const,
    narrative: 'Block institutional trades sweep SPX 5600 strike, representing $14.2M notional.',
    tagText: 'WHALE',
    shelf: 'whale',
    delta: 0.35,
    gamma: 0.018,
    vega: 0.15,
    theta: -0.78,
    volume: 62400,
    price: 2.45,
    bid: 2.40,
    ask: 2.50,
    t1: 3.98,
    p1: 62
  },
  {
    id: 'ndx-18500-c',
    ticker: 'NDX',
    strike: 18500,
    isCall: true,
    health: 91,
    expectedMove: '+75.0%',
    action: 'ENTER' as const,
    narrative: 'Massive out-of-the-money block trade cluster. Aggressive bullish volatility positioning.',
    tagText: 'WHALE',
    shelf: 'whale',
    delta: 0.30,
    gamma: 0.010,
    vega: 0.17,
    theta: -1.08,
    volume: 11400,
    price: 8.90,
    bid: 8.70,
    ask: 9.10,
    t1: 15.55,
    p1: 75
  },
  {
    id: 'spy-520-c',
    ticker: 'SPY',
    strike: 520,
    isCall: true,
    health: 89,
    expectedMove: '+44.1%',
    action: 'ENTER' as const,
    narrative: 'Sweeps executed on Ask price consistently over the last 10 minutes. Bull run.',
    tagText: 'WHALE',
    shelf: 'whale',
    delta: 0.34,
    gamma: 0.031,
    vega: 0.11,
    theta: -0.40,
    volume: 92400,
    price: 1.15,
    bid: 1.12,
    ask: 1.18,
    t1: 1.65,
    p1: 44
  },
  {
    id: 'qqq-455-c',
    ticker: 'QQQ',
    strike: 455,
    isCall: true,
    health: 88,
    expectedMove: '+38.5%',
    action: 'ENTER' as const,
    narrative: 'Multimillion institutional block sweep targeting the upper resistance channel wall.',
    tagText: 'WHALE',
    shelf: 'whale',
    delta: 0.32,
    gamma: 0.033,
    vega: 0.13,
    theta: -0.52,
    volume: 51200,
    price: 1.45,
    bid: 1.41,
    ask: 1.49,
    t1: 2.01,
    p1: 38
  },
  {
    id: 'spx-7500-p',
    ticker: 'SPX',
    strike: 5400,
    isCall: false,
    health: 85,
    expectedMove: '+52.0%',
    action: 'HOLD' as const,
    narrative: 'Huge defensive protective put basket sweep ($22.4M notional hedge) detected.',
    tagText: 'WHALE',
    shelf: 'whale',
    delta: -0.19,
    gamma: 0.010,
    vega: 0.09,
    theta: -0.55,
    volume: 48900,
    price: 4.80,
    bid: 4.70,
    ask: 4.90,
    t1: 7.30,
    p1: 52
  },
  {
    id: 'ndx-17800-p',
    ticker: 'NDX',
    strike: 17800,
    isCall: false,
    health: 83,
    expectedMove: '+48.5%',
    action: 'HOLD' as const,
    narrative: 'Significant tail protection sweep blocks are locking up hedge positions at put wall.',
    tagText: 'WHALE',
    shelf: 'whale',
    delta: -0.15,
    gamma: 0.008,
    vega: 0.12,
    theta: -0.78,
    volume: 8520,
    price: 12.40,
    bid: 12.10,
    ask: 12.70,
    t1: 18.40,
    p1: 48
  }
];

// Seed initial historical feed logs
// Monotonic id source so prepended feed logs keep stable React keys (timestamps
// are only second-granularity and indices shift on every prepend).
let _feedLogSeq = 0;
const nextFeedLogId = () => `feedlog-${++_feedLogSeq}`;

const INITIAL_FEED_LOGS = [
  { id: nextFeedLogId(), timestamp: '01:34:25 PM', ticker: 'SPX', strike: 5520, type: 'C', side: 'Sweep', size: '280 cons', premium: '$151,200', tag: 'BULLISH', action: 'SWEPT @ ASK' },
  { id: nextFeedLogId(), timestamp: '01:34:10 PM', ticker: 'QQQ', strike: 448, type: 'C', side: 'Block', size: '1,200 cons', premium: '$504,000', tag: 'BULLISH', action: 'AT ASK' },
  { id: nextFeedLogId(), timestamp: '01:33:48 PM', ticker: 'NDX', strike: 18350, type: 'C', side: 'Block', size: '150 cons', premium: '$232,500', tag: 'BULLISH', action: 'ABOVE ASK' },
  { id: nextFeedLogId(), timestamp: '01:33:02 PM', ticker: 'SPY', strike: 508, type: 'P', side: 'Sweep', size: '2,500 cons', premium: '$337,500', tag: 'BEARISH', action: 'SWEPT @ ASK' },
  { id: nextFeedLogId(), timestamp: '01:31:55 PM', ticker: 'SPX', strike: 5600, type: 'C', side: 'Block', size: '3,000 cons', premium: '$735,000', tag: 'BULLISH', action: 'OFF-EXCHANGE' },
  { id: nextFeedLogId(), timestamp: '01:30:22 PM', ticker: 'NDX', strike: 17800, type: 'P', side: 'Sweep', size: '400 cons', premium: '$496,000', tag: 'HEDGE', action: 'SWEPT @ ASK' },
  { id: nextFeedLogId(), timestamp: '01:29:15 PM', ticker: 'SPY', strike: 515, type: 'C', side: 'Sweep', size: '1,800 cons', premium: '$576,000', tag: 'BULLISH', action: 'SWEPT @ ASK' },
  { id: nextFeedLogId(), timestamp: '01:28:40 PM', ticker: 'QQQ', strike: 455, type: 'C', side: 'Sweep', size: '2,400 cons', premium: '$348,000', tag: 'BULLISH', action: 'ABOVE ASK' }
];

// ── Redesign helpers ─────────────────────────────────────────────────────────
// Short human strategy label per scanner shelf (the SETUP column / inspector idea).
const SETUP_LABEL: Record<string, string> = {
  conviction: 'Conviction',
  improved: 'Momentum',
  mispriced: 'Value Gap',
  invalidation: 'Rebound',
  whale: 'Block Sweep',
};
// Expiry horizon bucket derived from each shelf's stated trade horizon (SHELF_EXPLANATIONS).
// Not fabricated — it maps the existing horizon metadata onto a 0DTE/1D/3D bucket so the
// Expiry filter is a real, functional filter over the ranked setups.
const SHELF_EXPIRY: Record<string, '0DTE' | '1D' | '3D'> = {
  improved: '0DTE',
  invalidation: '0DTE',
  mispriced: '1D',
  whale: '1D',
  conviction: '3D',
};
const STRATEGY_OPTS: { value: string; label: string }[] = [
  { value: 'all', label: 'All strategies' },
  { value: 'conviction', label: 'Conviction' },
  { value: 'improved', label: 'Momentum' },
  { value: 'mispriced', label: 'Value gap' },
  { value: 'invalidation', label: 'Rebound / risk' },
  { value: 'whale', label: 'Block sweep' },
];
const UNIVERSE_OPTS = ['All', 'SPX', 'NDX', 'QQQ', 'SPY', 'RUT'];
const EXPIRY_OPTS = ['All', '0DTE', '1D', '3D'];
const CONF_OPTS = [
  { value: '0', label: 'Any' },
  { value: '80', label: '80%+' },
  { value: '85', label: '85%+' },
  { value: '90', label: '90%+' },
];
const MOVE_OPTS = [
  { value: '0', label: 'Any' },
  { value: '20', label: '±20%+' },
  { value: '30', label: '±30%+' },
  { value: '40', label: '±40%+' },
  { value: '50', label: '±50%+' },
];

/** Working-stop assumption (disciplined −50% premium stop) used to express R/R honestly. */
const WORKING_STOP_PCT = 50;
/** Reward-to-risk from the setup's own projected target vs the working stop. Null when non-positive. */
function computeRR(s: DerivedSetup): number | null {
  const price = s.premium;
  const t1 = s.c.t1;
  const rewardPct = typeof t1 === 'number' && t1 > 0 && price > 0
    ? ((t1 - price) / price) * 100
    : s.expectedMovePct;
  if (!isFinite(rewardPct) || rewardPct <= 0) return null;
  return rewardPct / WORKING_STOP_PCT;
}

/** Status chip from the setup score (ACTIVE ≥90 / WATCH ≥80 / MONITOR below). */
function statusMeta(health: number): { label: string; tone: BadgeTone } {
  if (health >= 90) return { label: 'Active', tone: 'positive' };
  if (health >= 80) return { label: 'Watch', tone: 'warning' };
  return { label: 'Monitor', tone: 'neutral' };
}

/** A compact confidence/probability bar with a trailing % value. */
function MeterBar({ pct, tone = 'var(--pin)', showValue = true }: { pct: number; tone?: string; showValue?: boolean }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <span className="inline-flex items-center gap-2 w-full">
      <span className="relative h-1.5 flex-1 min-w-[36px] rounded-full bg-[var(--border-subtle)] overflow-hidden">
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${w}%`, background: tone }} />
      </span>
      {showValue && <span className="slayer-num text-[11px] font-semibold tabular-nums" style={{ color: tone }}>{w.toFixed(0)}%</span>}
    </span>
  );
}

/** Confidence tier colour — distinct bands so a 95 clearly outreads an 86 at a glance. */
function confColor(health: number): string {
  if (health >= 90) return '#2f9d45';        // top tier — high conviction
  if (health >= 85) return 'var(--warning)'; // upper-mid
  if (health >= 80) return 'var(--pin)';     // mid
  return 'var(--text-muted)';                // low / risk
}

/**
 * Confidence bar for the ranked table. The fill is normalised across the meaningful
 * 60–100 conviction band (not raw 0–100) so quality differences read at a glance —
 * a 95 renders clearly longer than an 86 — while the trailing label stays the true
 * score and the tiered colour reinforces rank.
 */
function ConfidenceBar({ health }: { health: number }) {
  const color = confColor(health);
  const fill = Math.max(5, Math.min(100, ((health - 60) / 40) * 100));
  return (
    <span className="inline-flex items-center gap-2 w-full">
      <span className="relative h-1.5 flex-1 min-w-[36px] rounded-full bg-[var(--border-subtle)] overflow-hidden">
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${fill}%`, background: color }} />
      </span>
      <span className="slayer-num text-[11px] font-semibold tabular-nums" style={{ color }}>{health.toFixed(0)}%</span>
    </span>
  );
}

/** A labeled meter row for the inspector (Probability / Confidence). */
function LabeledMeter({ label, pct, tone }: { label: string; pct: number; tone: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
        <span>{label}</span>
        <span className="slayer-num font-semibold" style={{ color: tone }}>{Math.round(pct)}%</span>
      </div>
      <div className="mt-1"><MeterBar pct={pct} tone={tone} showValue={false} /></div>
    </div>
  );
}

/** A native SVG donut built from real counts — no chart lib, brand-toned. */
function Donut({ segments, size = 116, thickness = 15 }: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" role="img" aria-label="Setup bias distribution">
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-subtle)" strokeWidth={thickness} />
        {total > 0 && segments.map((s) => {
          const len = (s.value / total) * C;
          const el = (
            <circle key={s.label} cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={s.color} strokeWidth={thickness}
              strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} />
          );
          acc += len;
          return el;
        })}
      </g>
      <text x="50%" y="46%" textAnchor="middle" dominantBaseline="central"
        className="slayer-num" style={{ fill: 'var(--text-primary)', fontSize: 22, fontWeight: 700 }}>{total}</text>
      <text x="50%" y="62%" textAnchor="middle" dominantBaseline="central"
        style={{ fill: 'var(--text-muted)', fontSize: 8, letterSpacing: '0.14em' }}>SETUPS</text>
    </svg>
  );
}

/** Styled native <select> on the shared .slayer-control chrome. */
function FilterSelect({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="slayer-control slayer-num cursor-pointer focus:outline-none focus-visible:border-[var(--border-strong)]"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function DiscoveryView({
  systemScore,
  discovery,
  onSelectContract
}: DiscoveryViewProps) {
  const [contracts, setContracts] = useState(INITIAL_CONTRACTS);
  const [activeShelf, setActiveShelf] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Redesign filter state — each maps to a real field on the ranked setups.
  // Hydrated from the saved view (Save View writes this key) so saving actually
  // round-trips; falls back to defaults on first visit / bad data.
  const savedView = useMemo(() => {
    try {
      const raw = localStorage.getItem('slayer.skyvision.view.v1');
      return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }, []);
  const str = (v: unknown, fb: string) => (typeof v === 'string' ? v : fb);
  const [universe, setUniverse] = useState<string>(() => str(savedView?.universe, 'All'));
  const [expiryFilter, setExpiryFilter] = useState<string>(() => str(savedView?.expiryFilter, 'All'));
  const [minConfidence, setMinConfidence] = useState<string>(() => str(savedView?.minConfidence, '0'));
  const [minExpMove, setMinExpMove] = useState<string>(() => str(savedView?.minExpMove, '0'));
  const [optionTypeFilter, setOptionTypeFilter] = useState<'all' | 'calls' | 'puts'>(() => {
    const v = savedView?.optionTypeFilter;
    return v === 'calls' || v === 'puts' ? v : 'all';
  });
  // activeShelf/searchQuery are declared above the saved-view memo, so restore
  // them once on mount to complete the round-trip.
  useEffect(() => {
    if (!savedView) return;
    if (typeof savedView.activeShelf === 'string') setActiveShelf(savedView.activeShelf);
    if (typeof savedView.searchQuery === 'string') setSearchQuery(savedView.searchQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Opportunities pagination — 15/page like the render, so the bottom row stays in view.
  const [oppPage, setOppPage] = useState(1);
  const OPP_PER_PAGE = 15;
  // Snap back to page 1 whenever any filter narrows/widens the ranked list, so a
  // deep page never goes stale against a different result set.
  useEffect(() => {
    setOppPage(1);
  }, [universe, activeShelf, expiryFilter, minConfidence, minExpMove, optionTypeFilter, searchQuery]);

  // Watchlist / Queue rail
  const [watchQueueTab, setWatchQueueTab] = useState<'watchlist' | 'queue'>('queue');
  const [watchlist, setWatchlist] = useState<string[]>(() => loadWatchlist());
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Real tracked-setups store (the queue + track/queue handlers).
  const trackingSetups = useTrackingStore(s => s.setups);
  const track = useTrackingStore(s => s.track);
  const cancelTrack = useTrackingStore(s => s.cancel);
  const [feedLogs, setFeedLogs] = useState(INITIAL_FEED_LOGS);
  // True when the sample discovery SSE stream drops; surfaced as a subtle
  // "reconnecting" chip on the tape (the browser EventSource auto-reconnects).
  const [feedError, setFeedError] = useState(false);
  const [lastFlashingId, setLastFlashingId] = useState<string | null>(null);

  // Strategy Manual & target logic reasons dictionary (explanations in simple words why they are the best).
  // Collapsed by default per the redesign — education must not dominate the scanner page.
  const [isStrategyExpanded, setIsStrategyExpanded] = useState(false);
  // The row the right-rail inspector describes; defaults to the top-ranked setup.
  const [selectedSetupId, setSelectedSetupId] = useState<string | null>(null);
  const [isMockScanning, setIsMockScanning] = useState(false);
  const [lastScanMessage, setLastScanMessage] = useState('Ready. Scan complete.');
  const [scanHistoryCount, setScanHistoryCount] = useState(0);

  const SHELF_EXPLANATIONS = {
    conviction: {
      title: "Core Conviction Setups (High Probability Positions)",
      whyItsBest: "Setups supported by concentrated dealer buy walls where market makers are positioned to defend price — strong support, but not a guarantee; all options carry risk.",
      horizon: "1 TO 3 DAYS (SWING)",
      mathTracking: "Strong dealer buy-walls sitting under price",
      confidenceTier: "Model confidence: Very High"
    },
    improved: {
      title: "High Velocity Breakouts (Quick Scalp Trades)",
      whyItsBest: "Momentum setups with rapidly accelerating volume. Useful for quick day trading (scalping): derivative volumes are speeding up in the last 15 minutes as buyers sweep options at the ask, which can force dealers to cover their shorts and drive price up.",
      horizon: "15 MIN TO 3 HOURS (SCALP)",
      mathTracking: "Fast volume and momentum building",
      confidenceTier: "Model confidence: High"
    },
    mispriced: {
      title: "Mathematical Arbitrage (Option Premium Discounts)",
      whyItsBest: "These are deep value opportunities where options are priced exceptionally cheap. They are 'the best' because temporary implied volatility drops have created a price mismatch: active brokers are selling these contracts at a -15% discount compared to their true mathematical value. Enter cheap, exit under normal curves.",
      horizon: "2 HOURS TO 1 DAY (VALUE)",
      mathTracking: "Option priced below fair value",
      confidenceTier: "Model confidence: Solid"
    },
    invalidation: {
      title: "Support Rebounds & Boundaries (Trades Coming Back)",
      whyItsBest: "These are options hovering right at critical line-in-the-sand support thresholds. They are 'the best' for reversals because they are 'coming back' to key support lines (put walls), offering a highly defined bounce-back entry with tight, predefined stop-losses.",
      horizon: "30 MIN TO 2 HOURS (BOUNCE)",
      mathTracking: "Bouncing off dealer put-wall support",
      confidenceTier: "Model confidence: Speculative"
    },
    whale: {
      title: "Institutional Block Sweeps",
      whyItsBest: "Large institutional block orders executing at the ask, following concentrated directional flow from major market participants.",
      horizon: "1 HOUR TO 2 DAYS (SWING)",
      mathTracking: "$5M+ block trades hitting the tape",
      confidenceTier: "Model confidence: High"
    },
    all: {
      title: "All Discovered Signals (Unified Market Catalog)",
      whyItsBest: "A unified look across the entire option spectrum under scanning supervision. Use this tab to compare all categories side-by-side, sorted from the absolute strongest active model ratings to the weakest.",
      horizon: "Dependent on Selection",
      mathTracking: "All signals combined",
      confidenceTier: "All setups"
    }
  };

  // Stats tickers that change slightly
  const [globalGex, setGlobalGex] = useState(485.4);
  const [scanRate, setScanRate] = useState(14.8);
  // Wall-clock of the last sample-metric tick, shown as an "as of" caption so the
  // illustrative readouts carry a freshness cue (consistent with the SAMPLE label).
  const [metricsAsOf, setMetricsAsOf] = useState<number>(() => Date.now());

  // Subscribe to the backend discovery SSE stream. NOTE: this stream currently
  // carries the SAMPLE seed rows with light server-side jitter — it does not read
  // the live option chain/flows — so the view presents it as sample/demo data.
  useEffect(() => {
    const url = '/api/stream/discovery';
    const eventSource = new EventSource(url);
    const flashTimers: ReturnType<typeof setTimeout>[] = [];

    eventSource.onopen = () => {
      // A successful (re)connection clears any prior error chip.
      setFeedError(false);
    };

    eventSource.onmessage = (event) => {
      try {
        // Any delivered message means the stream is healthy again.
        setFeedError(false);
        const data = JSON.parse(event.data);
        if (data.contracts) setContracts(data.contracts);
        if (data.feedLogs) setFeedLogs(data.feedLogs);
        if (typeof data.globalGex === 'number') setGlobalGex(data.globalGex);
        if (typeof data.scanRate === 'number') setScanRate(data.scanRate);
        if (typeof data.brierScore === 'number' || typeof data.globalGex === 'number' || typeof data.scanRate === 'number') {
          setMetricsAsOf(Date.now());
        }
        if (data.lastFlashingId) {
          setLastFlashingId(data.lastFlashingId);
          flashTimers.push(setTimeout(() => setLastFlashingId(null), 700));
        }
      } catch (err) {
        console.error('[SkyVision Discovery Client] Error parsing SSE Stream', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('[SkyVision Discovery Client] EventSource Error', err);
      // Surface a subtle reconnecting state without tearing down the pipeline —
      // EventSource reconnects on its own; onopen/onmessage will clear this.
      setFeedError(true);
    };

    return () => {
      eventSource.close();
      flashTimers.forEach(clearTimeout);
    };
  }, []);

  // SAMPLE animation only: gently jitters the demo tile prices so the illustrative
  // layout isn't perfectly static. This is NOT a live market feed — it runs purely
  // on the SAMPLE seed rows and is presented under the view's "SAMPLE DATA" label.
  useEffect(() => {
    if (!autoRefresh) return;
    const flashTimers: ReturnType<typeof setTimeout>[] = [];
    const tickInterval = setInterval(() => {
      // Compute purely inside the updater; collect the flash side-effect to run AFTER.
      let flashedId: any = null;
      setContracts(prev => {
        return prev.map(c => {
          // 8% chance of tick fluctuation on any option premium row
          if (Math.random() > 0.92) {
            const isUp = Math.random() > 0.48;
            const deviation = Number((Math.random() * 0.05 + 0.01).toFixed(2));
            const newPrice = isUp ? c.price + deviation : c.price - deviation;
            const nextPrice = Math.max(0.15, Number(newPrice.toFixed(2)));
            const bidDev = isUp ? c.bid + (deviation * 0.9) : c.bid - (deviation * 0.9);
            const askDev = isUp ? c.ask + (deviation * 1.1) : c.ask - (deviation * 1.1);

            flashedId = c.id;

            return {
              ...c,
              price: nextPrice,
              bid: Math.max(0.10, Number(bidDev.toFixed(2))),
              ask: Math.max(0.20, Number(askDev.toFixed(2)))
            };
          }
          return c;
        });
      });
      // Side effects OUTSIDE the reducer — avoids duplicate timers/state under
      // StrictMode/concurrent rendering (the updater can run twice).
      if (flashedId) {
        setLastFlashingId(flashedId);
        flashTimers.push(setTimeout(() => setLastFlashingId(null), 600));
      }
    }, 2800);

    return () => { clearInterval(tickInterval); flashTimers.forEach(clearTimeout); };
  }, [autoRefresh]);

  // Manual scan refresh: re-ticks local contract premiums and appends a fresh
  // tape entry. Server-streamed metrics (GEX / accuracy / scan-rate) are left
  // untouched — they update on their own via the discovery SSE stream.
  const triggerManualScannerRefresh = () => {
    if (isMockScanning) return;
    setIsMockScanning(true);
    setLastScanMessage('Running a fresh scan...');

    setTimeout(() => {
      let scannedCount = 0;
      setContracts(prev => {
        scannedCount = prev.length;
        return prev.map(c => {
          const shiftPercent = 1 + (Math.random() * 0.04 - 0.02); // +/-2%
          const newPrice = Math.max(0.15, Number((c.price * shiftPercent).toFixed(2)));
          return {
            ...c,
            price: newPrice,
            bid: Math.max(0.10, Number((newPrice * 0.98).toFixed(2))),
            ask: Math.max(0.20, Number((newPrice * 1.02).toFixed(2)))
          };
        });
      });

      // Insert fresh scalp feed log to show raw activity across the full launch universe.
      const randomAsset = ASSET_LIST[Math.floor(Math.random() * ASSET_LIST.length)];
      const randomTicker = randomAsset.ticker;
      const feedStep = randomAsset.defaultPrice > 1000 ? 50 : randomAsset.defaultPrice > 150 ? 5 : 1;
      const randomStrike = Math.round(randomAsset.defaultPrice / feedStep) * feedStep;
      const randomIsBullish = Math.random() > 0.4;
      const timestampLabel = formatTime(new Date());

      const newLog = {
        id: nextFeedLogId(),
        timestamp: timestampLabel,
        ticker: randomTicker,
        strike: randomStrike,
        type: randomIsBullish ? 'C' : 'P',
        side: Math.random() > 0.5 ? 'Sweep' : 'Block',
        size: `${Math.floor(Math.random() * 1500 + 400)} cons`,
        premium: `$${((Math.floor(Math.random() * 400 + 100)) * 1000).toLocaleString()}`,
        tag: randomIsBullish ? 'BULLISH' : 'HEDGE',
        action: randomIsBullish ? 'SWEPT @ ASK' : 'AT BID'
      };

      setFeedLogs(prev => [newLog, ...prev.slice(0, 11)]);
      setIsMockScanning(false);
      setScanHistoryCount(prev => prev + 1);
      setLastScanMessage(`Scan complete. ${scannedCount} contracts re-priced.`);
    }, 1000);
  };

  // Combined filtering — every predicate maps to a real field on the sample setup rows.
  const minConf = Number(minConfidence) || 0;
  const minMove = Number(minExpMove) || 0;
  const filteredContracts = useMemo(() => {
    return contracts.filter(c => {
      // Strategy (shelf)
      if (activeShelf !== 'all' && c.shelf !== activeShelf) return false;
      // Universe (ticker)
      if (universe !== 'All' && c.ticker !== universe) return false;
      // Bias (call / put)
      if (optionTypeFilter === 'calls' && !c.isCall) return false;
      if (optionTypeFilter === 'puts' && c.isCall) return false;
      // Expiry bucket (derived from the shelf's stated horizon)
      if (expiryFilter !== 'All' && SHELF_EXPIRY[c.shelf] !== expiryFilter) return false;
      // Min confidence (health score)
      if (minConf > 0 && c.health < minConf) return false;
      // Min expected move (magnitude of the expectedMove field)
      if (minMove > 0) {
        const mv = Math.abs(parseFloat(String(c.expectedMove).replace(/[^0-9.\-]/g, ''))) || 0;
        if (mv < minMove) return false;
      }
      // Symbol / strike search
      if (searchQuery.trim().length > 0) {
        const query = searchQuery.toUpperCase().trim();
        const matchesTicker = c.ticker.includes(query);
        const matchesStrike = String(c.strike).includes(query);
        const matchesType = (query === 'C' || query === 'CALL') ? c.isCall : (query === 'P' || query === 'PUT') ? !c.isCall : false;
        return matchesTicker || matchesStrike || matchesType;
      }
      return true;
    });
  }, [contracts, activeShelf, universe, optionTypeFilter, expiryFilter, minConf, minMove, searchQuery]);

  const currentManualText = SHELF_EXPLANATIONS[activeShelf as keyof typeof SHELF_EXPLANATIONS] ?? SHELF_EXPLANATIONS.all;
  const activeTicker = useContractStore(s => s.selectedAsset.ticker);

  // Ranked queue: filtered setups sorted strongest-first, enriched with display fields.
  const rankedSetups = useMemo(
    () => [...filteredContracts]
      .sort((a, b) => b.health - a.health)
      .map(c => deriveSetup(c as ScannerContract)),
    [filteredContracts],
  );
  const selectedSetup = useMemo(
    () => rankedSetups.find(s => s.c.id === selectedSetupId) ?? rankedSetups[0] ?? null,
    [rankedSetups, selectedSetupId],
  );
  // Paginate the ranked table (15/page) — clamp the page so filter changes never strand it.
  const oppTotalPages = Math.max(1, Math.ceil(rankedSetups.length / OPP_PER_PAGE));
  const oppSafePage = Math.min(oppPage, oppTotalPages);
  const oppStart = (oppSafePage - 1) * OPP_PER_PAGE;
  const pagedSetups = rankedSetups.slice(oppStart, oppStart + OPP_PER_PAGE);
  // "Trade This Setup" / "Review" routes the contract into the SkyVision detail page.
  const reviewSetup = (s: { c: ScannerContract; side: 'C' | 'P' }) => {
    const asset = ASSET_LIST.find(a => a.ticker === s.c.ticker);
    if (asset) onSelectContract(asset, s.c.strike, s.side === 'C');
  };

  // ── MARKET REGIME (derived from the real ranked setups + tape) ───────────────
  const regime = useMemo(() => {
    const n = rankedSetups.length;
    const bullish = rankedSetups.filter(s => s.direction === 'BULLISH').length;
    const bearish = rankedSetups.filter(s => s.direction === 'BEARISH').length;
    const callCount = rankedSetups.filter(s => s.side === 'C').length;
    const putCount = rankedSetups.filter(s => s.side === 'P').length;
    const avgMove = n ? rankedSetups.reduce((a, s) => a + s.expectedMovePct, 0) / n : 0;
    const liq = { Tight: 0, Fair: 0, Wide: 0 };
    rankedSetups.forEach(s => { liq[s.liquidity] += 1; });
    const liqOrder: DerivedSetup['liquidity'][] = ['Tight', 'Fair', 'Wide'];
    const majorityLiq = liqOrder.reduce((a, b) => (liq[b] > liq[a] ? b : a), 'Tight');
    // Tape bias from the sample flow tape (parse formatted premiums).
    const parseP = (p: string) => Number(String(p).replace(/[^0-9.]/g, '')) || 0;
    let bull$ = 0, hedge$ = 0;
    for (const l of feedLogs) { if (l.tag === 'BULLISH') bull$ += parseP(l.premium); else hedge$ += parseP(l.premium); }
    const tape = bull$ > hedge$ * 1.15 ? { label: 'Net Buying', tone: 'positive' as BadgeTone }
      : hedge$ > bull$ * 1.15 ? { label: 'Hedging', tone: 'negative' as BadgeTone }
        : { label: 'Balanced', tone: 'neutral' as BadgeTone };
    const trend = bullish > bearish ? { label: 'Bullish', tone: 'positive' as BadgeTone }
      : bearish > bullish ? { label: 'Bearish', tone: 'negative' as BadgeTone }
        : { label: 'Mixed', tone: 'neutral' as BadgeTone };
    const vol = avgMove >= 40 ? { label: 'Elevated', tone: 'warning' as BadgeTone }
      : avgMove >= 25 ? { label: 'Active', tone: 'neutral' as BadgeTone }
        : { label: 'Compressed', tone: 'positive' as BadgeTone };
    const liqState: { label: string; tone: BadgeTone } =
      majorityLiq === 'Tight' ? { label: 'Tight', tone: 'positive' }
        : majorityLiq === 'Wide' ? { label: 'Wide', tone: 'negative' }
          : { label: 'Fair', tone: 'warning' };
    const pcRatio = callCount > 0 ? putCount / callCount : 0;
    const insight = n === 0
      ? 'No setups match the current filters — widen the universe, strategy, or thresholds.'
      : `${bullish} of ${n} ranked setups lean bullish · tape reads ${tape.label.toLowerCase()} · average expected move ±${avgMove.toFixed(0)}% · ${majorityLiq.toLowerCase()} liquidity dominates.`;
    return { n, bullish, bearish, callCount, putCount, avgMove, trend, tape, vol, liqState, pcRatio, insight };
  }, [rankedSetups, feedLogs]);

  // ── SETUP DISTRIBUTION (bias donut + by-strategy bars) ───────────────────────
  const distribution = useMemo(() => {
    const bull = rankedSetups.filter(s => s.direction === 'BULLISH' && s.c.shelf !== 'mispriced').length;
    const bear = rankedSetups.filter(s => s.direction === 'BEARISH' && s.c.shelf !== 'mispriced').length;
    const neutral = rankedSetups.filter(s => s.c.shelf === 'mispriced').length;
    const segments = [
      { label: 'Bullish', value: bull, color: '#2f9d45' },
      { label: 'Bearish', value: bear, color: '#d94646' },
      { label: 'Neutral', value: neutral, color: 'var(--pin)' },
    ];
    const byStrategy: { label: string; value: number }[] = [];
    for (const shelf of ['conviction', 'improved', 'mispriced', 'invalidation', 'whale']) {
      const count = rankedSetups.filter(s => s.c.shelf === shelf).length;
      if (count > 0) byStrategy.push({ label: SETUP_LABEL[shelf] ?? shelf, value: count });
    }
    byStrategy.sort((a, b) => b.value - a.value);
    const maxStrategy = byStrategy.reduce((m, s) => Math.max(m, s.value), 0);
    return { segments, byStrategy, maxStrategy };
  }, [rankedSetups]);

  // ── WATCHLIST / QUEUE (real watchlist tickers + real tracked setups) ─────────
  const queueRows = useMemo(
    () => trackingSetups.filter(s => !isTerminal(s.status)),
    [trackingSetups],
  );
  const watchlistRows = useMemo(
    () => rankedSetups.filter(s => watchlist.includes(s.c.ticker)),
    [rankedSetups, watchlist],
  );

  // Is the selected setup already in the queue (a live tracked record)?
  const selectedTracked = useMemo(() => {
    if (!selectedSetup) return false;
    const key = setupKey({ ticker: selectedSetup.c.ticker, strike: selectedSetup.c.strike, optionType: selectedSetup.side, kind: 'contract' });
    return trackingSetups.some(t => !isTerminal(t.status) && setupKey(t) === key);
  }, [selectedSetup, trackingSetups]);

  // ── Actions ──────────────────────────────────────────────────────────────────
  const addToQueue = (s: DerivedSetup) => {
    const asset = ASSET_LIST.find(a => a.ticker === s.c.ticker);
    const spot = asset?.defaultPrice ?? s.c.strike;
    const res = track({
      source: 'skyvision', kind: 'contract', dataMode: 'sample',
      ticker: s.c.ticker, contract: s.label, direction: s.direction, strike: s.c.strike,
      expiry: SHELF_EXPIRY[s.c.shelf] ?? '0DTE', optionType: s.side, setupScore: s.c.health, confidence: s.c.health,
      premiumAtTrack: s.premium, spotAtTrack: spot, fairValue: s.fairValue,
      expectedMovePct: s.expectedMovePct, invalidationLevel: s.invalidation,
      dealerReason: s.dealerSupport, volatilityReason: `Expected move ±${s.expectedMovePct.toFixed(0)}%`,
      liquidityGrade: s.liquidity, entryDelta: s.c.delta, entryThetaPerDay: s.c.theta, dteDays: 0,
    }, Date.now());
    toast[res.duplicate ? 'info' : 'success'](res.duplicate ? 'Already in queue' : 'Added to queue', {
      description: res.duplicate ? 'It’s in Trade History (Sample track).' : `${s.label} · Sample track · in Trade History`,
    });
    setWatchQueueTab('queue');
  };

  const toggleStar = (ticker: string) => {
    setWatchlist(prev => { const next = toggleWatch(prev, ticker); saveWatchlist(next); return next; });
  };

  const saveView = () => {
    try {
      localStorage.setItem('slayer.skyvision.view.v1', JSON.stringify({
        universe, activeShelf, expiryFilter, minConfidence, minExpMove, optionTypeFilter, searchQuery,
      }));
      toast.success('View saved', { description: 'Your scanner filters are stored on this device.' });
    } catch {
      toast.error('Could not save view', { description: 'Local storage is unavailable in this context.' });
    }
  };

  const clearFilters = () => {
    setActiveShelf('all'); setUniverse('All'); setExpiryFilter('All');
    setMinConfidence('0'); setMinExpMove('0'); setOptionTypeFilter('all'); setSearchQuery('');
  };

  return (
    <div className="w-full flex flex-col gap-4 font-mono text-[var(--text-secondary)] antialiased pb-10">

      {/* HEADER — title · context · data-state · method · refresh */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Target className="w-4 h-4 text-[#2f9d45] shrink-0" />
          <div className="min-w-0">
            <h1 className="slayer-title truncate">SkyVision <span className="text-[var(--text-muted)]">· Options Scanner</span></h1>
            <p className="mt-0.5 truncate text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
              {activeTicker} · 0DTE / 1D / 3D · Updated {formatTime(new Date(metricsAsOf))}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DataStateBadge state="sample" title="Demo data. Live scan requires a connected market feed." />
          {/* Scan-activity state (never claims "Live" — the data-state badge owns data provenance). */}
          <StatusBadge tone={feedError ? 'warning' : 'neutral'} dot>
            {isMockScanning ? 'Scanning' : feedError ? 'Reconnecting' : 'Idle'}
          </StatusBadge>
          <button
            onClick={() => setIsStrategyExpanded(true)}
            aria-label="How this scan works"
            className="slayer-control inline-flex items-center gap-1.5 font-semibold uppercase tracking-[0.12em] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
          >
            <Info className="w-3.5 h-3.5" />Method
          </button>
          <button
            onClick={triggerManualScannerRefresh}
            disabled={isMockScanning}
            aria-label="Refresh scan"
            className="slayer-control inline-flex items-center gap-1.5 font-semibold uppercase tracking-[0.12em] text-[var(--text-primary)] hover:border-[var(--border-strong)] disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isMockScanning ? 'animate-spin text-[#2f9d45]' : ''}`} />
            {isMockScanning ? 'Scanning…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* TOP FILTER BAR */}
      <section className="slayer-panel p-3">
        <div className="flex flex-wrap items-end gap-2.5">
          <FilterSelect label="Universe" value={universe} onChange={setUniverse} options={UNIVERSE_OPTS.map(u => ({ value: u, label: u === 'All' ? 'All indices' : u }))} />
          <FilterSelect label="Strategy" value={activeShelf} onChange={setActiveShelf} options={STRATEGY_OPTS} />
          <FilterSelect label="Expiry" value={expiryFilter} onChange={setExpiryFilter} options={EXPIRY_OPTS.map(e => ({ value: e, label: e === 'All' ? 'All expiries' : e }))} />
          <FilterSelect label="Bias" value={optionTypeFilter} onChange={(v) => setOptionTypeFilter(v as 'all' | 'calls' | 'puts')} options={[{ value: 'all', label: 'All' }, { value: 'calls', label: 'Calls' }, { value: 'puts', label: 'Puts' }]} />
          <FilterSelect label="Min Confidence" value={minConfidence} onChange={setMinConfidence} options={CONF_OPTS} />
          <FilterSelect label="Min Exp Move" value={minExpMove} onChange={setMinExpMove} options={MOVE_OPTS} />
          <label className="flex flex-1 min-w-[150px] flex-col gap-1">
            <span className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Symbol</span>
            <span className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-faint)]" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ticker or strike…"
                aria-label="Filter by ticker or strike"
                className="slayer-control slayer-num w-full !pl-8 uppercase placeholder:text-[var(--text-faint)]"
              />
            </span>
          </label>
          <button
            onClick={saveView}
            className="slayer-control inline-flex items-center gap-1.5 self-end font-semibold uppercase tracking-[0.12em] text-[var(--text-primary)] hover:border-[var(--border-strong)]"
          >
            <Save className="h-3.5 w-3.5" />Save View
          </button>
        </div>
      </section>

      {/* MAIN — opportunities table + selected-setup inspector */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_360px]">

        {/* LEFT: OPPORTUNITIES */}
        <TerminalPanel
          title={`Opportunities (${rankedSetups.length})`}
          subtitle="Ranked setups · strongest first"
          bodyClassName="!p-0"
          footer={rankedSetups.length > OPP_PER_PAGE ? (
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
              <span className="slayer-num">
                {oppStart + 1}–{Math.min(oppStart + OPP_PER_PAGE, rankedSetups.length)} of {rankedSetups.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setOppPage(Math.max(1, oppSafePage - 1))}
                  disabled={oppSafePage <= 1}
                  className="slayer-control px-2 py-0.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  aria-label="Previous page"
                >‹</button>
                {Array.from({ length: oppTotalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setOppPage(p)}
                    aria-current={p === oppSafePage}
                    className={`slayer-control slayer-num px-2 py-0.5 cursor-pointer ${p === oppSafePage ? 'border-[var(--border-strong)] bg-[var(--bg-panel-raised)] text-[var(--text-primary)]' : ''}`}
                  >{p}</button>
                ))}
                <button
                  type="button"
                  onClick={() => setOppPage(Math.min(oppTotalPages, oppSafePage + 1))}
                  disabled={oppSafePage >= oppTotalPages}
                  className="slayer-control px-2 py-0.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  aria-label="Next page"
                >›</button>
              </div>
            </div>
          ) : undefined}
        >
          <DataTable<DerivedSetup>
            rows={pagedSetups}
            rowKey={(s) => s.c.id}
            onRowClick={(s) => setSelectedSetupId(s.c.id)}
            rowClassName={(s) => {
              const isSelected = selectedSetup?.c.id === s.c.id;
              return [
                isSelected
                  ? '[&>td]:bg-[var(--bg-panel-raised)] [&>td:first-child]:shadow-[inset_3px_0_0_0_var(--pin)] [&>td:first-child]:!text-[var(--text-primary)]'
                  : '',
                !isSelected && lastFlashingId === s.c.id ? '[&>td]:bg-[rgba(248,248,255,0.05)]' : '',
              ].filter(Boolean).join(' ');
            }}
            empty={(
              <div className="flex flex-col items-center gap-2 py-6">
                <Crosshair className="h-5 w-5 text-[var(--text-faint)]" aria-hidden="true" />
                <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">No setups match your filters</span>
                <button onClick={clearFilters} className="slayer-control text-[10px] font-semibold uppercase tracking-[0.12em] hover:border-[var(--border-strong)]">Clear filters</button>
              </div>
            )}
            columns={[
              { key: 'rank', header: '#', align: 'left', className: 'w-[40px] text-[var(--text-faint)]', render: (_s, i) => <span className="slayer-num">{oppStart + i + 1}</span> },
              {
                key: 'symbol', header: 'Symbol', render: (s) => (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleStar(s.c.ticker); }}
                      aria-label={watchlist.includes(s.c.ticker) ? `Unwatch ${s.c.ticker}` : `Watch ${s.c.ticker}`}
                      className="shrink-0 text-[var(--text-faint)] transition-colors hover:text-[var(--warning)]"
                    >
                      <Star className="h-3 w-3" fill={watchlist.includes(s.c.ticker) ? 'var(--warning)' : 'none'} stroke={watchlist.includes(s.c.ticker) ? 'var(--warning)' : 'currentColor'} />
                    </button>
                    <span className="leading-tight">
                      <span className="block font-semibold text-[var(--text-primary)]">{s.c.ticker}</span>
                      <span className="block slayer-num text-[10px] text-[var(--text-muted)]">{fmtNum(s.c.strike)}{s.side}</span>
                    </span>
                  </div>
                )
              },
              { key: 'setup', header: 'Setup', render: (s) => <span className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-secondary)]">{SETUP_LABEL[s.c.shelf] ?? s.c.shelf}</span> },
              {
                key: 'bias', header: 'Bias', render: (s) => (
                  <span className={`inline-flex items-center gap-1 font-semibold ${s.direction === 'BULLISH' ? 'text-[#2f9d45]' : 'text-[#d94646]'}`}>
                    {s.direction === 'BULLISH' ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {s.direction === 'BULLISH' ? 'Bull' : 'Bear'}
                  </span>
                )
              },
              { key: 'conf', header: 'Confidence', className: 'min-w-[124px]', render: (s) => <ConfidenceBar health={s.c.health} /> },
              { key: 'move', header: 'Exp Move', align: 'right', render: (s) => <span className="slayer-num text-[var(--pin)]">±{s.expectedMovePct.toFixed(0)}%</span> },
              { key: 'rr', header: 'R/R', align: 'right', render: (s) => { const rr = computeRR(s); return <span className="slayer-num text-[var(--text-primary)]">{rr == null ? '—' : `${rr.toFixed(1)}:1`}</span>; } },
              { key: 'status', header: 'Status', align: 'right', render: (s) => { const m = statusMeta(s.c.health); return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>; } },
            ]}
          />
        </TerminalPanel>

        {/* RIGHT: SELECTED SETUP */}
        <div className="lg:sticky lg:top-2">
          {((s: DerivedSetup | null) => {
            if (!s) {
              return (
                <TerminalPanel title="Selected Setup">
                  <div className="flex flex-col items-center gap-2 py-8 text-center">
                    <Crosshair className="h-5 w-5 text-[var(--text-faint)]" aria-hidden="true" />
                    <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Select a setup</span>
                    <p className="text-[10px] text-[var(--text-faint)]">Pick a row to see its idea, rationale, risk, and trade plan.</p>
                  </div>
                </TerminalPanel>
              );
            }
            const rank = rankedSetups.findIndex((x) => x.c.id === s.c.id) + 1;
            const rr = computeRR(s);
            const prob = Math.min(99, Math.max(1, Math.abs(s.c.delta ?? 0) * 100));
            const target1 = typeof s.c.t1 === 'number' && s.c.t1 > 0 ? s.c.t1 : null;
            const stopPremium = s.premium * (1 - WORKING_STOP_PCT / 100);
            const dirColor = s.direction === 'BULLISH' ? 'text-[#2f9d45]' : 'text-[#d94646]';
            const asset = ASSET_LIST.find((a) => a.ticker === s.c.ticker);
            const expiry = SHELF_EXPIRY[s.c.shelf] ?? '0DTE';
            const horizon = (SHELF_EXPLANATIONS[s.c.shelf as keyof typeof SHELF_EXPLANATIONS] ?? SHELF_EXPLANATIONS.all).horizon;
            const st = statusMeta(s.c.health);
            const DirIcon = s.direction === 'BULLISH' ? TrendingUp : TrendingDown;
            return (
              <TerminalPanel
                title="Selected Setup"
                bodyClassName="!p-3.5 space-y-3"
              >
                {/* identity */}
                <div className="flex items-start justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <DirIcon className={`h-5 w-5 shrink-0 ${dirColor}`} />
                    <div className="min-w-0">
                      <span className="block text-[18px] font-bold leading-none text-[var(--text-primary)] slayer-num truncate">#{rank} · {s.label}</span>
                      <span className="mt-1 block text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)] truncate">{asset?.name ?? s.c.ticker}</span>
                    </div>
                  </div>
                  <StatusBadge tone={st.tone} className="shrink-0">{s.direction === 'BULLISH' ? 'Bull' : 'Bear'}</StatusBadge>
                </div>

                {/* contract idea / strike / expiry */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { l: 'Contract Idea', v: `Long ${s.side === 'C' ? 'Call' : 'Put'}` },
                    { l: 'Strike', v: fmtNum(s.c.strike) },
                    { l: 'Expiry', v: expiry },
                  ].map((x) => (
                    <div key={x.l} className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] px-2.5 py-1.5">
                      <span className="block text-[8px] uppercase tracking-[0.14em] text-[var(--text-muted)]">{x.l}</span>
                      <span className="block slayer-num text-[12px] font-semibold text-[var(--text-primary)]">{x.v}</span>
                    </div>
                  ))}
                </div>

                {/* rationale */}
                <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] p-2.5">
                  <span className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]"><ShieldCheck className="h-3 w-3 text-[#2f9d45]" />Setup Rationale</span>
                  <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-secondary)]">{s.c.narrative}</p>
                  <p className="mt-1.5 text-[9px] uppercase tracking-[0.1em] text-[var(--text-faint)]">{s.dealerSupport}</p>
                </div>

                {/* probability & confidence */}
                <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] p-2.5 space-y-2.5">
                  <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Probability &amp; Confidence</span>
                  <LabeledMeter label="Probability (Δ-implied ITM)" pct={prob} tone="var(--pin)" />
                  <LabeledMeter label="Model confidence" pct={s.c.health} tone={confColor(s.c.health)} />
                </div>

                {/* expected move + target range */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] px-2.5 py-1.5">
                    <span className="block text-[8px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Expected Move</span>
                    <span className="block slayer-num text-[13px] font-semibold text-[var(--pin)]">±{s.expectedMovePct.toFixed(0)}%</span>
                  </div>
                  <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] px-2.5 py-1.5">
                    <span className="block text-[8px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Target Range</span>
                    <span className="block slayer-num text-[13px] font-semibold text-[var(--text-primary)]">${s.premium.toFixed(2)} → ${(target1 ?? s.fairValue).toFixed(2)}</span>
                  </div>
                </div>

                {/* risk parameters */}
                <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] p-2.5">
                  <span className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]"><AlertTriangle className="h-3 w-3 text-[#d94646]" />Risk Parameters</span>
                  <div className="mt-1.5 space-y-1 text-[11px]">
                    <div className="flex items-center justify-between gap-2"><span className="text-[var(--text-muted)]">Max Risk</span><span className="slayer-num text-[var(--text-primary)]">${(s.premium * 100).toFixed(0)} / contract</span></div>
                    <div className="flex items-center justify-between gap-2"><span className="text-[var(--text-muted)]">Stop / Invalidation</span><span className="slayer-num text-[#d94646]">{s.side === 'C' ? 'Below' : 'Above'} {s.invalidation.toLocaleString()}</span></div>
                    <div className="flex items-start justify-between gap-2"><span className="text-[var(--text-muted)]">Invalidation Reason</span><span className="text-right text-[var(--text-secondary)]">{s.dealerSupport} fails</span></div>
                  </div>
                </div>

                {/* trade plan */}
                <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] p-2.5">
                  <span className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]"><Droplet className="h-3 w-3 text-[var(--pin)]" />Trade Plan</span>
                  <div className="mt-1.5 space-y-1 text-[11px]">
                    <div className="flex items-center justify-between gap-2"><span className="text-[var(--text-muted)]">Entry</span><span className="slayer-num text-[var(--text-primary)]">${s.premium.toFixed(2)} <span className="text-[9px] text-[var(--text-faint)]">(${(s.c.bid ?? s.premium).toFixed(2)}–${(s.c.ask ?? s.premium).toFixed(2)})</span></span></div>
                    <div className="flex items-center justify-between gap-2"><span className="text-[var(--text-muted)]">Target 1</span><span className={`slayer-num ${target1 != null && target1 < s.premium ? 'text-[#d94646]' : 'text-[#2f9d45]'}`}>{target1 == null ? '—' : `$${target1.toFixed(2)} (${target1 >= s.premium ? '+' : '−'}${Math.abs(((target1 - s.premium) / s.premium) * 100).toFixed(0)}%)`}</span></div>
                    <div className="flex items-center justify-between gap-2"><span className="text-[var(--text-muted)]">Target 2 (fair value)</span><span className={`slayer-num ${s.fairGapPct < 0 ? 'text-[#d94646]' : 'text-[#2f9d45]'}`}>${s.fairValue.toFixed(2)} ({s.fairGapPct >= 0 ? '+' : '−'}{Math.abs(s.fairGapPct * 100).toFixed(0)}%)</span></div>
                    <div className="flex items-center justify-between gap-2"><span className="text-[var(--text-muted)]">Stop</span><span className="slayer-num text-[#d94646]">${stopPremium.toFixed(2)} (−{WORKING_STOP_PCT}%)</span></div>
                    <div className="flex items-center justify-between gap-2"><span className="text-[var(--text-muted)]">Time Stop</span><span className="text-[var(--text-secondary)]">{horizon}</span></div>
                    <div className="flex items-start justify-between gap-2"><span className="text-[var(--text-muted)]">R / R</span><span className="slayer-num text-[var(--text-primary)]">{rr == null ? '—' : `${rr.toFixed(1)} : 1`}</span></div>
                  </div>
                  <p className="mt-2 border-t border-[var(--border-subtle)] pt-2 text-[10px] leading-relaxed text-[var(--text-secondary)]">
                    Take partial at Target 1; trail the stop to entry after +{WORKING_STOP_PCT}% and hold the balance toward Target 2 (model fair value). Working stop is −{WORKING_STOP_PCT}% of premium.
                  </p>
                </div>

                {/* actions */}
                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  {selectedTracked ? (
                    <button
                      onClick={() => useContractStore.getState().setActiveTab('auditor', true)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-md border border-[#2f9d45]/50 bg-[var(--positive-soft)] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#2f9d45] transition-colors hover:border-[#2f9d45]"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />In Queue
                    </button>
                  ) : (
                    <button
                      onClick={() => addToQueue(s)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-md border border-[var(--border-mid)] bg-[var(--bg-panel-soft)] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)]"
                    >
                      <Plus className="h-3.5 w-3.5" />Add to Queue
                    </button>
                  )}
                  <button
                    onClick={() => reviewSetup(s)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-md border border-[#2f9d45]/40 bg-[var(--positive-soft)] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#2f9d45] transition-colors hover:border-[#2f9d45]"
                  >
                    Trade This Setup<ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </TerminalPanel>
            );
          })(selectedSetup)}
        </div>
      </div>

      {/* BOTTOM — market regime · setup distribution · watchlist/queue */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">

        {/* MARKET REGIME */}
        <TerminalPanel title="Market Regime" subtitle="Derived from ranked setups + tape">
          <div className="grid grid-cols-2 gap-2">
            {[
              { name: 'Trend / Bias', st: regime.trend },
              { name: 'Tape', st: regime.tape },
              { name: 'Volatility', st: regime.vol },
              { name: 'Liquidity', st: regime.liqState },
            ].map((r) => (
              <div key={r.name} className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] px-2.5 py-2">
                <div className="text-[9px] uppercase tracking-[0.14em] text-[var(--text-muted)]">{r.name}</div>
                <div className="mt-1.5"><StatusBadge tone={r.st.tone}>{r.st.label}</StatusBadge></div>
              </div>
            ))}
          </div>
          <p className="mt-3 border-t border-[var(--border-subtle)] pt-2.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">{regime.insight}</p>
          <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-[var(--border-subtle)] bg-[var(--border-subtle)] sm:grid-cols-4">
            {[
              { l: 'Put / Call', v: regime.pcRatio.toFixed(2), tone: 'text-[var(--text-primary)]' },
              { l: 'Avg Exp Move', v: `±${regime.avgMove.toFixed(0)}%`, tone: 'text-[var(--pin)]' },
              { l: 'Net GEX', v: `${globalGex.toFixed(0)}B`, tone: globalGex >= 0 ? 'text-[#2f9d45]' : 'text-[#d94646]' },
              { l: 'Scan Rate', v: `${scanRate.toFixed(1)}/s`, tone: 'text-[var(--text-primary)]' },
            ].map((x) => (
              <div key={x.l} className="bg-[var(--bg-panel)] px-2.5 py-2">
                <div className="text-[8px] uppercase tracking-[0.14em] text-[var(--text-muted)] truncate">{x.l}</div>
                <div className={`mt-0.5 slayer-num text-[14px] font-semibold ${x.tone}`}>{x.v}</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[9px] uppercase tracking-[0.12em] text-[var(--text-faint)]">Net GEX &amp; scan rate are streamed sample metrics.</p>
        </TerminalPanel>

        {/* SETUP DISTRIBUTION */}
        <TerminalPanel title="Setup Distribution" subtitle="By bias · by strategy">
          <div className="flex items-center gap-4">
            <Donut segments={distribution.segments} />
            <div className="flex-1 space-y-1.5">
              {distribution.segments.map((seg) => (
                <div key={seg.label} className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5 text-[var(--text-secondary)]"><span className="h-2 w-2 rounded-sm" style={{ background: seg.color }} />{seg.label}</span>
                  <span className="slayer-num text-[var(--text-primary)]">{seg.value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 space-y-2 border-t border-[var(--border-subtle)] pt-3">
            {distribution.byStrategy.length === 0 ? (
              <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-faint)]">No setups in view.</p>
            ) : distribution.byStrategy.map((row) => (
              <div key={row.label}>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="uppercase tracking-[0.08em] text-[var(--text-secondary)]">{row.label}</span>
                  <span className="slayer-num text-[var(--text-muted)]">{row.value}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--border-subtle)]">
                  <span className="block h-full rounded-full bg-[var(--pin)]" style={{ width: `${distribution.maxStrategy ? (row.value / distribution.maxStrategy) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </TerminalPanel>

        {/* WATCHLIST / QUEUE */}
        <TerminalPanel
          title="Watchlist / Queue"
          bodyClassName="!p-0"
          actions={(
            <div className="flex items-center gap-0.5 rounded-md border border-[var(--border-subtle)] p-0.5">
              {(['watchlist', 'queue'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setWatchQueueTab(t)}
                  className={`rounded px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] transition-colors ${watchQueueTab === t ? 'bg-[var(--bg-panel-raised)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
                >
                  {t === 'watchlist' ? `Watchlist ${watchlistRows.length}` : `Queue ${queueRows.length}`}
                </button>
              ))}
            </div>
          )}
        >
          <div className="max-h-[300px] overflow-y-auto">
            {watchQueueTab === 'queue' ? (
              queueRows.length === 0 ? (
                <p className="px-3 py-6 text-center text-[10px] uppercase tracking-[0.12em] text-[var(--text-faint)]">No setups queued. Add one from a selected setup.</p>
              ) : queueRows.map((t) => (
                <div key={t.id} className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-3 py-2 text-[11px]">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[var(--text-primary)] slayer-num">{t.contract}</div>
                    <div className="text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)]">{STATUS_LABEL[t.status]} · conf {t.confidence}%</div>
                  </div>
                  <span className="slayer-num text-[10px] text-[var(--pin)]">±{t.expectedMovePct != null ? t.expectedMovePct.toFixed(0) : '—'}%</span>
                  <button onClick={() => cancelTrack(t.id)} aria-label="Remove from queue" className="text-[var(--text-faint)] transition-colors hover:text-[#d94646]"><X className="h-3 w-3" /></button>
                </div>
              ))
            ) : (
              watchlistRows.length === 0 ? (
                <p className="px-3 py-6 text-center text-[10px] uppercase tracking-[0.12em] text-[var(--text-faint)]">Star a symbol in the table to build your watchlist.</p>
              ) : watchlistRows.map((s) => (
                <button
                  key={s.c.id}
                  onClick={() => setSelectedSetupId(s.c.id)}
                  className="flex w-full items-center gap-2 border-b border-[var(--border-subtle)] px-3 py-2 text-left text-[11px] transition-colors hover:bg-[var(--bg-panel-soft)]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[var(--text-primary)] slayer-num">{s.label}</div>
                    <div className="text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)]">{SETUP_LABEL[s.c.shelf] ?? s.c.shelf} · conf {s.c.health}%</div>
                  </div>
                  <span className="slayer-num text-[10px] text-[var(--pin)]">±{s.expectedMovePct.toFixed(0)}%</span>
                  <Star className="h-3 w-3 shrink-0" fill="var(--warning)" stroke="var(--warning)" aria-hidden="true" />
                </button>
              ))
            )}
          </div>
          {watchQueueTab === 'queue' && queueRows.length > 0 && (
            <button
              onClick={() => useContractStore.getState().setActiveTab('auditor', true)}
              className="w-full border-t border-[var(--border-subtle)] px-3 py-2 text-center text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
            >
              Open Trade History →
            </button>
          )}
        </TerminalPanel>
      </div>

      {/* STATUS BAR */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-4 py-2.5 text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
        <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" />Last scan <span className="slayer-num normal-case text-[var(--text-secondary)]">{formatTime(new Date(metricsAsOf))}</span></span>
        <span className="flex items-center gap-1.5"><Layers className="h-3 w-3" />Source <span className="text-[var(--text-secondary)]">Sample stream</span></span>
        <span className="flex items-center gap-1.5"><Signal className="h-3 w-3" />Feed <span className={feedError ? 'text-[var(--warning)]' : 'text-[#2f9d45]'}>{feedError ? 'Reconnecting' : 'Streaming'}</span></span>
        <span className="flex items-center gap-1.5"><Activity className="h-3 w-3" />Scanned <span className="slayer-num text-[var(--text-secondary)]">{contracts.length}</span> · Universe <span className="slayer-num text-[var(--text-secondary)]">{UNIVERSE_OPTS.length - 1}</span> · Scans <span className="slayer-num text-[var(--text-secondary)]">{scanHistoryCount}</span></span>
        <span className="flex items-center gap-2">Auto-refresh
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            role="switch"
            aria-checked={autoRefresh}
            aria-label="Toggle auto-refresh"
            className={`relative h-4 w-7 rounded-full transition-colors ${autoRefresh ? 'bg-[var(--positive)]' : 'bg-[var(--border-mid)]'}`}
          >
            <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-[var(--text-primary)] transition-all ${autoRefresh ? 'left-3.5' : 'left-0.5'}`} />
          </button>
        </span>
      </div>

      {/* METHOD MODAL — education on demand */}
      <AnimatePresence>
        {isStrategyExpanded && (
          <motion.div
            className="fixed inset-0 z-[9000] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label="How this scan category works"
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setIsStrategyExpanded(false)} />
            <motion.div
              initial={{ scale: 0.97, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.97, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="slayer-panel relative w-full max-w-lg p-5 text-left"
            >
              <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <Info className="h-4 w-4 text-[var(--pin)] shrink-0" />
                  <span className="truncate text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-primary)]">Method · {currentManualText.title}</span>
                </div>
                <button onClick={() => setIsStrategyExpanded(false)} aria-label="Close" className="shrink-0 rounded p-1 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-3 text-[12px] font-medium leading-relaxed text-[var(--text-secondary)]">{currentManualText.whyItsBest}</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] px-2.5 py-1.5">
                  <span className="block text-[8px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Horizon</span>
                  <span className="block slayer-num text-[10px] font-bold text-[var(--text-primary)]">{currentManualText.horizon}</span>
                </div>
                <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] px-2.5 py-1.5">
                  <span className="block text-[8px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Signal</span>
                  <span className="block text-[9px] font-bold uppercase leading-tight text-[var(--pin)]">{currentManualText.mathTracking}</span>
                </div>
                <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] px-2.5 py-1.5">
                  <span className="block text-[8px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Confidence</span>
                  <span className="block text-[9px] font-bold leading-tight text-[#2f9d45]">{currentManualText.confidenceTier}</span>
                </div>
              </div>
              <p className="mt-3 border-t border-[var(--border-subtle)] pt-2 text-[9px] uppercase tracking-[0.14em] text-[var(--text-faint)]">Sample data — illustrative, not a live scan.</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
